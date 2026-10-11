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
  // `quantity` (el último conteo real) menos lo vendido en Odoo
  // (pos.order.line, excluyendo canceladas), menos las mermas/
  // regalías/degustaciones ya CONFIRMADAS y más las entradas (envíos
  // planta→tienda) ya CONFIRMADAS, todo desde esa misma fecha — "si no
  // ha pasado nada más que eso, hoy debería haber esto". null si el
  // producto nunca se ha contado (no hay de dónde partir) — ver
  // InventoryService.findItemsForStore / estimateQuantity.
  estimatedQuantity: number | null;
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
