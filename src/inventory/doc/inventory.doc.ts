export type InventoryUnit = 'unidad' | 'kg';

// Un producto del catálogo de Odoo cruzado con lo ya capturado en Mongo
// para una tienda — lo que devuelve GET /inventory/stores/:posConfigId/items.
// `quantity: null` = todavía nadie ha contado este producto en esta
// tienda (distinto de 0 = "se contó y no hay existencia").
export interface InventoryItemDoc {
  productId: number;
  productName: string;
  unit: InventoryUnit;
  quantity: number | null;
  // Existencia que reporta Odoo (stock.quant) para la bodega de esta
  // tienda, SOLO como referencia/punto de partida — null si el
  // pos.config no tiene bodega mapeada o Odoo no reporta nada para ese
  // producto ahí. Nunca se usa como fuente de verdad (ver
  // InventoryService.findItemsForStore).
  odooQuantity: number | null;
  updatedAt: Date | null;
  updatedByEmail: string | null;
}

// Lo que devuelve el PUT — solo lo guardado, sin nombre/unidad (el
// frontend ya los tiene del GET que alimentó el formulario), mismo
// criterio que StoreGoalDoc en goals.doc.ts.
export interface InventorySavedItemDoc {
  id: string;
  posConfigId: number;
  productId: number;
  quantity: number;
  updatedAt: Date;
  updatedByEmail: string | null;
}
