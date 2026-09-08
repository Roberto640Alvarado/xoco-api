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
