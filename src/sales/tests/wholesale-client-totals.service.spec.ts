import { describe, expect, it } from 'vitest';
import { WholesaleClientTotalsService } from '../services/wholesale-client-totals.service.js';
import { createOdooServiceMock, domainOfCall, OdooServiceMock } from './mocks/odoo.service.mock.js';
import { WHOLESALE_CLIENTS } from '../constants/wholesale-clients.const.js';
import { OdooAccountMoveGroup } from '../../odoo/types/odoo-entities.types.js';

const SELECTOS = WHOLESALE_CLIENTS.find((c) => c.key === 'selectos')!;
const OPERADORA_DEL_SUR = WHOLESALE_CLIENTS.find((c) => c.key === 'operadora_del_sur')!;

const SEPT_1 = '2026-09-01';
const SEPT_8 = '2026-09-08';

// Fila de account.move.read_group agrupado por (commercial_partner_id,
// partner_id) — mismo shape que devuelve Odoo de verdad (ver
// plan-history "clientes-mayoreo-meta").
function groupOf(
  commercial: [number, string],
  partner: [number, string],
  count: number,
  amountTotal: number,
): OdooAccountMoveGroup {
  return {
    __count: count,
    commercial_partner_id: commercial,
    partner_id: partner,
    amount_untaxed_signed: Math.round((amountTotal / 1.13) * 100) / 100,
    amount_total_signed: amountTotal,
  };
}

describe('WholesaleClientTotalsService', () => {
  function buildService(moveGroups: OdooAccountMoveGroup[]): { service: WholesaleClientTotalsService; odoo: OdooServiceMock } {
    const odoo = createOdooServiceMock({ moveGroups });
    return { service: new WholesaleClientTotalsService(odoo.service), odoo };
  }

  it('trae los 2 clientes configurados, en cero si no facturaron en el rango', async () => {
    const { service } = buildService([]);

    const report = await service.findTotalsByClient({ dateFrom: SEPT_1, dateTo: SEPT_8 });

    expect(report.items.map((item) => item.clientKey)).toEqual(['selectos', 'operadora_del_sur']);
    expect(report.items.every((item) => item.visits === 0 && item.amountTotal === 0)).toBe(true);
    expect(report.items.every((item) => item.buyers.length === 0)).toBe(true);
    expect(report.totals).toEqual({ visits: 0, amountUntaxed: 0, amountTax: 0, amountTotal: 0 });
  });

  it('agrupa por comprador (partner_id) dentro de cada cliente y suma el total del cliente', async () => {
    const { service } = buildService([
      groupOf([SELECTOS.commercialPartnerId, 'Calleja S.A. de C.V.'], [3008, 'Super Selectos Valle Dulce'], 4, 100),
      groupOf([SELECTOS.commercialPartnerId, 'Calleja S.A. de C.V.'], [2539, 'Super Selectos Centro Antel'], 2, 50),
      groupOf(
        [OPERADORA_DEL_SUR.commercialPartnerId, 'Operadora del Sur'],
        [OPERADORA_DEL_SUR.commercialPartnerId, 'Operadora del Sur'],
        10,
        300,
      ),
    ]);

    const report = await service.findTotalsByClient({ dateFrom: SEPT_1, dateTo: SEPT_8 });

    const selectos = report.items.find((item) => item.clientKey === 'selectos')!;
    expect(selectos.visits).toBe(6);
    expect(selectos.amountTotal).toBe(150);
    // Ordenados por venta descendente: la sucursal de $100 antes que la de $50.
    expect(selectos.buyers.map((b) => b.partnerName)).toEqual(['Super Selectos Valle Dulce', 'Super Selectos Centro Antel']);
    expect(selectos.buyers[0]).toMatchObject({ partnerId: 3008, visits: 4, amountTotal: 100 });

    const operadora = report.items.find((item) => item.clientKey === 'operadora_del_sur')!;
    expect(operadora.visits).toBe(10);
    expect(operadora.amountTotal).toBe(300);
    // Sin sub-contactos: un solo comprador, igual al total del cliente.
    expect(operadora.buyers).toHaveLength(1);
    expect(operadora.buyers[0]).toMatchObject({ partnerId: OPERADORA_DEL_SUR.commercialPartnerId, amountTotal: 300 });

    expect(report.totals).toMatchObject({ visits: 16, amountTotal: 450 });
  });

  it('pide a Odoo el domain de facturas de cliente filtrado a los commercial_partner_id configurados', async () => {
    const { service, odoo } = buildService([]);

    await service.findTotalsByClient({ dateFrom: SEPT_1, dateTo: SEPT_8 });

    expect(domainOfCall(odoo.readGroupAccountMoves)).toEqual([
      ['invoice_date', '>=', SEPT_1],
      ['invoice_date', '<=', SEPT_8],
      ['move_type', 'in', ['out_invoice', 'out_refund']],
      ['commercial_partner_id', 'in', [SELECTOS.commercialPartnerId, OPERADORA_DEL_SUR.commercialPartnerId]],
    ]);
  });
});
