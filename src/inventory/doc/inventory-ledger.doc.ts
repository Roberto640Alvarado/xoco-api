export enum InventoryLedgerEntryType {
  VENTA = 'VENTA',
  MERMA = 'MERMA',
  REGALIA = 'REGALIA',
  DEGUSTACION = 'DEGUSTACION',
  ENTRADA = 'ENTRADA',
  CONTEO = 'CONTEO',
}

// IN suma a la existencia (entrada), OUT resta (venta, merma, regalía,
// degustación), COUNT es un conteo físico que fija la cantidad.
export type InventoryLedgerDirection = 'IN' | 'OUT' | 'COUNT';

// Una línea del Registro de entradas y salidas de una tienda — une ventas
// de Odoo, movimientos manuales y conteos físicos en una sola línea de
// tiempo, con la fecha y hora exactas de cada uno.
export interface InventoryLedgerEntryDoc {
  id: string;
  occurredAt: Date;
  type: InventoryLedgerEntryType;
  direction: InventoryLedgerDirection;
  productId: number;
  productName: string;
  // Magnitud sin signo: unidades vendidas/movidas (en ENTRADA, la
  // recibida cuando existe) o, en CONTEO, la cantidad contada.
  quantity: number;
  // Solo movimientos manuales: PENDIENTE | EN_CAMINO | RECIBIDO | CONFIRMADO | RECHAZADO.
  status: string | null;
  // Nota del movimiento, número de orden del POS o "antes: X" en un conteo.
  detail: string | null;
  // Quién lo registró (null en ventas: las hace el POS).
  registeredBy: string | null;
}
