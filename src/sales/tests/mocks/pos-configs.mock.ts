import { OdooPosConfig } from '../../../odoo/types/odoo-entities.types.js';

// Ids reales de los diarios contables de Odoo (2026-09-11). Cada tienda
// tiene su propia serie fiscal, salvo "Anulación" (19) que es la MISMA
// para las cuatro — por eso no identifica ninguna tienda.
export const ANULACION_JOURNAL: [number, string] = [19, 'Anulación'];

export interface PosConfigMockData {
  id: number;
  name: string;
  invoiceJournal: [number, string];
  ccfJournal: [number, string];
  ncJournal?: [number, string];
}

// pos.config con sus diarios — la forma que StoreInvoiceTotalsService necesita
// para armar el mapa diario -> tienda.
export function posConfig(data: PosConfigMockData): OdooPosConfig {
  return {
    id: data.id,
    name: data.name,
    warehouse_id: false,
    company_id: [1, 'CACAO, S.A DE C.V'],
    active: true,
    invoice_journal_id: data.invoiceJournal,
    ccf_journal_id: data.ccfJournal,
    nr_journal_id: false,
    fex_journal_id: false,
    nc_journal_id: data.ncJournal ?? false,
    nd_journal_id: false,
    anu_journal_id: ANULACION_JOURNAL,
    create_date: '2026-01-01 00:00:00',
    write_date: '2026-01-01 00:00:00',
  };
}

// Las cuatro tiendas reales con sus diarios reales.
export const CENTRIKA = posConfig({
  id: 1,
  name: 'CENTRIKA',
  invoiceJournal: [9, 'Factura Consumidor Final'],
  ccfJournal: [17, 'Comprobante Crédito Fiscal'],
});

export const SAN_BENITO = posConfig({
  id: 2,
  name: 'San Benito',
  invoiceJournal: [54, 'Factura Consumidor Final - San Benito'],
  ccfJournal: [53, 'Comprobante Crédito Fiscal - San Benito'],
});

export const RAMBLAS = posConfig({
  id: 3,
  name: 'Tienda Ramblas',
  invoiceJournal: [63, 'Factura Consumidor Final - Ramblas'],
  ccfJournal: [62, 'Comprobante Crédito Fiscal - Ramblas'],
});

export const ESCALON = posConfig({
  id: 4,
  name: 'Sucursal Escalon',
  invoiceJournal: [69, 'Factura Consumidor Final - Escalon'],
  ccfJournal: [68, 'Comprobante Crédito Fiscal - Escalon'],
});

export const ALL_STORES: OdooPosConfig[] = [CENTRIKA, SAN_BENITO, RAMBLAS, ESCALON];
