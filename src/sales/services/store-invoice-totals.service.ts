import { Injectable, Logger } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { OdooMany2One } from '../../odoo/types/odoo-common.types.js';
import {
  OdooAccountMove,
  OdooPosConfig,
} from '../../odoo/types/odoo-entities.types.js';
import { OdooPosOrderState } from '../../odoo/enums/odoo-pos-order.enum.js';
import { storeDayRangeToUtc } from '../../common/utils/store-date.util.js';
import { fetchAllOdooPages } from '../../common/utils/odoo-pagination.util.js';
import { roundMoney } from '../../common/utils/money.util.js';
import { buildCustomerInvoiceDomain } from '../builders/customer-invoice-domain.builder.js';
import { FindInvoiceRangeQueryDto } from '../dto/find-invoice-range-query.dto.js';
import {
  StoreInvoiceTotalsDoc,
  StoreInvoiceTotalsReportDoc,
  InvoiceTotalsDoc,
} from '../doc/sales.doc.js';

// Campos de pos.config que apuntan a un diario contable. Una factura de
// tienda cae en alguno de estos (FCF, CCF, notas de crédito/débito,
// anulación, etc.).
const STORE_JOURNAL_FIELDS: (keyof OdooPosConfig)[] = [
  'invoice_journal_id',
  'ccf_journal_id',
  'nr_journal_id',
  'fex_journal_id',
  'nc_journal_id',
  'nd_journal_id',
  'anu_journal_id',
];

interface TotalsAccumulator {
  visits: number;
  amountUntaxed: number;
  amountTotal: number;
}

function emptyTotals(): TotalsAccumulator {
  return { visits: 0, amountUntaxed: 0, amountTotal: 0 };
}

function toTotalsDoc(totals: TotalsAccumulator): InvoiceTotalsDoc {
  const amountUntaxed = roundMoney(totals.amountUntaxed);
  const amountTotal = roundMoney(totals.amountTotal);
  return {
    visits: totals.visits,
    amountUntaxed,
    amountTax: roundMoney(amountTotal - amountUntaxed),
    amountTotal,
  };
}

// Visitas y venta por TIENDA, contando FACTURAS.
//
// Para el negocio una "visita" es una factura del período y la venta del
// mes es la suma de esas facturas — es lo que saca el equipo del módulo
// de Contabilidad de Odoo agrupando la lista de facturas. Contra su
// conteo de julio 2026 este servicio da el número exacto:
//
//   CENTRIKA 563 / $15,706.07 · San Benito 964 / $17,643.47 ·
//   Ramblas 581 / $7,887.60 · Escalón 567
//
// mientras que contar `pos.order` daba 2,673 visitas y $49,642.99.
//
// El problema a resolver es que una factura no tiene tienda: tiene
// vendedor y diario contable. La atribución usa las dos cosas y se apoya
// en lo que sí es dato duro de Odoo:
//
//   1. El mapa DIARIO -> TIENDA sale de los diarios configurados en cada
//      `pos.config`. Cada tienda tiene su propia serie fiscal (FCF, CCF,
//      notas de crédito), así que el diario identifica la tienda. El
//      diario de "Anulación" es el MISMO para las cuatro, así que se
//      descarta del mapa.
//   2. El mapa VENDEDOR -> TIENDA sale de agrupar las órdenes de caja del
//      mismo rango por vendedor y tienda. Sirve para resolver las
//      facturas que caen en un diario compartido, y — sobre todo — para
//      distinguir MAYOREO: un vendedor que no cobra en ninguna caja
//      (Mario Segura, Celine) no pertenece a ninguna tienda, y sus
//      facturas se dejan fuera aunque usen el diario base de la compañía,
//      que es el mismo de CENTRIKA.
//
// Mayoreo NO entra en los totales de tienda por decisión del negocio (las
// filas del panel son tiendas); se devuelve aparte en `outsideStores`
// para que el número no desaparezca sin explicación. Ver plan-history
// "visitas-por-vendedor-facturas".
@Injectable()
export class StoreInvoiceTotalsService {
  private readonly logger = new Logger(StoreInvoiceTotalsService.name);

  constructor(private readonly odooService: OdooService) {}

  // Diario -> tienda, descartando los diarios que comparten varias
  // tiendas (Anulación) porque no identifican ninguna.
  private buildJournalToStoreMap(configs: OdooPosConfig[]): Map<number, number> {
    const journalToStore = new Map<number, number>();
    const sharedJournals = new Set<number>();

    for (const config of configs) {
      for (const field of STORE_JOURNAL_FIELDS) {
        const journal = config[field] as OdooMany2One;
        if (!journal) continue;
        const [journalId] = journal;
        const owner = journalToStore.get(journalId);
        if (owner != null && owner !== config.id) {
          sharedJournals.add(journalId);
        } else {
          journalToStore.set(journalId, config.id);
        }
      }
    }

    for (const journalId of sharedJournals) {
      journalToStore.delete(journalId);
    }
    return journalToStore;
  }

