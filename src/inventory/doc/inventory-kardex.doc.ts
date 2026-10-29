import { InventoryLedgerEntryType } from './inventory-ledger.doc.js';
import { InventoryUnit } from './inventory.doc.js';

// Kardex de inventario de una tienda (GET /inventory/stores/:id/kardex):
// por producto, el saldo con el que arranca el período, cada entrada y
// salida en orden cronológico con el saldo que deja, los ajustes por conteo
// físico y el saldo final. Mismo criterio que la existencia estimada del
// Conteo: parte del último conteo físico y suma/resta ventas de Odoo y
// movimientos CONFIRMADOS (los pendientes o rechazados no mueven saldo).

/** Una línea del kardex. Las ventas seguidas de un mismo día se juntan en una sola línea. */
export interface InventoryKardexRowDoc {
  occurredAt: Date;
  /** Día local de la tienda, YYYY-MM-DD. */
  storeDate: string;
  type: InventoryLedgerEntryType;
  /** "Venta", "Merma", "Entrada", "Conteo físico"... */
  concept: string;
  /** Ticket(s) del POS, nota del movimiento o "Antes: X" en un conteo. */
  reference: string | null;
  registeredBy: string | null;
  /** Cantidad que entra (0 si no aplica). */
  quantityIn: number;
  /** Cantidad que sale (0 si no aplica). */
  quantityOut: number;
  /** Solo en conteos: contado menos el saldo que había. null si no había saldo conocido. */
  adjustment: number | null;
  /** Saldo después de esta línea. null mientras el producto no tenga un conteo de partida. */
  balance: number | null;
}

export interface InventoryKardexProductDoc {
  productId: number;
  productName: string;
  categoryName: string;
  unit: InventoryUnit;
  /** Saldo al iniciar el período. null = no había conteo físico antes. */
  openingBalance: number | null;
  totalIn: number;
  totalOut: number;
  /** Suma de los ajustes por conteo del período. */
  totalAdjustment: number;
  /** Saldo al cerrar el período. null = sigue sin conteo. */
  closingBalance: number | null;
  rows: InventoryKardexRowDoc[];
}

export interface InventoryKardexDoc {
  posConfigId: number;
  storeName: string;
  dateFrom: string;
  dateTo: string;
  generatedAt: Date;
  /** Productos con saldo conocido o con algún movimiento en el período, por categoría y nombre. */
  products: InventoryKardexProductDoc[];
}
