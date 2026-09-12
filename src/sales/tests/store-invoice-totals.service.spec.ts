import { describe, expect, it } from 'vitest';
import { StoreInvoiceTotalsService } from '../services/store-invoice-totals.service.js';
import { createOdooServiceMock, domainOfCall, OdooServiceMock } from './mocks/odoo.service.mock.js';
import { ALL_STORES, CENTRIKA, ESCALON, RAMBLAS, SAN_BENITO } from './mocks/pos-configs.mock.js';
import {
  ANULACION_RAMBLAS,
  JULY_ATTRIBUTION_CASES,
  JULY_POS_ORDER_GROUPS,
  MANUAL_CCF_SAN_BENITO,
  MAYOREO_IN_CENTRIKA_JOURNAL,
  MAYOREO_OWN_JOURNAL,
  POS_INVOICE_SAN_BENITO,
  UNASSIGNED_INVOICE_ESCALON,
  VENDEDOR_RAMBLAS,
} from './mocks/account-moves.mock.js';
import {
  OdooAccountMove,
  OdooPosOrderGroup,
} from '../../odoo/types/odoo-entities.types.js';
import { StoreInvoiceTotalsDoc } from '../doc/sales.doc.js';

const JULY_FROM = '2026-07-01';
const JULY_TO = '2026-07-31';

// Ventana UTC que cubre julio completo en hora local de la tienda (UTC-6).
const JULY_UTC_WINDOW = ['2026-07-01 06:00:00', '2026-08-01 05:59:59'];

