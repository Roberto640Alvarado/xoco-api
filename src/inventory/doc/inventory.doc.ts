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
  // `quantity` (el último conteo real) menos lo vendido en Odoo
  // (pos.order.line, excluyendo canceladas) y menos las mermas/
  // regalías/degustaciones ya CONFIRMADAS, ambas desde esa fecha — "si
  // no ha pasado nada más que eso, hoy debería haber esto". null si el
  // producto nunca se ha contado (no hay de dónde partir) — ver
  // InventoryService.findItemsForStore. Todavía NO resta envíos
  // planta->tienda (queda para un tramo futuro), así que se va a ir
  // desviando de la realidad mientras más tiempo pase sin un recuento
  // físico que lo corrija.
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
