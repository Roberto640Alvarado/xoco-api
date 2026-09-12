import {
  OdooAccountMove,
  OdooAccountMoveGroup,
  OdooPosOrderGroup,
} from '../../../odoo/types/odoo-entities.types.js';
import { CENTRIKA, ESCALON, RAMBLAS, SAN_BENITO } from './pos-configs.mock.js';

// Ids reales de los vendedores en Odoo (2026-09-11). Los cuatro primeros
// cobran en la caja de una tienda; Mario Segura y Celine facturan MAYOREO,
// sin pasar por caja.
export const VENDEDOR_CENTRIKA: [number, string] = [9, 'Tienda'];
export const VENDEDOR_SAN_BENITO: [number, string] = [10, 'Ventas 2'];
export const VENDEDOR_RAMBLAS: [number, string] = [12, 'Tienda Ramblas'];
export const VENDEDOR_ESCALON: [number, string] = [14, 'Tienda Escalon'];
export const VENDEDOR_MAYOREO: [number, string] = [7, 'Mario Segura'];
export const VENDEDOR_CELINE: [number, string] = [6, 'Celine'];

// Diarios que NO pertenecen a ninguna tienda (mayoreo).
const CCF_MAYOREO: [number, string] = [72, 'Comprobante Crédito Fiscal Mayoreo'];

// ---------------------------------------------------------------------
// Datos REALES de julio 2026: lo que devolvió `account.move.read_group`
// agrupado por vendedor (facturas + notas de crédito, todos los estados).
//
// Es el mes que el equipo cuadró a mano contra Odoo: CENTRIKA 563,
// Art Haus/San Benito 964, Ramblas 581, El Paseo/Escalón 567 (566 del
// vendedor + 1 factura sin vendedor asignado en el diario de Escalón).
// ---------------------------------------------------------------------
export const JULY_GROUPS_BY_SALESPERSON: OdooAccountMoveGroup[] = [
  {
    __count: 581,
    invoice_user_id: VENDEDOR_RAMBLAS,
    amount_untaxed_signed: 6992.04,
    amount_total_signed: 7887.6,
  },
  {
    __count: 964,
    invoice_user_id: VENDEDOR_SAN_BENITO,
    amount_untaxed_signed: 15696.59,
    amount_total_signed: 17643.47,
  },
  {
    __count: 183,
    invoice_user_id: VENDEDOR_MAYOREO,
    amount_untaxed_signed: 27275.77,
    amount_total_signed: 30675.26,
  },
  {
    __count: 563,
    invoice_user_id: VENDEDOR_CENTRIKA,
    amount_untaxed_signed: 13921.38,
    amount_total_signed: 15706.07,
  },
  {
    __count: 6,
    invoice_user_id: VENDEDOR_CELINE,
    amount_untaxed_signed: 1131.48,
    amount_total_signed: 1278.58,
  },
  {
    __count: 566,
    invoice_user_id: VENDEDOR_ESCALON,
    amount_untaxed_signed: 7175.12,
    amount_total_signed: 8094.78,
  },
  // La factura sin vendedor asignado: borrador de $5.25 en el diario de
  // Escalón (por eso las visitas de El Paseo son 567 y no 566).
  { __count: 1, amount_untaxed_signed: 4.65, amount_total_signed: 5.25 },
];

export const JULY_TOTAL_VISITS = 2864;
export const JULY_TOTAL_UNTAXED = 72197.03;
export const JULY_TOTAL = 81291.01;

// ---------------------------------------------------------------------
// Órdenes de caja de julio agrupadas por vendedor y tienda — así es como
// StoreInvoiceTotalsService descubre qué vendedor cobra en qué tienda. Mario
// Segura y Celine NO aparecen: no cobran en ninguna caja.
// ---------------------------------------------------------------------
export const JULY_POS_ORDER_GROUPS: OdooPosOrderGroup[] = [
  { __count: 563, user_id: VENDEDOR_CENTRIKA, config_id: [CENTRIKA.id, CENTRIKA.name] },
  { __count: 963, user_id: VENDEDOR_SAN_BENITO, config_id: [SAN_BENITO.id, SAN_BENITO.name] },
  { __count: 580, user_id: VENDEDOR_RAMBLAS, config_id: [RAMBLAS.id, RAMBLAS.name] },
  { __count: 566, user_id: VENDEDOR_ESCALON, config_id: [ESCALON.id, ESCALON.name] },
  // Una orden sin vendedor: no aporta al mapa vendedor -> tienda.
  { __count: 1, user_id: false, config_id: [ESCALON.id, ESCALON.name] },
];

