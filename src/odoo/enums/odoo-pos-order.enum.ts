// Estados de `pos.order` en Odoo. Una orden en `CANCEL` no vendió nada,
// así que no cuenta ni como venta ni como visita.
export enum OdooPosOrderState {
  DRAFT = 'draft',
  PAID = 'paid',
  DONE = 'done',
  INVOICED = 'invoiced',
  CANCEL = 'cancel',
}
