// Formas de respuesta propias de este módulo — nunca se expone la forma
// cruda de Odoo (tuplas many2one, etc.) directo al frontend.

export interface RefDoc {
  id: number;
  name: string;
}

export interface SalesOrderDoc {
  id: number;
  name: string;
  dateOrder: string; // fecha+hora cruda de Odoo, en UTC ("2026-09-08 01:04:31")
  date: string; // YYYY-MM-DD — día LOCAL de la tienda al que pertenece la venta
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
  date: string; // YYYY-MM-DD — día local de la tienda
  orderCount: number;
  totalRevenue: number;
  totalTax: number;
}

export interface StoreDoc {
  id: number;
  name: string;
}

// Visitas y venta de un grupo de facturas. Es la forma que comparten los
// reportes basados en facturas: "visitas" es la cantidad de facturas, y
// los montos son la suma de esas mismas facturas, netos de notas de
// crédito (igual que los suma la lista de facturas de Odoo).
export interface InvoiceTotalsDoc {
  visits: number;
  amountUntaxed: number; // venta sin impuesto
  amountTax: number; // impuesto (amountTotal - amountUntaxed)
  amountTotal: number; // venta con impuesto
}

// Visitas y venta por TIENDA — es lo que alimenta "Visitas a la fecha" y
// "Venta Mensual" del panel (ver StoreInvoiceTotalsService).
export interface StoreInvoiceTotalsDoc extends InvoiceTotalsDoc {
  posConfigId: number;
  storeName: string;
}

export interface StoreInvoiceTotalsReportDoc {
  items: StoreInvoiceTotalsDoc[];
  totals: InvoiceTotalsDoc; // suma de las tiendas — el "Total Mensual" del panel
  // Facturas del rango que no son de ninguna tienda (mayoreo: factura sin
  // pasar por caja). NO están incluidas en `totals` — se devuelven para
  // que el número no desaparezca sin explicación.
  outsideStores: InvoiceTotalsDoc;
}

// "Visitas" según el negocio: el número de FACTURAS de cliente emitidas
// en el rango, agrupadas por vendedor — exactamente lo que el equipo
// saca hoy a mano desde el módulo de Contabilidad de Odoo (lista de
// facturas + agrupar por vendedor). Es una fuente distinta a las órdenes
// de POS: incluye también el canal de mayoreo, que no pasa por caja.
export interface SalespersonSalesDoc extends InvoiceTotalsDoc {
  salespersonId: number | null; // null cuando la factura no tiene vendedor asignado
  salespersonName: string;
}

export interface SalespersonSalesReportDoc {
  items: SalespersonSalesDoc[];
  totals: InvoiceTotalsDoc;
}

// Comparación de conteo/ingresos entre los 2 métodos de agrupar una orden
// en un día: por día LOCAL de `date_order` (el método oficial de la app, y
// el que usan los reportes propios de Odoo) vs. por fecha de SESIÓN
// (start_at en UTC — el método anterior al fix de septiembre 2026). Sirve
// para explicar diferencias contra un conteo externo (ej. un Excel) o
// contra un número histórico del panel. Ver plan-history
// "reconciliacion-visitas" y "fix-dia-local-ventas".
export interface ReconciliationOrderDoc {
  id: number;
  name: string;
  state: string;
  dateOrder: string; // fecha+hora cruda de la orden, en UTC (date_order de Odoo)
  storeDate: string; // YYYY-MM-DD — día local de la tienda (método oficial)
  sessionDate: string | null; // YYYY-MM-DD (UTC) en que abrió su sesión; null si abrió fuera de la ventana revisada
  amountTotal: number;
  includedByStoreDayMethod: boolean; // ¿cae dentro del rango pedido usando el día local?
  includedBySessionMethod: boolean; // ¿cae dentro del rango pedido usando la fecha de sesión?
}

export interface ReconciliationTotalsDoc {
  orderCount: number;
  totalRevenue: number;
}

export interface ReconciliationStoreDoc {
  posConfigId: number;
  storeName: string;
  byStoreDayMethod: ReconciliationTotalsDoc; // lo que muestra hoy el resto de la app
  bySessionMethod: ReconciliationTotalsDoc; // el método anterior, para comparar
  orderCountDifference: number; // byStoreDayMethod.orderCount - bySessionMethod.orderCount
  // Conteo por state (incluye 'cancel') de todas las órdenes tocadas por
  // el rango bajo cualquiera de los 2 métodos — para ver de un vistazo
  // cuántas canceladas hay de por medio.
  stateBreakdown: Record<string, number>;
  // Solo las órdenes donde los 2 métodos no coinciden (las que cruzan
  // medianoche en el borde del rango pedido) — la lista concreta que hay
  // que revisar para explicar una diferencia contra un conteo externo.
  boundaryOrders: ReconciliationOrderDoc[];
}
