import { BadRequestException, Injectable } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { InventoryMovementsRepository } from '../repositories/inventory-movements.repository.js';
import { InventoryAccessService } from './inventory-access.service.js';
import { CreateInventoryMovementDto } from '../dto/create-inventory-movement.dto.js';
import { MarkMovementReceivedDto } from '../dto/mark-movement-received.dto.js';
import { RejectMovementDto } from '../dto/reject-movement.dto.js';
import type { MovementsInboxKind } from '../dto/find-movements-inbox-query.dto.js';
import { InventoryMovementDoc } from '../doc/inventory-movement.doc.js';
import { InventoryMovementNotificationsDoc } from '../doc/inventory-movement-notifications.doc.js';
import { assertOwnStoreOrThrow } from '../../common/utils/assert-own-store.util.js';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { InventoryMovementStatus, InventoryMovementType, Role, StoreInventoryMovement } from '../../generated/prisma/index.js';

// Movimientos manuales de Inventario (ver plan-history): merma, regalías y
// degustaciones (salidas) y entradas = solicitudes de stock de la tienda a
// planta, con su propio flujo (PENDIENTE -> EN_CAMINO -> RECIBIDO ->
// CONFIRMADO). Las ventas NO pasan por acá (ver el comentario del modelo
// en schema.prisma).
@Injectable()
export class InventoryMovementsService {
  constructor(
    private readonly repository: InventoryMovementsRepository,
    private readonly odooService: OdooService,
    private readonly accessService: InventoryAccessService,
  ) {}

  // Resuelve el nombre de los productos de un lote de movimientos en UNA
  // sola llamada a Odoo (domain `id in [...]`) en vez de pedir el
  // catálogo completo — a diferencia de InventoryService.findItemsForStore
  // (que sí necesita TODO el catálogo para mostrar lo no contado), acá
  // solo hacen falta los productos que de verdad tienen un movimiento.
  private async findProductNames(productIds: number[]): Promise<Map<number, string>> {
    if (productIds.length === 0) return new Map();
    const products = await this.odooService.findProducts({
      domain: [['id', 'in', Array.from(new Set(productIds))]],
    });
    return new Map(products.map((product) => [product.id, product.display_name]));
  }

  private async toDoc(movement: StoreInventoryMovement, productName?: string): Promise<InventoryMovementDoc> {
    const name = productName ?? (await this.findProductNames([movement.productId])).get(movement.productId);
    return {
      id: movement.id,
      posConfigId: movement.posConfigId,
      productId: movement.productId,
      productName: name ?? 'Producto no encontrado en Odoo',
      type: movement.type,
      quantity: movement.quantity,
      receivedQuantity: movement.receivedQuantity,
      note: movement.note,
      occurredAt: movement.occurredAt,
      status: movement.status,
      registeredByEmail: movement.registeredByEmail,
      registeredByRole: movement.registeredByRole,
      resolvedByEmail: movement.resolvedByEmail,
      resolvedAt: movement.resolvedAt,
      acceptedByEmail: movement.acceptedByEmail,
      acceptedAt: movement.acceptedAt,
      rejectionReason: movement.rejectionReason,
    };
  }

  // SUPER_ADMIN/FINANZAS: queda CONFIRMADO de inmediato (misma persona
  // que ya hace el conteo físico hoy). VENDEDOR: queda PENDIENTE —
  // necesita que Admin/Finanzas lo confirme antes de que
  // InventoryService lo reste de estimatedQuantity (ver
  // InventoryMovementsRepository.findConfirmedSince).
  async create(
    posConfigId: number,
    dto: CreateInventoryMovementDto,
    user: AuthenticatedUser,
  ): Promise<InventoryMovementDoc> {
    const status =
      user.role === Role.VENDEDOR ? InventoryMovementStatus.PENDIENTE : InventoryMovementStatus.CONFIRMADO;

    const movement = await this.repository.create({
      posConfigId,
      productId: dto.productId,
      type: dto.type,
      quantity: dto.quantity,
      note: dto.note ?? null,
      status,
      registeredByEmail: user.email,
      registeredByRole: user.role,
    });

    return this.toDoc(movement);
  }

  async findManyForStore(posConfigId: number): Promise<InventoryMovementDoc[]> {
    const movements = await this.repository.findManyForStore(posConfigId);
    const namesByProductId = await this.findProductNames(movements.map((movement) => movement.productId));
    return Promise.all(movements.map((movement) => this.toDoc(movement, namesByProductId.get(movement.productId))));
  }

  // Bandeja de Admin/Finanzas: lo abierto de TODAS las tiendas. "requests"
  // son las solicitudes de stock (ENTRADA) — PENDIENTE (hay que aceptar o
  // rechazar), EN_CAMINO (esperando que la tienda lo reciba) y RECIBIDO
  // (hay que confirmar); "movements" son merma/regalía/degustación
  // PENDIENTES.
  async findInbox(kind: MovementsInboxKind): Promise<InventoryMovementDoc[]> {
    const entrada = kind === 'requests';
    const statuses = entrada
      ? [InventoryMovementStatus.PENDIENTE, InventoryMovementStatus.EN_CAMINO, InventoryMovementStatus.RECIBIDO]
      : [InventoryMovementStatus.PENDIENTE];
    const movements = await this.repository.findOpen(entrada, statuses);
    const namesByProductId = await this.findProductNames(movements.map((movement) => movement.productId));
    return Promise.all(movements.map((movement) => this.toDoc(movement, namesByProductId.get(movement.productId))));
  }

