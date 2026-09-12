// Valores de los campos de selección de `account.move` que usa la API.
// Se declaran como enum (y no como strings sueltos en los domains) para
// no repetir literales por todo el módulo — ver CLAUDE.md, "Preferir
// enums antes que strings literales".

// move_type: además de estos existen las variantes de proveedor
// ('in_invoice', 'in_refund') y 'entry' (asiento contable puro). Solo se
// declaran los que se consultan hoy.
export enum OdooMoveType {
  CUSTOMER_INVOICE = 'out_invoice', // Factura de cliente
  CUSTOMER_REFUND = 'out_refund', // Nota de crédito
}

export enum OdooMoveState {
  DRAFT = 'draft',
  POSTED = 'posted',
  CANCEL = 'cancel',
}
