import { PaginationMetaDoc, RefDoc } from './sales.doc.js';

// Respuestas de Tickets → Órdenes (PosTicketsService). Nunca la forma cruda
// de Odoo: tuplas many2one ya resueltas, fecha y hora en hora LOCAL de la
// tienda y montos redondeados a centavos.

export interface PosTicketSummaryDoc {
  id: number;
  /** Nombre interno de la orden en Odoo (ej. "Ramblas/0412"). */
  name: string;
  /** Número del recibo impreso, si Odoo lo trae (ej. "Orden 00012-003-0004"). */
  posReference: string | null;
  date: string; // YYYY-MM-DD, día local
  time: string; // HH:mm, hora local (24 h)
  state: string;
  store: RefDoc;
  session: RefDoc;
  cashier: RefDoc | null;
  customer: RefDoc | null;
  /** Cantidad de líneas (productos distintos) del ticket. */
  lineCount: number;
  /** Unidades vendidas sin contar productos a granel (su cantidad está en peso). */
  unitCount: number;
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  amountPaid: number;
  amountReturn: number;
  /** Nombres de los métodos de pago usados, sin repetir. */
  paymentMethods: string[];
  /**
   * Parte de la orden que es propina (ya incluida en los conteos y montos
   * de arriba), para reportes que no deben contarla como venta. null si la
   * orden no lleva propina.
   */
  tip: PosTicketTipDoc | null;
}

export interface PosTicketTipDoc {
  lineCount: number;
  unitCount: number;
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
}

export interface PosTicketsTotalsDoc {
  orderCount: number;
  totalRevenue: number;
  averageTicket: number;
}

export interface PaginatedPosTicketsDoc {
  items: PosTicketSummaryDoc[];
  meta: PaginationMetaDoc;
  /** Totales de TODO el filtro (no solo de la página). */
  totals: PosTicketsTotalsDoc;
}

export interface PosTicketLineDoc {
  id: number;
  productId: number | null;
  productName: string;
  quantity: number;
  /** Unidad de medida tal como viene de Odoo (ej. "Unidades", "g", "kg"). */
  uomName: string | null;
  /** true si es un producto a granel (cantidad en peso). */
  isWeight: boolean;
  /** Para granel, la cantidad ya convertida a kg (sea g, lb, etc.); null si es por pieza. */
  quantityKg: number | null;
  priceUnit: number;
  /** Descuento de la línea en %, 0 si no tiene. */
  discount: number;
  subtotal: number; // sin impuesto
  total: number; // con impuesto
}

export interface PosTicketPaymentDoc {
  paymentMethodId: number;
  paymentMethodName: string;
  amount: number;
}

export interface PosTicketDetailDoc extends PosTicketSummaryDoc {
  lines: PosTicketLineDoc[];
  payments: PosTicketPaymentDoc[];
}
