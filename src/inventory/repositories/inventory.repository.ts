import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface UpsertInventoryItemData {
  posConfigId: number;
  productId: number;
  quantity: number;
  updatedByEmail: string;
}

// Único acceso a datos permitido a la colección store_inventory_items —
// el resto de la app pasa siempre por InventoryService, nunca por Prisma
// directo (ver CLAUDE.md, Repository Pattern).
@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyForStore(posConfigId: number) {
    return this.prisma.storeInventoryItem.findMany({ where: { posConfigId } });
  }

  // Un doc por tienda+producto (índice único en el schema) — si ya existe
  // una cantidad capturada para ese producto en esa tienda, se sobreescribe.
  upsert(data: UpsertInventoryItemData) {
    return this.prisma.storeInventoryItem.upsert({
      where: {
        posConfigId_productId: {
          posConfigId: data.posConfigId,
          productId: data.productId,
        },
      },
      update: { quantity: data.quantity, updatedByEmail: data.updatedByEmail },
      create: data,
    });
  }

  // El frontend siempre manda un lote (aunque sea de un solo producto) —
  // mismo criterio que GoalsRepository.upsertMany.
  upsertMany(entries: UpsertInventoryItemData[]) {
    return Promise.all(entries.map((entry) => this.upsert(entry)));
  }
}
