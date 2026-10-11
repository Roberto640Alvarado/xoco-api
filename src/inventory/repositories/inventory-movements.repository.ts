import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  InventoryMovementStatus,
  InventoryMovementType,
  Role,
  StoreInventoryMovement,
} from '../../generated/prisma/index.js';

export interface CreateMovementData {
  posConfigId: number;
  productId: number;
  type: InventoryMovementType;
  quantity: number;
  note: string | null;
  status: InventoryMovementStatus;
  registeredByEmail: string;
  registeredByRole: Role;
}

// Único acceso a datos permitido a la colección store_inventory_movements
// — el resto de la app pasa siempre por InventoryMovementsService, nunca
// por Prisma directo (ver CLAUDE.md, Repository Pattern).
@Injectable()
export class InventoryMovementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateMovementData): Promise<StoreInventoryMovement> {
    return this.prisma.storeInventoryMovement.create({
      data:
        data.status === InventoryMovementStatus.CONFIRMADO
          ? { ...data, resolvedByEmail: data.registeredByEmail, resolvedAt: new Date() }
          : data,
    });
  }

  findManyForStore(posConfigId: number): Promise<StoreInventoryMovement[]> {
    return this.prisma.storeInventoryMovement.findMany({
      where: { posConfigId },
      orderBy: { occurredAt: 'desc' },
    });
  }

  // Movimientos CONFIRMADOS de la tienda desde `sinceDate` en adelante —
  // lo que InventoryService resta de estimatedQuantity, mismo criterio
  // que findUnitsSoldSince con las ventas de Odoo.
  findConfirmedSince(posConfigId: number, sinceDate: Date): Promise<StoreInventoryMovement[]> {
    return this.prisma.storeInventoryMovement.findMany({
      where: {
        posConfigId,
        status: InventoryMovementStatus.CONFIRMADO,
        occurredAt: { gte: sinceDate },
      },
    });
  }

  // Todos los movimientos (cualquier estado) dentro de [from, to] — el
  // Registro de entradas y salidas los muestra todos, con su estado.
  findForLedger(posConfigId: number, from: Date, to: Date, productId?: number): Promise<StoreInventoryMovement[]> {
    return this.prisma.storeInventoryMovement.findMany({
      where: { posConfigId, occurredAt: { gte: from, lte: to }, ...(productId ? { productId } : {}) },
    });
  }

  async findByIdOrThrow(id: string): Promise<StoreInventoryMovement> {
    const movement = await this.prisma.storeInventoryMovement.findUnique({ where: { id } });
    if (!movement) throw new NotFoundException('Movimiento no encontrado.');
    return movement;
  }

  resolve(
    id: string,
    status: InventoryMovementStatus,
    resolvedByEmail: string,
  ): Promise<StoreInventoryMovement> {
    return this.prisma.storeInventoryMovement.update({
      where: { id },
      data: { status, resolvedByEmail, resolvedAt: new Date() },
    });
  }

  // Exclusivo del flujo ENTRADA: el Vendedor marca que el envío llegó e
  // ingresa la cantidad real (ver InventoryMovementsService.receive) —
  // todavía no resuelve el movimiento, solo lo deja listo para que
  // Admin/Finanzas lo confirme o rechace con ese dato a la vista.
  markReceived(id: string, receivedQuantity: number): Promise<StoreInventoryMovement> {
    return this.prisma.storeInventoryMovement.update({
      where: { id },
      data: { status: InventoryMovementStatus.RECIBIDO, receivedQuantity },
    });
  }
}
