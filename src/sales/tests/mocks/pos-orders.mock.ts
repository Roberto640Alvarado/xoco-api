import { OdooPosOrder } from '../../../odoo/types/odoo-entities.types.js';

// Datos reales de Tienda Ramblas (pos.config id 3) tomados de Odoo el
// 2026-09-10, alrededor del domingo 7 de septiembre de 2026. Es el caso
// que destapó el bug: la sesión POS/01268 abrió el 2026-09-06 23:21 UTC y
// no cerró hasta el 2026-09-08 15:10 UTC, así que agrupando por fecha de
// sesión el día 7 salía en CERO aunque Odoo reportaba $200.21 vendidos.
//
// `date_order` va en UTC, como lo devuelve Odoo. En hora local (UTC-6)
// el día 7 va de "2026-09-07 06:00:00" a "2026-09-08 05:59:59" UTC.
//
// amount_tax es sintético (no se consultó el real por orden); el resto de
// los campos son los valores que devolvió Odoo.

const RAMBLAS: [number, string] = [3, 'Tienda Ramblas'];
const SESSION_01265: [number, string] = [2039, 'POS/01265'];
const SESSION_01268: [number, string] = [2046, 'POS/01268'];
const SESSION_01275: [number, string] = [2056, 'POS/01275'];

function order(
  id: number,
  name: string,
  dateOrder: string,
  state: string,
  amountTotal: number,
  session: [number, string],
): OdooPosOrder {
  return {
    id,
    name,
    session_id: session,
    config_id: RAMBLAS,
    partner_id: false,
    date_order: dateOrder,
    state,
    amount_total: amountTotal,
    amount_tax: 0,
    amount_paid: amountTotal,
    amount_return: 0,
    user_id: false,
    company_id: [1, 'CACAO, S.A DE C.V'],
    create_date: dateOrder,
    write_date: dateOrder,
  };
}

// Las 13 ventas que Odoo reporta en el PDF del 07/09/2026 ($200.21).
export const RAMBLAS_SEPT_7_ORDERS: OdooPosOrder[] = [
  order(33617, 'Ramblas/5723', '2026-09-07 18:41:25', 'invoiced', 8.25, SESSION_01268),
  order(33618, 'Ramblas/5724', '2026-09-07 18:41:48', 'invoiced', 1.01, SESSION_01268),
  order(33619, 'Ramblas/5725', '2026-09-07 18:54:42', 'invoiced', 9.35, SESSION_01268),
  order(33628, 'Ramblas/5726', '2026-09-07 19:56:01', 'invoiced', 9.95, SESSION_01268),
  order(33634, 'Ramblas/5727', '2026-09-07 20:30:33', 'invoiced', 11, SESSION_01268),
  order(33638, 'Ramblas/5728', '2026-09-07 20:58:26', 'invoiced', 26.25, SESSION_01268),
  order(33640, 'Ramblas/5729', '2026-09-07 21:10:54', 'invoiced', 39.75, SESSION_01268),
  order(33643, 'Ramblas/5730', '2026-09-07 21:58:46', 'invoiced', 29.9, SESSION_01268),
  order(33644, 'Ramblas/5731', '2026-09-07 22:08:35', 'invoiced', 7.55, SESSION_01268),
  order(33650, 'Ramblas/5732', '2026-09-07 22:49:40', 'invoiced', 1.75, SESSION_01268),
  order(33654, 'Ramblas/5733', '2026-09-07 23:43:22', 'invoiced', 4.2, SESSION_01268),
  order(33655, 'Ramblas/5734', '2026-09-07 23:53:29', 'invoiced', 9.25, SESSION_01268),
  // Cobrada a las 19:04 hora local del día 7, pero ya 2026-09-08 en UTC:
  // la orden que hacía que un filtro por UTC diera $158.21 en vez de $200.21.
  order(33665, 'Ramblas/5735', '2026-09-08 01:04:31', 'invoiced', 42, SESSION_01268),
];

// Canceladas del día 7 local — no cuentan como venta, pero sí aparecen en
// el desglose por estado de /sales/reconciliation.
export const RAMBLAS_SEPT_7_CANCELLED: OdooPosOrder[] = [
  order(33660, '/', '2026-09-08 00:11:29', 'cancel', 102, SESSION_01268),
  order(33663, '/', '2026-09-08 00:48:12', 'cancel', 28, SESSION_01268),
];

// Vecinas fuera del día 7 local, para comprobar que no se cuelan:
// la primera es del 6 a las 17:22 local, la segunda del 8 a las 09:39.
export const RAMBLAS_NEIGHBOUR_ORDERS: OdooPosOrder[] = [
  order(33582, 'Ramblas/5722', '2026-09-06 23:22:43', 'invoiced', 11.05, SESSION_01268),
  order(33576, 'Ramblas/5721', '2026-09-06 22:39:17', 'invoiced', 12, SESSION_01265),
  order(33667, 'Ramblas/5736', '2026-09-08 15:39:18', 'invoiced', 14, SESSION_01275),
];

export const RAMBLAS_SEPT_7_TOTAL = 200.21;
