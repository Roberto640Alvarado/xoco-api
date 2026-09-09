// Formas de respuesta propias de este módulo — nunca se expone la forma
// cruda de Odoo (tuplas many2one, etc.) directo al frontend.

export interface RefDoc {
  id: number;
  name: string;
}

export interface SalesOrderDoc {
  id: number;
  name: string;
  dateOrder: string;
  state: string;
  amountTotal: number;
  amountTax: number;
  amountPaid: number;
  amountReturn: number;
  partner: RefDoc | null;
  posConfig: RefDoc;
  session: RefDoc;
}

export interface PaginationMetaDoc {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedOrdersDoc {
  items: SalesOrderDoc[];
  meta: PaginationMetaDoc;
}

export interface TopProductDoc {
  productId: number;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface DailySalesDoc {
  date: string; // YYYY-MM-DD
  orderCount: number;
  totalRevenue: number;
  totalTax: number;
}

export interface StoreDoc {
  id: number;
  name: string;
}

// Comparación de conteo/ingresos entre los 2 métodos posibles de agrupar
// una orden en un día: por fecha de SESIÓN (start_at — el que usa toda
// la app hoy, ver CLAUDE.md) vs. por fecha de la ORDEN individual
// (date_order). Existe porque las tiendas que cierran después de
// medianoche tienen órdenes cuya date_order cae en el día siguiente
// aunque pertenezcan a la sesión del día anterior — eso puede explicar
// diferencias contra un conteo manual (ej. un Excel) que no distinguió
// entre ambos métodos. Ver plan-history "reconciliacion-visitas".
export interface ReconciliationOrderDoc {
  id: number;
  name: string;
  state: string;
  dateOrder: string; // fecha+hora de la orden individual (date_order de Odoo)
  sessionDate: string; // YYYY-MM-DD — fecha de la sesión a la que pertenece (método de la app)
  amountTotal: number;
  includedBySessionMethod: boolean; // ¿cae dentro del rango pedido usando la fecha de sesión?
  includedByOrderDateMethod: boolean; // ¿cae dentro del rango pedido usando date_order?
}

export interface ReconciliationTotalsDoc {
  orderCount: number;
  totalRevenue: number;
}

export interface ReconciliationStoreDoc {
  posConfigId: number;
  storeName: string;
  bySessionMethod: ReconciliationTotalsDoc; // lo que muestra hoy el resto de la app
  byOrderDateMethod: ReconciliationTotalsDoc; // alternativa: agrupando por date_order
  orderCountDifference: number; // bySessionMethod.orderCount - byOrderDateMethod.orderCount
  // Conteo por state (incluye 'cancel') de todas las órdenes tocadas por
  // el rango bajo cualquiera de los 2 métodos — para ver de un vistazo
  // cuántas canceladas hay de por medio.
  stateBreakdown: Record<string, number>;
  // Solo las órdenes donde los 2 métodos no coinciden (las que cruzan
  // medianoche en el borde del rango pedido) — la lista concreta que hay
  // que revisar para explicar una diferencia contra un conteo externo.
  boundaryOrders: ReconciliationOrderDoc[];
}
