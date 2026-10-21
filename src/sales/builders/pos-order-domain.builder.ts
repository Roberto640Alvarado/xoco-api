import { OdooPosOrderState } from '../../odoo/enums/odoo-pos-order.enum.js';
import { storeDayRangeToUtc } from '../../common/utils/store-date.util.js';

// Domain de pos.order para un rango de DÍAS LOCALES de la tienda — único
// para todo el módulo (SalesService y PosTicketsService), así todas las
// pantallas cuentan exactamente las mismas órdenes.
//
// Una orden pertenece al día en que se cobró en hora local (igual que en
// los reportes propios de Odoo), no al día en que abrió la sesión POS:
// las tiendas no siempre cierran caja cada noche, y una sesión que se
// queda abierta 40 horas dejaría días enteros en cero. Como Odoo guarda
// date_order en UTC, el rango local se traduce a la ventana UTC que lo
// cubre (ver store-date.util.ts).
export function buildPosOrdersDomain(
  dateFrom: string,
  dateTo: string,
  posConfigId?: number,
  options: { excludeCancelled?: boolean } = {},
): unknown[] {
  const { utcFrom, utcTo } = storeDayRangeToUtc(dateFrom, dateTo);
  const domain: unknown[] = [
    ['date_order', '>=', utcFrom],
    ['date_order', '<=', utcTo],
  ];
  if (posConfigId) {
    domain.push(['config_id', '=', posConfigId]);
  }
  if (options.excludeCancelled) {
    domain.push(['state', '!=', OdooPosOrderState.CANCEL]);
  }
  return domain;
}
