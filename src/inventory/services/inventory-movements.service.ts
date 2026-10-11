import { BadRequestException, Injectable } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { InventoryMovementsRepository } from '../repositories/inventory-movements.repository.js';
import { CreateInventoryMovementDto } from '../dto/create-inventory-movement.dto.js';
import { InventoryMovementDoc } from '../doc/inventory-movement.doc.js';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { InventoryMovementStatus, Role, StoreInventoryMovement } from '../../generated/prisma/index.js';

// Segundo tramo de Inventario (ver plan-history): merma, regalías y
// degustaciones — las ventas NO pasan por acá (ver el comentario del
// modelo en schema.prisma). "Entradas" (envíos planta→tienda) quedan
// para un tramo futuro.
@Injectable()
export class InventoryMovementsService {
  constructor(
    private readonly repository: InventoryMovementsRepository,
    private readonly odooService: OdooService,
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
      note: movement.note,
      occurredAt: movement.occurredAt,
      status: movement.status,
      registeredByEmail: movement.registeredByEmail,
      registeredByRole: movement.registeredByRole,
      resolvedByEmail: movement.resolvedByEmail,
      resolvedAt: movement.resolvedAt,
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

  // `status` siempre es CONFIRMADO o RECHAZADO acá (nunca PENDIENTE) —
  // lo imponen los dos únicos callers (confirm/reject más abajo), no el
  // tipo: el enum generado por Prisma no se puede acotar a un
  // subconjunto de miembros en una posición de tipo.
  private async resolve(
    id: string,
    status: InventoryMovementStatus,
    resolvedByEmail: string,
  ): Promise<InventoryMovementDoc> {
    const movement = await this.repository.findByIdOrThrow(id);
    if (movement.status !== InventoryMovementStatus.PENDIENTE) {
      throw new BadRequestException('Este movimiento ya fue resuelto.');
    }
    const resolved = await this.repository.resolve(id, status, resolvedByEmail);
    return this.toDoc(resolved);
  }

  confirm(id: string, resolvedByEmail: string): Promise<InventoryMovementDoc> {
    return this.resolve(id, InventoryMovementStatus.CONFIRMADO, resolvedByEmail);
  }

  reject(id: string, resolvedByEmail: string): Promise<InventoryMovementDoc> {
    return this.resolve(id, InventoryMovementStatus.RECHAZADO, resolvedByEmail);
  }
}
