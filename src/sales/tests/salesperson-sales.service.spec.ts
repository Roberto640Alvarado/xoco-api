import { describe, expect, it } from 'vitest';
import { SalespersonSalesService } from '../services/salesperson-sales.service.js';
import { createOdooServiceMock, OdooServiceMock } from './mocks/odoo.service.mock.js';
import {
  JULY_GROUPS_BY_SALESPERSON,
  JULY_TOTAL,
  JULY_TOTAL_UNTAXED,
  JULY_TOTAL_VISITS,
} from './mocks/account-moves.mock.js';
import { OdooAccountMoveGroup } from '../../odoo/types/odoo-entities.types.js';

const JULY_FROM = '2026-07-01';
const JULY_TO = '2026-07-31';

describe('SalespersonSalesService', () => {
  let odoo: OdooServiceMock;

  function buildService(
    moveGroups: OdooAccountMoveGroup[] = JULY_GROUPS_BY_SALESPERSON,
  ): SalespersonSalesService {
    odoo = createOdooServiceMock({ moveGroups });
    return new SalespersonSalesService(odoo.service);
  }

  it('cuenta las facturas de cada vendedor como visitas, con venta sin y con impuesto', async () => {
    const service = buildService();

    const report = await service.findBySalesperson({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    // "Ventas 2" es San Benito (Art Haus): el equipo cuadró 964 visitas
    // en julio 2026 contando facturas en Odoo.
    expect(report.items[0]).toEqual({
      salespersonId: 10,
      salespersonName: 'Ventas 2',
      visits: 964,
      amountUntaxed: 15696.59,
      amountTax: 1946.88,
      amountTotal: 17643.47,
    });
  });

  it('devuelve los vendedores de más a menos visitas', async () => {
    const service = buildService();

    const report = await service.findBySalesperson({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    expect(report.items.map((item) => item.salespersonName)).toEqual([
      'Ventas 2',
      'Tienda Ramblas',
      'Tienda Escalon',
      'Tienda',
      'Mario Segura',
      'Celine',
      'Sin vendedor',
    ]);
  });

  it('suma los totales del período sin arrastrar error de coma flotante', async () => {
    const service = buildService();

    const report = await service.findBySalesperson({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    expect(report.totals).toEqual({
      visits: JULY_TOTAL_VISITS,
      amountUntaxed: JULY_TOTAL_UNTAXED,
      amountTax: 9093.98,
      amountTotal: JULY_TOTAL,
    });
  });

  it('cuenta lo mismo que la lista de facturas de Odoo: facturas, notas de crédito y cualquier estado', async () => {
    const service = buildService();

    await service.findBySalesperson({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    expect(odoo.readGroupAccountMoves).toHaveBeenCalledTimes(1);
    expect(odoo.readGroupAccountMoves.mock.calls[0][0]).toEqual({
      domain: [
        ['invoice_date', '>=', JULY_FROM],
        ['invoice_date', '<=', JULY_TO],
        ['move_type', 'in', ['out_invoice', 'out_refund']],
      ],
      fields: ['amount_untaxed_signed', 'amount_total_signed'],
      groupby: ['invoice_user_id'],
    });
  });

  it('sin dateTo consulta un solo día', async () => {
    const service = buildService([]);

    await service.findBySalesperson({ dateFrom: JULY_FROM });

    const { domain } = odoo.readGroupAccountMoves.mock.calls[0][0] as { domain: unknown[] };
    expect(domain.slice(0, 2)).toEqual([
      ['invoice_date', '>=', JULY_FROM],
      ['invoice_date', '<=', JULY_FROM],
    ]);
  });

  it('una factura sin vendedor asignado se reporta aparte, no se pierde', async () => {
    const service = buildService([
      { __count: 3, amount_untaxed_signed: 10, amount_total_signed: 11.3 },
    ]);

    const report = await service.findBySalesperson({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    expect(report.items).toEqual([
      {
        salespersonId: null,
        salespersonName: 'Sin vendedor',
        visits: 3,
        amountUntaxed: 10,
        amountTax: 1.3,
        amountTotal: 11.3,
      },
    ]);
  });

  it('un rango sin facturas devuelve la lista vacía y totales en cero', async () => {
    const service = buildService([]);

    const report = await service.findBySalesperson({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    expect(report.items).toEqual([]);
    expect(report.totals).toEqual({
      visits: 0,
      amountUntaxed: 0,
      amountTax: 0,
      amountTotal: 0,
    });
  });
});
