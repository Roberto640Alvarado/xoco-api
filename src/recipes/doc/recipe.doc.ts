import { InventoryUnit } from '../../inventory/doc/inventory.doc.js';

// Respuestas de Administración → Recetas (RecipesService).

export interface RecipeComponentDoc {
  productId: number;
  productName: string;
  unit: InventoryUnit;
  /** Cuánto se gasta por cada unidad vendida del producto. */
  quantity: number;
}

export interface RecipeDoc {
  posConfigId: number;
  productId: number;
  productName: string;
  components: RecipeComponentDoc[];
  updatedByEmail: string;
  updatedAt: Date;
}

/** Producto del catálogo de Odoo para elegir el producto vendido o un ingrediente. */
export interface RecipeCatalogItemDoc {
  productId: number;
  productName: string;
  categoryName: string;
  unit: InventoryUnit;
}
