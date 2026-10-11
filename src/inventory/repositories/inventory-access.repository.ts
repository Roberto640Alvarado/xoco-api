import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StoreInventoryAccess } from '../../generated/prisma/index.js';

// Único acceso a datos permitido a la colección store_inventory_access —
// el resto de la app pasa siempre por InventoryAccessService (ver CLAUDE.md,
// Repository Pattern).
@Injectable()
export class InventoryAccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findEnabledPosConfigIds(): Promise<number[]> {
    const rows = await this.prisma.storeInventoryAccess.findMany({
      where: { enabled: true },
      select: { posConfigId: true },
    });
    return rows.map((row) => row.posConfigId);
  }

  async isEnabled(posConfigId: number): Promise<boolean> {
    const row = await this.prisma.storeInventoryAccess.findUnique({ where: { posConfigId } });
    return row?.enabled === true;
  }

  upsert(posConfigId: number, enabled: boolean, updatedByEmail: string): Promise<StoreInventoryAccess> {
    return this.prisma.storeInventoryAccess.upsert({
      where: { posConfigId },
      create: { posConfigId, enabled, updatedByEmail },
      update: { enabled, updatedByEmail },
    });
  }
}
