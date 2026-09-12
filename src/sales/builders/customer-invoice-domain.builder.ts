import { OdooMoveType } from '../../odoo/enums/odoo-account-move.enum.js';

// Fecha de la factura. Es un campo `date` (sin hora), no un `datetime`:
// por eso los reportes de facturas NO necesitan la conversión de zona
// horaria que sí necesitan las órdenes de POS (ver store-date.util.ts).
export const INVOICE_DATE_FIELD = 'invoice_date';
export const SALESPERSON_FIELD = 'invoice_user_id';
export const JOURNAL_FIELD = 'journal_id';

// Domain único de "los movimientos de cliente de un rango" — lo comparten
// el reporte por vendedor y el conteo de visitas por tienda, para que las
// dos vistas cuenten EXACTAMENTE lo mismo (ver CLAUDE.md, "Nunca
// duplicar validaciones/lógica").
//
// Replica lo que ve el equipo en la lista de facturas del módulo de
// Contabilidad de Odoo, que es la fuente contra la que cuadran sus
// números:
//
// - Incluye facturas Y notas de crédito (`out_refund`). Las anulaciones
//   son las que explican las 2 visitas de diferencia que reportaron en
//   julio (una de San Benito, una de Ramblas).
// - NO filtra por estado: cuenta también las anuladas y las borrador
//   (1 o 2 por mes). Es necesario para cuadrar — por ejemplo CENTRIKA en
//   julio son 562 facturas emitidas + 1 anulada = 563.
//
// Ver plan-history "visitas-por-vendedor-facturas".
export function buildCustomerInvoiceDomain(dateFrom: string, dateTo: string): unknown[] {
  return [
    [INVOICE_DATE_FIELD, '>=', dateFrom],
    [INVOICE_DATE_FIELD, '<=', dateTo],
    ['move_type', 'in', [OdooMoveType.CUSTOMER_INVOICE, OdooMoveType.CUSTOMER_REFUND]],
  ];
}