// ---------------------------------------------------------------------
// Una factura por cada caso de atribución que se puede dar. Son casos
// reales de julio 2026, recortados a los campos que importan.
// ---------------------------------------------------------------------
let nextId = 1;
function move(
  journal: [number, string],
  salesperson: [number, string] | false,
  amountTotal: number,
  posOrderIds: number[] = [],
): OdooAccountMove {
  return {
    id: nextId++,
    journal_id: journal,
    invoice_user_id: salesperson,
    // Ningún test de StoreInvoiceTotalsService/SalespersonSalesService
    // depende del cliente de la factura — solo lo necesita
    // WholesaleClientTotalsService (ver wholesale-client-totals.mock.ts),
    // que arma sus propias facturas con partner_id/commercial_partner_id
    // reales en vez de este helper.
    partner_id: false,
    commercial_partner_id: false,
    pos_order_ids: posOrderIds,
    // El IVA de El Salvador es 13%: el monto sin impuesto es el total
    // entre 1.13 (redondeado a centavos, como lo guarda Odoo).
    amount_untaxed_signed: Math.round((amountTotal / 1.13) * 100) / 100,
    amount_total_signed: amountTotal,
  };
}

// Factura de caja en la serie fiscal de su tienda — el caso normal (la
// gran mayoría de las facturas del mes).
export const POS_INVOICE_SAN_BENITO = move(
  SAN_BENITO.invoice_journal_id as [number, string],
  VENDEDOR_SAN_BENITO,
  632.06,
  [32955],
);
export const POS_INVOICE_CENTRIKA = move(
  CENTRIKA.invoice_journal_id as [number, string],
  VENDEDOR_CENTRIKA,
  238.23,
  [32956],
);
export const POS_INVOICE_RAMBLAS = move(
  RAMBLAS.invoice_journal_id as [number, string],
  VENDEDOR_RAMBLAS,
  148.4,
  [32953],
);
export const POS_INVOICE_ESCALON = move(
  ESCALON.invoice_journal_id as [number, string],
  VENDEDOR_ESCALON,
  197.85,
  [32951],
);

// CCF que pidió un cliente en la tienda: no tiene orden de caja ligada,
// pero el diario y el vendedor apuntan a la misma tienda.
export const MANUAL_CCF_SAN_BENITO = move(
  SAN_BENITO.ccf_journal_id as [number, string],
  VENDEDOR_SAN_BENITO,
  62.31,
);

// Anulación: el diario es el mismo para las cuatro tiendas, así que la
// tienda sale del vendedor. Son las que explicaban las 2 visitas de
// diferencia de julio.
// Van en NEGATIVO: es lo que hace que la venta del mes quede neta.
export const ANULACION_RAMBLAS = move([19, 'Anulación'], VENDEDOR_RAMBLAS, -24);
export const ANULACION_SAN_BENITO = move([19, 'Anulación'], VENDEDOR_SAN_BENITO, -98.5);

// Factura sin vendedor asignado en el diario de Escalón: manda el diario.
export const UNASSIGNED_INVOICE_ESCALON = move(
  ESCALON.invoice_journal_id as [number, string],
  false,
  5.25,
);

// MAYOREO: Celine factura en el diario BASE de la compañía, que es
// también el de CENTRIKA — si se atribuyera por diario se le sumaría a
// CENTRIKA. No cobra en ninguna caja, así que no es de ninguna tienda.
export const MAYOREO_IN_CENTRIKA_JOURNAL = move(
  CENTRIKA.ccf_journal_id as [number, string],
  VENDEDOR_CELINE,
  141.75,
);

// MAYOREO en su propio diario, que no está configurado en ninguna tienda.
export const MAYOREO_OWN_JOURNAL = move(CCF_MAYOREO, VENDEDOR_MAYOREO, 436.07);

// El conjunto completo, con un caso de cada regla de atribución:
//
//   San Benito 3 → $632.06 (caja) + $62.31 (CCF manual) - $98.50 (anulación) = $595.87
//   Ramblas    2 → $148.40 (caja) - $24.00 (anulación)                       = $124.40
//   Escalón    2 → $197.85 (caja) + $5.25 (factura sin vendedor)             = $203.10
//   CENTRIKA   1 → $238.23 (caja)                                            = $238.23
//   fuera de tienda (mayoreo) 2 → $141.75 + $436.07                          = $577.82
export const JULY_ATTRIBUTION_CASES: OdooAccountMove[] = [
  POS_INVOICE_SAN_BENITO,
  POS_INVOICE_CENTRIKA,
  POS_INVOICE_RAMBLAS,
  POS_INVOICE_ESCALON,
  MANUAL_CCF_SAN_BENITO,
  ANULACION_RAMBLAS,
  ANULACION_SAN_BENITO,
  UNASSIGNED_INVOICE_ESCALON,
  MAYOREO_IN_CENTRIKA_JOURNAL,
  MAYOREO_OWN_JOURNAL,
];