describe('StoreInvoiceTotalsService', () => {
  let odoo: OdooServiceMock;

  function buildService(
    moves: OdooAccountMove[] = JULY_ATTRIBUTION_CASES,
    orderGroups: OdooPosOrderGroup[] = JULY_POS_ORDER_GROUPS,
  ): StoreInvoiceTotalsService {
    odoo = createOdooServiceMock({ configs: ALL_STORES, moves, orderGroups });
    return new StoreInvoiceTotalsService(odoo.service);
  }

  function storeOf(items: StoreInvoiceTotalsDoc[], posConfigId: number): StoreInvoiceTotalsDoc {
    return items.find((item) => item.posConfigId === posConfigId)!;
  }

  it('atribuye cada factura a su tienda por diario y por vendedor', async () => {
    const service = buildService();

    const report = await service.findTotalsByStore({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    // San Benito: factura de caja + CCF manual + anulación.
    expect(storeOf(report.items, SAN_BENITO.id).visits).toBe(3);
    expect(storeOf(report.items, CENTRIKA.id).visits).toBe(1);
    // Ramblas: su factura de caja + una anulación, cuyo diario comparten
    // las cuatro tiendas y por eso se resuelve por el vendedor.
    expect(storeOf(report.items, RAMBLAS.id).visits).toBe(2);
    // Escalón: su factura de caja + la factura SIN vendedor, que se
    // resuelve por el diario.
    expect(storeOf(report.items, ESCALON.id).visits).toBe(2);
    expect(report.totals.visits).toBe(8);
  });

  it('suma la venta de cada tienda neta de notas de crédito', async () => {
    const service = buildService();

    const report = await service.findTotalsByStore({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    // 632.06 (caja) + 62.31 (CCF) - 98.50 (anulación)
    expect(storeOf(report.items, SAN_BENITO.id)).toEqual({
      posConfigId: SAN_BENITO.id,
      storeName: SAN_BENITO.name,
      visits: 3,
      amountUntaxed: 527.32,
      amountTax: 68.55,
      amountTotal: 595.87,
    });
    expect(storeOf(report.items, RAMBLAS.id).amountTotal).toBe(124.4);
    expect(storeOf(report.items, ESCALON.id).amountTotal).toBe(203.1);
    expect(storeOf(report.items, CENTRIKA.id).amountTotal).toBe(238.23);
  });

  it('el total del mes es la suma de las tiendas, sin error de coma flotante', async () => {
    const service = buildService();

    const report = await service.findTotalsByStore({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    expect(report.totals).toEqual({
      visits: 8,
      amountUntaxed: 1027.97,
      amountTax: 133.63,
      amountTotal: 1161.6,
    });
  });

  it('deja mayoreo fuera de las tiendas, incluso cuando usa el diario base de CENTRIKA', async () => {
    const service = buildService();

    const report = await service.findTotalsByStore({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    // Las 2 facturas de mayoreo (una en el diario de CENTRIKA, una en el
    // suyo) quedan aparte y NO suben el total de las tiendas.
    expect(report.outsideStores.visits).toBe(2);
    expect(report.outsideStores.amountTotal).toBe(577.82);
    expect(report.totals.visits).toBe(8);
    expect(storeOf(report.items, CENTRIKA.id).visits).toBe(1);
  });

  it('cuenta facturas y notas de crédito de cualquier estado, como la lista de Odoo', async () => {
    const service = buildService();

    await service.findTotalsByStore({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    expect(domainOfCall(odoo.findAccountMoves)).toEqual([
      ['invoice_date', '>=', JULY_FROM],
      ['invoice_date', '<=', JULY_TO],
      ['move_type', 'in', ['out_invoice', 'out_refund']],
    ]);
  });

  it('busca las órdenes de caja del rango en la ventana UTC del día local', async () => {
    const service = buildService();

    await service.findTotalsByStore({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    const options = odoo.readGroupPosOrders.mock.calls[0][0] as {
      domain: unknown[];
      groupby: string[];
    };
    expect(options.domain).toEqual([
      ['date_order', '>=', JULY_UTC_WINDOW[0]],
      ['date_order', '<=', JULY_UTC_WINDOW[1]],
      ['state', '!=', 'cancel'],
    ]);
    expect(options.groupby).toEqual(['user_id', 'config_id']);
  });

  it('una tienda sin facturas aparece en cero, no se omite', async () => {
    const service = buildService([POS_INVOICE_SAN_BENITO]);

    const report = await service.findTotalsByStore({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    expect(report.items).toHaveLength(ALL_STORES.length);
    expect(storeOf(report.items, RAMBLAS.id)).toMatchObject({
      visits: 0,
      amountUntaxed: 0,
      amountTax: 0,
      amountTotal: 0,
    });
  });

  it('un vendedor que cubre dos tiendas cuenta en la que más cobra', async () => {
    // El vendedor de Ramblas cubrió unos turnos en Escalón, pero la mayoría
    // de sus órdenes son de Ramblas: su anulación va a Ramblas.
    const service = buildService([ANULACION_RAMBLAS], [
      { __count: 580, user_id: VENDEDOR_RAMBLAS, config_id: [RAMBLAS.id, RAMBLAS.name] },
      { __count: 12, user_id: VENDEDOR_RAMBLAS, config_id: [ESCALON.id, ESCALON.name] },
    ]);

    const report = await service.findTotalsByStore({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    expect(storeOf(report.items, RAMBLAS.id).visits).toBe(1);
    expect(storeOf(report.items, ESCALON.id).visits).toBe(0);
  });

  it('sin dateTo cuenta un solo día', async () => {
    const service = buildService([]);

    await service.findTotalsByStore({ dateFrom: JULY_FROM });

    expect(domainOfCall(odoo.findAccountMoves).slice(0, 2)).toEqual([
      ['invoice_date', '>=', JULY_FROM],
      ['invoice_date', '<=', JULY_FROM],
    ]);
  });

  it('las facturas de mayoreo no se cuelan ni cuando no hay ninguna venta de tienda', async () => {
    const service = buildService([MAYOREO_OWN_JOURNAL, MAYOREO_IN_CENTRIKA_JOURNAL], []);

    const report = await service.findTotalsByStore({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    expect(report.totals.visits).toBe(0);
    expect(report.totals.amountTotal).toBe(0);
    expect(report.outsideStores.visits).toBe(2);
  });

  it('una factura manual de tienda sin orden de caja sigue contando', async () => {
    const service = buildService([MANUAL_CCF_SAN_BENITO, UNASSIGNED_INVOICE_ESCALON]);

    const report = await service.findTotalsByStore({ dateFrom: JULY_FROM, dateTo: JULY_TO });

    expect(storeOf(report.items, SAN_BENITO.id).amountTotal).toBe(62.31);
    expect(storeOf(report.items, ESCALON.id).amountTotal).toBe(5.25);
  });
});