  // Vendedor -> tienda donde cobra, según las órdenes de caja del rango.
  // Un vendedor que no aparece aquí no cobra en ninguna caja: es de otro
  // canal (mayoreo).
  //
  // A propósito se usa el MISMO rango y no una ventana más amplia: con un
  // año de histórico, mayoreo aparece con alguna orden de caja vieja y
  // dejaría de distinguirse (probado contra Odoo: metía sus ~180 facturas
  // de julio dentro de San Benito).
  private async buildSalespersonToStoreMap(
    dateFrom: string,
    dateTo: string,
  ): Promise<Map<number, number>> {
    const { utcFrom, utcTo } = storeDayRangeToUtc(dateFrom, dateTo);
    const groups = await this.odooService.readGroupPosOrders({
      domain: [
        ['date_order', '>=', utcFrom],
        ['date_order', '<=', utcTo],
        ['state', '!=', OdooPosOrderState.CANCEL],
      ],
      fields: ['id'],
      groupby: ['user_id', 'config_id'],
    });

    // Un vendedor puede cubrir turnos en más de una tienda: gana la
    // tienda donde cobró más órdenes.
    const ordersByStore = new Map<number, Map<number, number>>();
    for (const group of groups) {
      if (!group.user_id || !group.config_id) continue;
      const stores = ordersByStore.get(group.user_id[0]) ?? new Map<number, number>();
      stores.set(group.config_id[0], (stores.get(group.config_id[0]) ?? 0) + group.__count);
      ordersByStore.set(group.user_id[0], stores);
    }

    return new Map(
      [...ordersByStore].map(([userId, stores]) => [
        userId,
        [...stores].sort(([, a], [, b]) => b - a)[0][0],
      ]),
    );
  }

  // A qué tienda pertenece una factura, o `null` si no es de ninguna
  // (mayoreo). El orden de las reglas es el que reproduce el conteo del
  // equipo — ver el comentario de la clase.
  private resolveStore(
    move: OdooAccountMove,
    journalToStore: Map<number, number>,
    salespersonToStore: Map<number, number>,
  ): number | null {
    const journalStore = move.journal_id ? journalToStore.get(move.journal_id[0]) : undefined;

    // Sin vendedor asignado: manda el diario. Es el caso de una factura
    // emitida en la serie de la tienda sin asignar a nadie (en julio 2026
    // hay una así, borrador, en el diario de Escalón).
    if (!move.invoice_user_id) {
      return journalStore ?? null;
    }

    const salespersonStore = salespersonToStore.get(move.invoice_user_id[0]);

    // Vendedor que no cobra en ninguna caja del rango: otro canal
    // (mayoreo).
    if (salespersonStore == null) {
      return null;
    }

    // Factura emitida desde una caja: la tienda es la de su serie fiscal.
    if (move.pos_order_ids.length > 0) {
      return journalStore ?? salespersonStore;
    }

    // Facturación manual de un vendedor de tienda (un CCF que pidió el
    // cliente, una anulación): si el diario apunta a su misma tienda se
    // usa, y si es un diario compartido manda el vendedor.
    return journalStore === salespersonStore ? journalStore : salespersonStore;
  }

  async findTotalsByStore(
    query: FindInvoiceRangeQueryDto,
  ): Promise<StoreInvoiceTotalsReportDoc> {
    const dateFrom = query.dateFrom;
    const dateTo = query.dateTo ?? query.dateFrom;

    const [configs, salespersonToStore, moves] = await Promise.all([
      this.odooService.findPosConfigs({ domain: [['active', '=', true]], order: 'name asc' }),
      this.buildSalespersonToStoreMap(dateFrom, dateTo),
      fetchAllOdooPages(
        (options) => this.odooService.findAccountMoves(options),
        buildCustomerInvoiceDomain(dateFrom, dateTo),
        'findTotalsByStore (facturas)',
        this.logger,
      ),
    ]);

    const journalToStore = this.buildJournalToStoreMap(configs);

    const totalsByStore = new Map<number, TotalsAccumulator>();
    const outsideStores = emptyTotals();
    for (const move of moves) {
      const storeId = this.resolveStore(move, journalToStore, salespersonToStore);
      const bucket =
        storeId == null
          ? outsideStores
          : (totalsByStore.get(storeId) ?? totalsByStore.set(storeId, emptyTotals()).get(storeId)!);
      bucket.visits += 1;
      bucket.amountUntaxed += move.amount_untaxed_signed;
      bucket.amountTotal += move.amount_total_signed;
    }

    // Todas las tiendas activas aparecen, en cero si no facturaron —
    // igual que el resto de los reportes del módulo.
    const items: StoreInvoiceTotalsDoc[] = configs.map((config) => ({
      posConfigId: config.id,
      storeName: config.name,
      ...toTotalsDoc(totalsByStore.get(config.id) ?? emptyTotals()),
    }));

    const totals = items.reduce<TotalsAccumulator>(
      (accumulated, item) => ({
        visits: accumulated.visits + item.visits,
        amountUntaxed: accumulated.amountUntaxed + item.amountUntaxed,
        amountTotal: accumulated.amountTotal + item.amountTotal,
      }),
      emptyTotals(),
    );

    return {
      items,
      totals: toTotalsDoc(totals),
      outsideStores: toTotalsDoc(outsideStores),
    };
  }
}
