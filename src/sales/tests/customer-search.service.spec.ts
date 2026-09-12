import { describe, expect, it } from 'vitest';
import { CustomerSearchService } from '../services/customer-search.service.js';
import { createOdooServiceMock, domainOfCall, OdooServiceMock } from './mocks/odoo.service.mock.js';
import { OdooAccountMoveGroup } from '../../odoo/types/odoo-entities.types.js';

const AUG_1 = '2026-08-01';
const SEPT_8 = '2026-09-08';

// Fila de account.move.read_group agrupada por (partner_id, commercial_partner_id)
// — mismo shape que el buscador de compradores pide a Odoo.
function groupOf(
  partner: [number, string],
  commercial: [number, string] | false,
  count: number,
  amountTotal: number,
): OdooAccountMoveGroup {
  return {
    __count: count,
    partner_id: partner,
    commercial_partner_id: commercial,
    amount_untaxed_signed: Math.round((amountTotal / 1.13) * 100) / 100,
    amount_total_signed: amountTotal,
  };
}

describe('CustomerSearchService', () => {
  function buildService(moveGroups: OdooAccountMoveGroup[]): { service: CustomerSearchService; odoo: OdooServiceMock } {
    const odoo = createOdooServiceMock({ moveGroups });
    return { service: new CustomerSearchService(odoo.service), odoo };
  }

  it('devuelve cualquier comprador con facturas en el rango, no solo los clientes de mayoreo fijos', async () => {
    const { service } = buildService([
      groupOf([3008, 'Super Selectos Valle Dulce'], [2306, 'Calleja S.A. de C.V.'], 4, 100),
      groupOf([5501, 'Ana Martínez'], false, 1, 15),
    ]);

    const results = await service.search({ q: 'a', dateFrom: AUG_1, dateTo: SEPT_8, limit: 30 });

    expect(results.map((r) => r.partnerName)).toEqual(['Super Selectos Valle Dulce', 'Ana Martínez']);
    // Sin commercial_partner_id (cliente natural, sin empresa matriz): usa el propio partner.
    const ana = results.find((r) => r.partnerName === 'Ana Martínez')!;
    expect(ana.commercialPartnerId).toBe(5501);
    expect(ana.commercialPartnerName).toBe('Ana Martínez');
    expect(ana.amountTotal).toBe(15);
    expect(ana.visits).toBe(1);
  });

  it('ordena por venta total descendente y aplica el límite', async () => {
    const { service } = buildService([
      groupOf([1, 'Cliente Chico'], false, 1, 10),
      groupOf([2, 'Cliente Grande'], false, 3, 500),
      groupOf([3, 'Cliente Mediano'], false, 2, 200),
    ]);

    const results = await service.search({ q: 'cliente', dateFrom: AUG_1, dateTo: SEPT_8, limit: 2 });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.partnerName)).toEqual(['Cliente Grande', 'Cliente Mediano']);
  });

  it('pide a Odoo el domain de facturas de cliente filtrado por partner_id.name ilike q', async () => {
    const { service, odoo } = buildService([]);

    await service.search({ q: 'selectos', dateFrom: AUG_1, dateTo: SEPT_8, limit: 30 });

    expect(domainOfCall(odoo.readGroupAccountMoves)).toEqual([
      ['invoice_date', '>=', AUG_1],
      ['invoice_date', '<=', SEPT_8],
      ['move_type', 'in', ['out_invoice', 'out_refund']],
      ['partner_id.name', 'ilike', 'selectos'],
    ]);
  });

  it('usa dateFrom como dateTo cuando no se manda dateTo', async () => {
    const { service, odoo } = buildService([]);

    await service.search({ q: 'selectos', dateFrom: AUG_1, limit: 30 });

    expect(domainOfCall(odoo.readGroupAccountMoves)).toEqual([
      ['invoice_date', '>=', AUG_1],
      ['invoice_date', '<=', AUG_1],
      ['move_type', 'in', ['out_invoice', 'out_refund']],
      ['partner_id.name', 'ilike', 'selectos'],
    ]);
  });
});
