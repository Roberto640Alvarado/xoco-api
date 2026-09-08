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
  qty: number;
  price_unit: number;
  price_subtotal: number;
  price_subtotal_incl: number;
  discount: number;
  full_product_name: string;
  create_date: string;
  write_date: string;
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
