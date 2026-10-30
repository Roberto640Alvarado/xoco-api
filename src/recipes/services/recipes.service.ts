import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { fetchAllOdooPages } from '../../common/utils/odoo-pagination.util.js';
import { isWeightUom } from '../../common/utils/product-uom.util.js';
import { productCategoryName } from '../../common/utils/product-category.util.js';
import { StoreRecipe } from '../../generated/prisma/index.js';
import { RecipesRepository } from '../repositories/recipes.repository.js';
import { UpsertRecipeDto } from '../dto/upsert-recipe.dto.js';
import { RecipeCatalogItemDoc, RecipeDoc } from '../doc/recipe.doc.js';
import { RecipeMap } from '../utils/expand-recipes.util.js';

const CATALOG_TTL_MS = 60_000;

type Unit = 'unidad' | 'kg';

// Recetas por tienda (ver StoreRecipe en schema.prisma): qué ingredientes
// gasta cada producto que se vende. Administración las edita; Inventario
// (Conteo, Registro y Kardex) las usa vía findRecipeMap para descontar los
// ingredientes en vez del producto vendido.
@Injectable()
export class RecipesService {
  private readonly logger = new Logger(RecipesService.name);
  private catalogCache: { items: RecipeCatalogItemDoc[]; expiresAt: number } | null = null;

  constructor(
    private readonly repository: RecipesRepository,
    private readonly odooService: OdooService,
  ) {}

  // Catálogo activo de Odoo con categoría y unidad, un minuto en memoria.
  async findCatalog(): Promise<RecipeCatalogItemDoc[]> {
    const now = Date.now();
    if (this.catalogCache && this.catalogCache.expiresAt > now) return this.catalogCache.items;
    const products = await fetchAllOdooPages(
      (options) => this.odooService.findProducts(options),
      [],
      'RecipesService.findCatalog',
      this.logger,
    );
    const items = products
      .map(
        (product): RecipeCatalogItemDoc => ({
          productId: product.id,
          productName: product.display_name,
          categoryName: productCategoryName(product.categ_id),
          unit: isWeightUom(product.uom_id) ? 'kg' : 'unidad',
        }),
      )
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'es') || a.productName.localeCompare(b.productName, 'es'));
    this.catalogCache = { items, expiresAt: now + CATALOG_TTL_MS };
    return items;
  }

  private toDoc(recipe: StoreRecipe): RecipeDoc {
    return {
      posConfigId: recipe.posConfigId,
      productId: recipe.productId,
      productName: recipe.productName,
      components: recipe.components.map((component) => ({
        productId: component.productId,
        productName: component.productName,
        unit: component.unit as Unit,
        quantity: component.quantity,
      })),
      updatedByEmail: recipe.updatedByEmail,
      updatedAt: recipe.updatedAt,
    };
  }

  async findForStore(posConfigId: number): Promise<RecipeDoc[]> {
    return (await this.repository.findForStore(posConfigId)).map((recipe) => this.toDoc(recipe));
  }

  /** Lo que usa Inventario para expandir las ventas de una tienda. */
  async findRecipeMap(posConfigId: number): Promise<RecipeMap> {
    const recipes = await this.repository.findForStore(posConfigId);
    return new Map(
      recipes.map((recipe) => [
        recipe.productId,
        {
          productName: recipe.productName,
          components: recipe.components.map((component) => ({
            productId: component.productId,
            productName: component.productName,
            quantity: component.quantity,
          })),
        },
      ]),
    );
  }

  private async assertStore(posConfigId: number): Promise<void> {
    const stores = await this.odooService.findPosConfigs({ domain: [['id', '=', posConfigId]] });
    if (stores.length === 0) throw new BadRequestException('La tienda seleccionada no es válida.');
  }

  // Una receta es de un solo nivel: el producto vendido no puede ser
  // ingrediente de otra receta y un ingrediente no puede tener receta.
  private assertOneLevel(recipes: { productId: number; productName: string; componentIds: number[] }[]): void {
    const soldIds = new Set(recipes.map((recipe) => recipe.productId));
    for (const recipe of recipes) {
      if (recipe.componentIds.some((id) => soldIds.has(id))) {
        const nested = recipes.find((other) => recipe.componentIds.includes(other.productId));
        throw new BadRequestException(
          `"${recipe.productName}" usa "${nested?.productName}", que también tiene receta. Un ingrediente no puede tener su propia receta.`,
        );
      }
    }
  }

  async upsert(posConfigId: number, productId: number, dto: UpsertRecipeDto, updatedByEmail: string): Promise<RecipeDoc> {
    await this.assertStore(posConfigId);

    const componentIds = dto.components.map((component) => component.productId);
    if (componentIds.includes(productId)) throw new BadRequestException('Un producto no puede ser ingrediente de sí mismo.');
    if (new Set(componentIds).size !== componentIds.length) {
      throw new BadRequestException('Hay ingredientes repetidos: junta las cantidades en uno solo.');
    }

    const catalog = new Map((await this.findCatalog()).map((item) => [item.productId, item]));
    const missing = [productId, ...componentIds].filter((id) => !catalog.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Hay productos que ya no existen en el catálogo (id ${missing.join(', ')}).`);
    }
    const product = catalog.get(productId) as RecipeCatalogItemDoc;

    const others = (await this.repository.findForStore(posConfigId)).filter((recipe) => recipe.productId !== productId);
    this.assertOneLevel([
      ...others.map((recipe) => ({
        productId: recipe.productId,
        productName: recipe.productName,
        componentIds: recipe.components.map((component) => component.productId),
      })),
      { productId, productName: product.productName, componentIds },
    ]);

    const saved = await this.repository.upsert({
      posConfigId,
      productId,
      productName: product.productName,
      components: dto.components.map((component) => {
        const item = catalog.get(component.productId) as RecipeCatalogItemDoc;
        return {
          productId: item.productId,
          productName: item.productName,
          unit: item.unit,
          quantity: Math.round(component.quantity * 1000) / 1000,
        };
      }),
      updatedByEmail,
    });
    return this.toDoc(saved);
  }

  async remove(posConfigId: number, productId: number): Promise<void> {
    const removed = await this.repository.remove(posConfigId, productId);
    if (!removed) throw new NotFoundException('Esa receta no existe en esta tienda.');
  }

  // Copia TODAS las recetas de otra tienda a esta. Las que ya existían para
  // el mismo producto se reemplazan; las demás de esta tienda se conservan.
  async copyFrom(posConfigId: number, sourcePosConfigId: number, updatedByEmail: string): Promise<RecipeDoc[]> {
    if (posConfigId === sourcePosConfigId) throw new BadRequestException('Elige una tienda distinta para copiar.');
    await this.assertStore(posConfigId);

    const [source, target] = await Promise.all([
      this.repository.findForStore(sourcePosConfigId),
      this.repository.findForStore(posConfigId),
    ]);
    if (source.length === 0) throw new BadRequestException('La tienda de origen no tiene recetas.');

    const copiedIds = new Set(source.map((recipe) => recipe.productId));
    const merged = [...target.filter((recipe) => !copiedIds.has(recipe.productId)), ...source];
    this.assertOneLevel(
      merged.map((recipe) => ({
        productId: recipe.productId,
        productName: recipe.productName,
        componentIds: recipe.components.map((component) => component.productId),
      })),
    );

    for (const recipe of source) {
      await this.repository.upsert({
        posConfigId,
        productId: recipe.productId,
        productName: recipe.productName,
        components: recipe.components,
        updatedByEmail,
      });
    }
    return this.findForStore(posConfigId);
  }
}