  // Confirma un movimiento. Merma/regalía/degustación: desde PENDIENTE.
  // ENTRADA: solo desde RECIBIDO — el stock se suma recién cuando la tienda
  // ya dijo cuánto llegó (si no pasó por ahí, primero hay que aceptar la
  // solicitud y esperar la recepción).
  async confirm(id: string, resolvedByEmail: string): Promise<InventoryMovementDoc> {
    const movement = await this.repository.findByIdOrThrow(id);
    const expected =
      movement.type === InventoryMovementType.ENTRADA
        ? InventoryMovementStatus.RECIBIDO
        : InventoryMovementStatus.PENDIENTE;
    if (movement.status !== expected) {
      throw new BadRequestException(
        movement.type === InventoryMovementType.ENTRADA
          ? 'Solo se puede confirmar una entrada cuando la tienda ya la marcó como recibida.'
          : 'Este movimiento ya fue resuelto.',
      );
    }
    const resolved = await this.repository.resolve(id, InventoryMovementStatus.CONFIRMADO, resolvedByEmail);
    return this.toDoc(resolved);
  }

  // Rechaza con motivo (obligatorio, lo ve el Vendedor). Se puede rechazar
  // mientras siga abierto: PENDIENTE, EN_CAMINO o RECIBIDO.
  async reject(id: string, dto: RejectMovementDto, resolvedByEmail: string): Promise<InventoryMovementDoc> {
    const movement = await this.repository.findByIdOrThrow(id);
    const open: InventoryMovementStatus[] = [
      InventoryMovementStatus.PENDIENTE,
      InventoryMovementStatus.EN_CAMINO,
      InventoryMovementStatus.RECIBIDO,
    ];
    if (!open.includes(movement.status)) {
      throw new BadRequestException('Este movimiento ya fue resuelto.');
    }
    const rejected = await this.repository.resolve(
      id,
      InventoryMovementStatus.RECHAZADO,
      resolvedByEmail,
      dto.reason.trim(),
    );
    return this.toDoc(rejected);
  }

  // Admin/Finanzas acepta una solicitud de stock: el envío va en camino.
  // Todavía NO suma al stock — eso pasa al confirmar la recepción.
  async accept(id: string, acceptedByEmail: string): Promise<InventoryMovementDoc> {
    const movement = await this.repository.findByIdOrThrow(id);
    if (movement.type !== InventoryMovementType.ENTRADA) {
      throw new BadRequestException('Solo las solicitudes de stock (entradas) se aceptan; las demás se confirman.');
    }
    if (movement.status !== InventoryMovementStatus.PENDIENTE) {
      throw new BadRequestException('Esta solicitud ya fue aceptada o resuelta.');
    }
    const accepted = await this.repository.markAccepted(id, acceptedByEmail);
    return this.toDoc(accepted);
  }

  // Exclusivo de ENTRADA: el Vendedor (o Admin/Finanzas, si lo hace por
  // él) marca que el envío llegó e ingresa la cantidad real — solo después
  // de que Admin/Finanzas aceptó la solicitud (EN_CAMINO). Pasa a RECIBIDO,
  // no a CONFIRMADO: todavía necesita la confirmación de Admin/Finanzas
  // para sumarse al stock.
  async receive(
    id: string,
    dto: MarkMovementReceivedDto,
    user: AuthenticatedUser,
  ): Promise<InventoryMovementDoc> {
    const movement = await this.repository.findByIdOrThrow(id);
    assertOwnStoreOrThrow(user, movement.posConfigId);
    await this.accessService.assertEnabledFor(user, movement.posConfigId);

    if (movement.type !== InventoryMovementType.ENTRADA) {
      throw new BadRequestException('Solo los movimientos de entrada se pueden marcar como recibidos.');
    }
    if (movement.status !== InventoryMovementStatus.EN_CAMINO) {
      throw new BadRequestException(
        movement.status === InventoryMovementStatus.PENDIENTE
          ? 'Esta solicitud todavía no fue aceptada: no se puede marcar como recibida.'
          : 'Este movimiento ya fue recibido o resuelto.',
      );
    }

    const received = await this.repository.markReceived(id, dto.receivedQuantity);
    return this.toDoc(received);
  }

  // Contadores de los avisos del menú. Admin/Finanzas: lo que falta por
  // atender en TODAS las tiendas. Vendedor: en su tienda, los envíos en
  // camino por recibir y lo suyo que Admin/Finanzas resolvió desde `since*`.
  async findNotifications(
    user: AuthenticatedUser,
    sinceMovements?: Date,
    sinceRequests?: Date,
  ): Promise<InventoryMovementNotificationsDoc> {
    if (user.role !== Role.VENDEDOR) {
      const [movements, requests] = await Promise.all([
        this.repository.countByStatuses(false, [InventoryMovementStatus.PENDIENTE]),
        this.repository.countByStatuses(true, [InventoryMovementStatus.PENDIENTE, InventoryMovementStatus.RECIBIDO]),
      ]);
      return { total: movements + requests, movements, requests };
    }

    // Sin tienda, o con Inventario todavía no habilitado para ella, el
    // Vendedor no ve avisos (tampoco la sección).
    if (user.posConfigId == null || !(await this.accessService.isEnabledFor(user, user.posConfigId))) {
      return { total: 0, movements: 0, requests: 0 };
    }

    const defaultSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [movements, inTransit, requestsResolved] = await Promise.all([
      this.repository.countResolvedSince(false, user.posConfigId, user.email, sinceMovements ?? defaultSince),
      this.repository.countByStatuses(true, [InventoryMovementStatus.EN_CAMINO], user.posConfigId),
      this.repository.countResolvedSince(true, user.posConfigId, user.email, sinceRequests ?? defaultSince),
    ]);
    const requests = inTransit + requestsResolved;
    return { total: movements + requests, movements, requests };
  }
}
