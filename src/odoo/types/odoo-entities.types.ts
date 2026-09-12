import { OdooMany2One } from './odoo-common.types.js';

// Los campos de cada interfaz son exactamente los que se están
// consultando hoy (ver los `fields` de cada `search_read`) — agregar más
// solo cuando de verdad se necesiten, para no arrastrar campos sin uso.

export interface OdooProduct {
  id: number;
  display_name: string;
  default_code: string | false;
  barcode: string | false;
  categ_id: OdooMany2One;
  type: string;
  list_price: number;
  standard_price: number;
  uom_id: OdooMany2One;
  qty_available: number;
  active: boolean;
  product_tmpl_id: OdooMany2One;
  create_date: string;
  write_date: string;
}

export interface OdooProductCategory {
  id: number;
  name: string;
  complete_name: string;
  parent_id: OdooMany2One;
  create_date: string;
  write_date: string;
}

export interface OdooPosConfig {
  id: number;
  name: string;
  warehouse_id: OdooMany2One;
  company_id: OdooMany2One;
  active: boolean;
  // Diarios contables en los que caen las facturas de esta tienda. El
  // primero es el estándar de Odoo; el resto los agrega la localización
  // fiscal de El Salvador (CCF, nota de remisión, exportación, nota de
  // crédito/débito, anulación). Se consultan para poder decir a qué
  // tienda pertenece una factura — ver StoreInvoiceTotalsService.
  //
  // Ojo: `anu_journal_id` (Anulación) apunta al MISMO diario en las
  // cuatro tiendas, así que no sirve para identificar una; por eso el
  // mapa descarta los diarios compartidos.
  invoice_journal_id: OdooMany2One;
  ccf_journal_id: OdooMany2One;
  nr_journal_id: OdooMany2One;
  fex_journal_id: OdooMany2One;
  nc_journal_id: OdooMany2One;
  nd_journal_id: OdooMany2One;
  anu_journal_id: OdooMany2One;
  create_date: string;
  write_date: string;
}

// state: "opening_control" | "opened" | "closing_control" | "closed"
export interface OdooPosSession {
  id: number;
  name: string;
  config_id: OdooMany2One;
  state: string;
  start_at: string | false;
  stop_at: string | false;
  cash_register_balance_start: number;
  cash_register_balance_end_real: number;
  user_id: OdooMany2One;
  create_date: string;
  write_date: string;
}

// state: "draft" | "paid" | "done" | "invoiced" | "cancel" (según instancia)
export interface OdooPosOrder {
  id: number;
  name: string;
  session_id: OdooMany2One;
  // Tienda (pos.config) de la orden. Es un related de session_id.config_id,
  // pero se consulta directo para poder filtrar/agrupar por tienda sin
  // tener que resolver antes las sesiones.
  config_id: OdooMany2One;
  partner_id: OdooMany2One;
  date_order: string;
  state: string;
  amount_total: number;
  amount_tax: number;
  amount_paid: number;
  amount_return: number;
  user_id: OdooMany2One;
  company_id: OdooMany2One;
  create_date: string;
  write_date: string;
}

export interface OdooPosOrderLine {
  id: number;
  order_id: OdooMany2One;
  product_id: OdooMany2One;
  // UoM de la línea — es lo único que dice si el producto se vende por
  // pieza o por peso (ej. "g"/"kg") sin una llamada extra a Odoo. `qty` de
  // un producto a granel viene en esta unidad, no en piezas (ver
  // sales/utils/product-uom.util.ts).
  product_uom_id: OdooMany2One;
  qty: number;
  price_unit: number;
  price_subtotal: number;
  price_subtotal_incl: number;
  discount: number;
  full_product_name: string;
  create_date: string;
  write_date: string;
}

// Factura de cliente. Solo los campos que hacen falta para atribuirla a
// una tienda y contarla como visita (ver StoreInvoiceTotalsService).
export interface OdooAccountMove {
  id: number;
  journal_id: OdooMany2One;
  invoice_user_id: OdooMany2One; // "Vendedor"
  // Cliente exacto de la factura (puede ser un contacto HIJO, ej. una
  // sucursal) y su razón social/empresa matriz — ver
  // WholesaleClientTotalsService, que agrupa por `commercial_partner_id`
  // (el cliente de mayoreo) y desglosa por `partner_id` (el comprador
  // puntual, ej. sucursal).
  partner_id: OdooMany2One;
  commercial_partner_id: OdooMany2One;
  // Órdenes de caja que originaron la factura. Viene vacío en las
  // facturas que NO se emitieron desde un punto de venta (mayoreo,
  // facturación manual) — es justo lo que distingue un canal del otro.
  pos_order_ids: number[];
  amount_untaxed_signed: number;
  amount_total_signed: number;
}

// Fila agregada de `pos.order` que devuelve `read_group` — se usa para
// saber qué vendedor factura desde la caja de qué tienda.
export interface OdooPosOrderGroup {
  __count: number;
  user_id?: OdooMany2One;
  config_id?: OdooMany2One;
}

// Fila agregada de `account.move` tal como la devuelve `read_group`.
// `__count` es el número de facturas del grupo (lo que el negocio llama
// "visitas"). Los campos agregados son opcionales porque dependen de los
// `fields` que se pidieron en la llamada.
//
// Se usan las variantes `_signed` porque son las que muestra la propia
// lista de facturas de Odoo: en una nota de crédito vienen en negativo,
// así que la suma del grupo queda neta.
export interface OdooAccountMoveGroup {
  __count: number;
  invoice_user_id?: OdooMany2One; // "Vendedor" (Salesperson) de la factura
  partner_id?: OdooMany2One;
  commercial_partner_id?: OdooMany2One;
  amount_untaxed_signed?: number;
  amount_total_signed?: number;
}

export interface OdooPosPaymentMethod {
  id: number;
  name: string;
  type: string;
  active: boolean;
  company_id: OdooMany2One;
  create_date: string;
  write_date: string;
}

// Fila de pos.payment.read_group agrupada por método de pago — usada por
// SalesService.findPaymentMethodsSummary (Efectivo vs. otros medios).
export interface OdooPosPaymentGroup {
  __count: number;
  payment_method_id?: OdooMany2One;
  amount?: number;
}
