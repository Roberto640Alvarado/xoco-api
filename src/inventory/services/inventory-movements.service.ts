import { BadRequestException, Injectable } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { InventoryMovementsRepository } from '../repositories/inventory-movements.repository.js';
import { CreateInventoryMovementDto } from '../dto/create-inventory-movement.dto.js';
import { RejectMovementDto } from '../dto/reject-movement.dto.js';
import { InventoryMovementDoc } from '../doc/inventory-movement.doc.js';
import { InventoryMovementNotificationsDoc } from '../doc/inventory-movement-notifications.doc.js';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { InventoryAccessService } from './inventory-access.service.js';
import { InventoryMovementStatus, InventoryMovementType, Role, StoreInventoryMovement } from '../../generated/prisma/index.js';

// Entradas de stock que nacen de una solicitud recibida (ver
// StockRequestsService.receive): ya vienen confirmadas, porque la tienda
// acaba de confirmar lo que llegó.
export interface CreateConfirmedEntriesInput {
  posConfigId: number;
  stockRequestId: string;
  note: string;
  occurredAt: Date;
  entries: Array<{ productId: number; quantity: number }>;
  user: AuthenticatedUser;
}

// Movimientos manuales de Inventario (ver plan-history): merma, regalías y
// degustaciones (salidas). El stock que ENTRA de planta ya no se registra
// aquí a mano: llega con una solicitud recibida (createConfirmedEntries).
// Las ventas NO pasan por acá (ver el comentario del modelo en
// schema.prisma).
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

  // Una ENTRADA ya CONFIRMADA por cada producto recibido de una solicitud.
  // `quantity` y `receivedQuantity` valen lo mismo: lo que de verdad llegó
  // (InventoryService.estimateQuantity usa receivedQuantity ?? quantity).
  async createConfirmedEntries(input: CreateConfirmedEntriesInput): Promise<void> {
    await this.createConfirmed(InventoryMovementType.ENTRADA, input);
  }

  // Un TRASLADO ya CONFIRMADO por cada producto que una tienda despacha a
  // otra (solicitud entre tiendas): resta del inventario de la que envía.
  async createConfirmedTransfersOut(input: CreateConfirmedEntriesInput): Promise<void> {
    await this.createConfirmed(InventoryMovementType.TRASLADO, input);
  }

  private async createConfirmed(
    type: typeof InventoryMovementType.ENTRADA | typeof InventoryMovementType.TRASLADO,
    input: CreateConfirmedEntriesInput,
  ): Promise<void> {
    if (input.entries.length === 0) return;
    await this.repository.createManyConfirmedEntries(
      input.entries.map((entry) => ({
        type,
        posConfigId: input.posConfigId,
        productId: entry.productId,
        quantity: entry.quantity,
        note: input.note,
        occurredAt: input.occurredAt,
        stockRequestId: input.stockRequestId,
        registeredByEmail: input.user.email,
        registeredByRole: input.user.role,
      })),
    );
  }

  async findManyForStore(posConfigId: number): Promise<InventoryMovementDoc[]> {
    const movements = await this.repository.findManyForStore(posConfigId);
    const namesByProductId = await this.findProductNames(movements.map((movement) => movement.productId));
    return Promise.all(movements.map((movement) => this.toDoc(movement, namesByProductId.get(movement.productId))));
  }

  // Bandeja de Admin/Finanzas: merma/regalía/degustación PENDIENTES de
  // TODAS las tiendas.
  async findInbox(): Promise<InventoryMovementDoc[]> {
    const movements = await this.repository.findOpen([InventoryMovementStatus.PENDIENTE]);
    const namesByProductId = await this.findProductNames(movements.map((movement) => movement.productId));
    return Promise.all(movements.map((movement) => this.toDoc(movement, namesByProductId.get(movement.productId))));
  }

  // Las entradas ya no se confirman a mano: nacen confirmadas al recibir
  // una solicitud. Esto también frena un movimiento ENTRADA del flujo
  // anterior que haya quedado abierto.
  private assertNotEntry(movement: StoreInventoryMovement): void {
    if (movement.type === InventoryMovementType.TRASLADO) {
      throw new BadRequestException('Los traslados entre tiendas se confirman solos al despachar la solicitud.');
    }
    if (movement.type === InventoryMovementType.ENTRADA) {
      throw new BadRequestException(
        'Las entradas de stock ya no se confirman aquí: llegan con las solicitudes de Inventario → Solicitudes.',
      );
    }
  }

  async confirm(id: string, resolvedByEmail: string): Promise<InventoryMovementDoc> {
    const movement = await this.repository.findByIdOrThrow(id);
    this.assertNotEntry(movement);
    if (movement.status !== InventoryMovementStatus.PENDIENTE) {
      throw new BadRequestException('Este movimiento ya fue resuelto.');
    }
    const resolved = await this.repository.resolve(id, InventoryMovementStatus.CONFIRMADO, resolvedByEmail);
    return this.toDoc(resolved);
  }

  // Rechaza con motivo (obligatorio, lo ve el Vendedor).
  async reject(id: string, dto: RejectMovementDto, resolvedByEmail: string): Promise<InventoryMovementDoc> {
    const movement = await this.repository.findByIdOrThrow(id);
    this.assertNotEntry(movement);
    if (movement.status !== InventoryMovementStatus.PENDIENTE) {
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

  // Contador del aviso de Inventario → Movimientos. Admin/Finanzas: lo que
  // falta por atender en TODAS las tiendas. Vendedor: lo suyo que
  // Admin/Finanzas resolvió desde `sinceMovements`.
  async findNotifications(user: AuthenticatedUser, sinceMovements?: Date): Promise<InventoryMovementNotificationsDoc> {
    if (user.role !== Role.VENDEDOR) {
      const movements = await this.repository.countPending();
      return { total: movements, movements };
    }

    // Sin tienda, o con Inventario todavía no habilitado para ella, el
    // Vendedor no ve avisos (tampoco la sección).
    if (user.posConfigId == null || !(await this.accessService.isEnabledFor(user, user.posConfigId))) {
      return { total: 0, movements: 0 };
    }

    const defaultSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const movements = await this.repository.countResolvedSince(
      user.posConfigId,
      user.email,
      sinceMovements ?? defaultSince,
    );
    return { total: movements, movements };
  }
}
