// Expansión de ventas por receta — pura, para que Conteo, Registro y Kardex
// usen exactamente la misma regla y se pueda probar sin Mongo ni Odoo.
//
// Una venta de un producto CON receta no descuenta ese producto: descuenta
// cada ingrediente × la cantidad vendida. Una venta sin receta queda igual.

export interface RecipeIngredient {
  productId: number;
  productName: string;
  quantity: number;
}

export interface RecipeEntry {
  productName: string;
  components: RecipeIngredient[];
}

/** productId vendido -> su receta, para UNA tienda. */
export type RecipeMap = Map<number, RecipeEntry>;

export interface ExpandedSale {
  productId: number;
  /** Nombre del ingrediente (o null si la venta no pasó por receta: se usa el del ticket). */
  productName: string | null;
  quantity: number;
  /** El producto vendido que originó este consumo (null si no tiene receta). */
  via: { productId: number; productName: string; quantity: number } | null;
}

// 3 decimales alcanzan para kg y evitan colas como 0.30000000000000004.
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function expandSale(productId: number, quantity: number, recipes: RecipeMap): ExpandedSale[] {
  const recipe = recipes.get(productId);
  if (!recipe) return [{ productId, productName: null, quantity, via: null }];
  return recipe.components.map((component) => ({
    productId: component.productId,
    productName: component.productName,
    quantity: round(component.quantity * quantity),
    via: { productId, productName: recipe.productName, quantity },
  }));
}

/** Productos vendidos cuyas ventas mueven `productId` (él mismo, si no tiene receta, y las recetas que lo usan). */
export function soldProductsAffecting(productId: number, recipes: RecipeMap): number[] {
  const ids = recipes.has(productId) ? [] : [productId];
  for (const [soldId, recipe] of recipes) {
    if (recipe.components.some((component) => component.productId === productId)) ids.push(soldId);
  }
  return ids;
}

/** "Americano ×2" — cómo se nombra el origen de un consumo en Registro y Kardex. */
export function viaLabel(via: NonNullable<ExpandedSale['via']>): string {
  return `${via.productName} ×${Number.isInteger(via.quantity) ? via.quantity : round(via.quantity)}`;
}
