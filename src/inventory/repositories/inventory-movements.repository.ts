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

export interface CreateConfirmedEntryData {
  posConfigId: number;
  productId: number;
  quantity: number;
  note: string;
  occurredAt: Date;
  stockRequestId: string;
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

  // Movimientos abiertos (merma/regalía/degustación) de TODAS las tiendas,
  // más recientes primero — la bandeja de Admin/Finanzas.
  findOpen(statuses: InventoryMovementStatus[]): Promise<StoreInventoryMovement[]> {
    return this.prisma.storeInventoryMovement.findMany({
      where: { status: { in: statuses }, type: { not: InventoryMovementType.ENTRADA } },
      orderBy: { occurredAt: 'desc' },
    });
  }

  // Cuántos merma/regalía/degustación esperan que Admin/Finanzas los
  // confirme, en todas las tiendas.
  countPending(): Promise<number> {
    return this.prisma.storeInventoryMovement.count({
      where: { status: InventoryMovementStatus.PENDIENTE, type: { not: InventoryMovementType.ENTRADA } },
    });
  }

  // Lo que `registeredByEmail` reportó y Admin/Finanzas ya confirmó o
  // rechazó después de `since` — la novedad "resuelto" del Vendedor.
  countResolvedSince(posConfigId: number, registeredByEmail: string, since: Date): Promise<number> {
    return this.prisma.storeInventoryMovement.count({
      where: {
        posConfigId,
        registeredByEmail,
        type: { not: InventoryMovementType.ENTRADA },
        status: { in: [InventoryMovementStatus.CONFIRMADO, InventoryMovementStatus.RECHAZADO] },
        resolvedAt: { gt: since },
      },
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
    rejectionReason?: string,
  ): Promise<StoreInventoryMovement> {
    return this.prisma.storeInventoryMovement.update({
      where: { id },
      data: { status, resolvedByEmail, resolvedAt: new Date(), ...(rejectionReason ? { rejectionReason } : {}) },
    });
  }

  // Entradas de stock que llegan al confirmar la tienda una solicitud
  // recibida: ya nacen CONFIRMADAS (lo que llegó es lo que suma).
  createManyConfirmedEntries(entries: CreateConfirmedEntryData[]) {
    const now = new Date();
    return this.prisma.storeInventoryMovement.createMany({
      data: entries.map((entry) => ({
        posConfigId: entry.posConfigId,
        productId: entry.productId,
        type: InventoryMovementType.ENTRADA,
        quantity: entry.quantity,
        receivedQuantity: entry.quantity,
        note: entry.note,
        occurredAt: entry.occurredAt,
        status: InventoryMovementStatus.CONFIRMADO,
        registeredByEmail: entry.registeredByEmail,
        registeredByRole: entry.registeredByRole,
        resolvedByEmail: entry.registeredByEmail,
        resolvedAt: now,
        stockRequestId: entry.stockRequestId,
      })),
    });
  }
}
