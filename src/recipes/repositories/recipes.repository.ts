import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StoreRecipe } from '../../generated/prisma/index.js';

interface SaveRecipeData {
  posConfigId: number;
  productId: number;
  productName: string;
  components: { productId: number; productName: string; unit: string; quantity: number }[];
  updatedByEmail: string;
}

// Único acceso a datos permitido a store_recipes (ver CLAUDE.md, Repository Pattern).
@Injectable()
export class RecipesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findForStore(posConfigId: number): Promise<StoreRecipe[]> {
    return this.prisma.storeRecipe.findMany({ where: { posConfigId }, orderBy: { productName: 'asc' } });
  }

  upsert(data: SaveRecipeData): Promise<StoreRecipe> {
    const { posConfigId, productId, ...rest } = data;
    return this.prisma.storeRecipe.upsert({
      where: { posConfigId_productId: { posConfigId, productId } },
      create: { posConfigId, productId, ...rest },
      update: { productName: rest.productName, components: { set: rest.components }, updatedByEmail: rest.updatedByEmail },
    });
  }

  async remove(posConfigId: number, productId: number): Promise<boolean> {
    const result = await this.prisma.storeRecipe.deleteMany({ where: { posConfigId, productId } });
    return result.count > 0;
  }
}
