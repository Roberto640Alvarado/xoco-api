import { Injectable, Logger } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { OdooMany2One, OdooSearchReadOptions } from '../../odoo/types/odoo-common.types.js';
import { OdooPosOrder } from '../../odoo/types/odoo-entities.types.js';
import {
  enumerateDates,
  shiftDate,
  storeDayRangeToUtc,
  toStoreDate,
} from '../../common/utils/store-date.util.js';
import { FindOrdersQueryDto } from '../dto/find-orders-query.dto.js';
import { FindTopProductsQueryDto } from '../dto/find-top-products-query.dto.js';
import { FindDailySummaryQueryDto } from '../dto/find-daily-summary-query.dto.js';
import { FindReconciliationQueryDto } from '../dto/find-reconciliation-query.dto.js';
import {
  DailySalesDoc,
  PaginatedOrdersDoc,
  ReconciliationOrderDoc,
  ReconciliationStoreDoc,
  RefDoc,
  SalesOrderDoc,
  StoreDoc,
  TopProductDoc,
} from '../doc/sales.doc.js';

// Tamaño de página para las consultas internas que necesitan "todo lo que
// matchea" (no son la lista paginada que ve el frontend, sino datos
// intermedios para agregar: órdenes del rango, líneas de esas órdenes).
// fetchAllPages() pagina de verdad con offset hasta traer todo, así que
// esto es solo el tamaño de cada viaje a Odoo, no un tope de resultados.
const INTERNAL_PAGE_SIZE = 1000;

// Tope de seguridad para que un bug de paginación (o un volumen de datos
// absurdo) no deje a fetchAllPages() en un loop infinito o trayendo
// millones de registros a memoria. Muy por encima de cualquier volumen
// real esperado (4 tiendas) — si algún día se topa, hay que revisar por
// qué hay tantos registros, no solo subir el número.
const INTERNAL_FETCH_HARD_CAP = 50_000;

// Órdenes canceladas: no se vendió nada en ellas, no cuentan como venta.
const CANCELLED_STATE = 'cancel';

// Margen a cada lado del rango que usa solo /sales/reconciliation, para
// alcanzar las órdenes que quedan dentro del rango por un método y fuera
// por el otro. Son 2 días (no 1) porque una sesión puede quedarse abierta
// más de 24 horas — pasó de verdad: la sesión POS/01268 de Tienda Ramblas
// abrió el 2026-09-06 y no cerró hasta el 2026-09-08.
const RECONCILIATION_MARGIN_DAYS = 2;

const UNKNOWN_REF: RefDoc = { id: -1, name: 'Desconocido' };

function many2OneToRef(value: OdooMany2One): RefDoc | null {
  return value ? { id: value[0], name: value[1] } : null;
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(private readonly odooService: OdooService) {}

  // Trae TODO lo que matchea un domain, paginando de verdad con offset en
  // vez de un solo fetch con límite alto — un solo fetch con límite trunca
  // silenciosamente en cuanto el rango de fechas junta más registros que
  // el límite (ver bug de "Visitas solo muestra los últimos ~24 días de
  // un rango de 90": con 4 tiendas, 90 días ya pasan de miles de órdenes,
  // y sin `order` explícito Odoo devuelve más reciente primero, así que
  // el corte se comía justo los días viejos del rango).
  private async fetchAllPages<T>(
    fetchPage: (options: OdooSearchReadOptions) => Promise<T[]>,
    domain: unknown[],
    contextLabel: string,
  ): Promise<T[]> {
    const all: T[] = [];
    let offset = 0;
    while (true) {
      const page = await fetchPage({ domain, limit: INTERNAL_PAGE_SIZE, offset });
      all.push(...page);
      if (page.length < INTERNAL_PAGE_SIZE) break;
      offset += INTERNAL_PAGE_SIZE;
      if (all.length >= INTERNAL_FETCH_HARD_CAP) {
        this.logger.warn(
          `${contextLabel} tocó el tope de seguridad de ${INTERNAL_FETCH_HARD_CAP} registros — revisar si hace falta subirlo.`,
        );
        break;
      }
    }
    return all;
  }

  // Domain de pos.order para un rango de DÍAS LOCALES de la tienda.
  //
  // Una orden pertenece al día en que se cobró en hora local (igual que en
  // los reportes propios de Odoo), no al día en que abrió la sesión POS:
  // las tiendas no siempre cierran caja cada noche, y una sesión que se
  // queda abierta 40 horas dejaría días enteros en cero. Como Odoo guarda
  // date_order en UTC, el rango local se traduce a la ventana UTC que lo
  // cubre (ver store-date.util.ts).
  private buildOrdersDomain(
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
      domain.push(['state', '!=', CANCELLED_STATE]);
    }
    return domain;
  }

  private toSalesOrderDoc(order: OdooPosOrder): SalesOrderDoc {
    return {
      id: order.id,
      name: order.name,
      dateOrder: order.date_order,
      date: toStoreDate(order.date_order),
      state: order.state,
      amountTotal: order.amount_total,
      amountTax: order.amount_tax,
      amountPaid: order.amount_paid,
      amountReturn: order.amount_return,
      partner: many2OneToRef(order.partner_id),
      // Ambos son obligatorios en Odoo; el fallback es solo para que una
      // respuesta inesperada no tire el endpoint entero.
      posConfig: many2OneToRef(order.config_id) ?? UNKNOWN_REF,
      session: many2OneToRef(order.session_id) ?? UNKNOWN_REF,
    };
  }

  async findOrders(query: FindOrdersQueryDto): Promise<PaginatedOrdersDoc> {
    const dateTo = query.dateTo ?? query.dateFrom;
    const domain = this.buildOrdersDomain(query.dateFrom, dateTo, query.posConfigId);
    const offset = (query.page - 1) * query.limit;

    const [total, orders] = await Promise.all([
      this.odooService.countPosOrders(domain),
      this.odooService.findPosOrders({
        domain,
        limit: query.limit,
        offset,
        order: 'date_order desc',
      }),
    ]);

    return {
      items: orders.map((order) => this.toSalesOrderDoc(order)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findTopProducts(query: FindTopProductsQueryDto): Promise<TopProductDoc[]> {
    const dateTo = query.dateTo ?? query.dateFrom;
    const orders = await this.fetchAllPages(
      (options) => this.odooService.findPosOrders(options),
      this.buildOrdersDomain(query.dateFrom, dateTo, query.posConfigId, {
        excludeCancelled: true,
      }),
      'findTopProducts (órdenes)',
    );
    if (orders.length === 0) {
      return [];
    }

    const orderIds = orders.map((order) => order.id);
    const lines = await this.fetchAllPages(
      (options) => this.odooService.findPosOrderLines(options),
      [['order_id', 'in', orderIds]],
      'findTopProducts (líneas)',
    );

    const totalsByProduct = new Map<number, TopProductDoc>();
    for (const line of lines) {
      if (!line.product_id) continue;
      const [productId, productName] = line.product_id;
      const existing = totalsByProduct.get(productId);
      if (existing) {
        existing.totalQuantity += line.qty;
        existing.totalRevenue += line.price_subtotal_incl;
      } else {
        totalsByProduct.set(productId, {
          productId,
          productName,
          totalQuantity: line.qty,
          totalRevenue: line.price_subtotal_incl,
        });
      }
    }

    const direction = query.order === 'asc' ? 1 : -1;
    return [...totalsByProduct.values()]
      .sort((a, b) => direction * (a.totalQuantity - b.totalQuantity))
      .slice(0, query.limit);
  }

  // Ventas agregadas por día local de la tienda — para la gráfica de
  // tendencia del dashboard. Rellena con ceros los días del rango que no
  // tuvieron ninguna venta, para que la gráfica no tenga huecos.
  async findDailySummary(query: FindDailySummaryQueryDto): Promise<DailySalesDoc[]> {
    const dateTo = query.dateTo ?? query.dateFrom;

    const totalsByDate = new Map<
      string,
      { orderCount: number; totalRevenue: number; totalTax: number }
    >();
    for (const date of enumerateDates(query.dateFrom, dateTo)) {
      totalsByDate.set(date, { orderCount: 0, totalRevenue: 0, totalTax: 0 });
    }

    const orders = await this.fetchAllPages(
      (options) => this.odooService.findPosOrders(options),
      this.buildOrdersDomain(query.dateFrom, dateTo, query.posConfigId, {
        excludeCancelled: true,
      }),
      'findDailySummary',
    );

    for (const order of orders) {
      const bucket = totalsByDate.get(toStoreDate(order.date_order));
      if (!bucket) continue; // no debería pasar: el domain ya filtró por el mismo rango
      bucket.orderCount += 1;
      bucket.totalRevenue += order.amount_total;
      bucket.totalTax += order.amount_tax;
    }

    return [...totalsByDate.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, totals]) => ({ date, ...totals }));
  }

  // Tiendas activas — para el filtro de tienda del dashboard.
  async findStores(): Promise<StoreDoc[]> {
    const configs = await this.odooService.findPosConfigs({
      domain: [['active', '=', true]],
      order: 'name asc',
    });
    return configs.map((config) => ({ id: config.id, name: config.name }));
  }

  // Sesiones del rango indexadas por id, con la fecha (UTC) en que
  // abrieron. Solo la usa /sales/reconciliation, para poder reproducir el
  // método de agrupación ANTERIOR (por fecha de sesión) y compararlo
  // contra el actual.
  private async findSessionDates(
    dateFrom: string,
    dateTo: string,
    posConfigId?: number,
  ): Promise<Map<number, string>> {
    const domain: unknown[] = [
      ['start_at', '>=', `${dateFrom} 00:00:00`],
      ['start_at', '<=', `${dateTo} 23:59:59`],
    ];
    if (posConfigId) {
      domain.push(['config_id', '=', posConfigId]);
    }

    const sessions = await this.fetchAllPages(
      (options) => this.odooService.findPosSessions(options),
      domain,
      'findSessionDates',
    );

    return new Map(
      sessions
        .filter((session) => session.start_at)
        .map((session) => [session.id, (session.start_at as string).slice(0, 10)]),
    );
  }

  // Reporte de diagnóstico: compara, para cada tienda, cuántas órdenes (y
  // cuánta venta) da el rango pedido según los 2 métodos de "a qué día
  // pertenece una orden":
  //
  //   - byStoreDayMethod — día LOCAL de date_order. Es el método oficial
  //     de la app desde el fix de septiembre 2026, y el que usan los
  //     propios reportes de Odoo.
  //   - bySessionMethod — fecha (UTC) en que abrió la sesión POS. Era el
  //     método anterior; se mantiene aquí solo para poder explicar por qué
  //     un número histórico cambió.
  //
  // Sigue siendo una herramienta de diagnóstico para cuadrar contra un
  // conteo externo (ej. un Excel), no un módulo del dashboard.
  async getReconciliation(query: FindReconciliationQueryDto): Promise<ReconciliationStoreDoc[]> {
    const dateFrom = query.dateFrom;
    const dateTo = query.dateTo ?? query.dateFrom;
    const wideFrom = shiftDate(dateFrom, -RECONCILIATION_MARGIN_DAYS);
    const wideTo = shiftDate(dateTo, RECONCILIATION_MARGIN_DAYS);

    const sessionDateById = await this.findSessionDates(wideFrom, wideTo, query.posConfigId);

    // Dos barridos, porque los 2 métodos alcanzan conjuntos distintos: una
    // orden puede entrar por su día local aunque su sesión haya abierto
    // fuera de la ventana, o al revés. Se unen por id para no contar doble.
    const [byDate, bySession] = await Promise.all([
      this.fetchAllPages(
        (options) => this.odooService.findPosOrders(options),
        this.buildOrdersDomain(wideFrom, wideTo, query.posConfigId),
        'getReconciliation (por día local)',
      ),
      sessionDateById.size === 0
        ? Promise.resolve([])
        : this.fetchAllPages(
            (options) => this.odooService.findPosOrders(options),
            [['session_id', 'in', [...sessionDateById.keys()]]],
            'getReconciliation (por sesión)',
          ),
    ]);
    const ordersById = new Map<number, OdooPosOrder>();
    for (const order of [...byDate, ...bySession]) {
      ordersById.set(order.id, order);
    }

    // Se trae SIEMPRE la lista completa de tiendas (para tener el nombre
    // real), aunque después se filtre a una sola si vino posConfigId — así
    // el reporte no muestra el nombre vacío cuando se pide una tienda
    // puntual.
    const allStores = await this.findStores();
    const stores = query.posConfigId
      ? allStores.filter((store) => store.id === query.posConfigId)
      : allStores;
    const storeNameById = new Map(allStores.map((store) => [store.id, store.name]));

    const resultByStore = new Map<number, ReconciliationStoreDoc>();
    function getOrInit(posConfigId: number, storeName: string): ReconciliationStoreDoc {
      let entry = resultByStore.get(posConfigId);
      if (!entry) {
        entry = {
          posConfigId,
          storeName,
          byStoreDayMethod: { orderCount: 0, totalRevenue: 0 },
          bySessionMethod: { orderCount: 0, totalRevenue: 0 },
          orderCountDifference: 0,
          stateBreakdown: {},
          boundaryOrders: [],
        };
        resultByStore.set(posConfigId, entry);
      }
      return entry;
    }

    for (const order of ordersById.values()) {
      const posConfig = many2OneToRef(order.config_id);
      if (!posConfig) continue;
      if (query.posConfigId && posConfig.id !== query.posConfigId) continue;

      const storeDate = toStoreDate(order.date_order);
      const sessionId = order.session_id ? order.session_id[0] : undefined;
      const sessionDate = sessionId ? sessionDateById.get(sessionId) : undefined;

      const inStoreDayRange = storeDate >= dateFrom && storeDate <= dateTo;
      // Sin sessionDate la sesión abrió fuera de la ventana ampliada, así
      // que con el método anterior esta orden tampoco caía en el rango.
      const inSessionRange = !!sessionDate && sessionDate >= dateFrom && sessionDate <= dateTo;
      // Fuera de los dos: la orden solo aparece por el margen de la
      // ventana ampliada, no aporta nada a este reporte.
      if (!inStoreDayRange && !inSessionRange) continue;

      const entry = getOrInit(posConfig.id, storeNameById.get(posConfig.id) ?? posConfig.name);

      entry.stateBreakdown[order.state] = (entry.stateBreakdown[order.state] ?? 0) + 1;

      const countsAsSale = order.state !== CANCELLED_STATE;
      if (inStoreDayRange && countsAsSale) {
        entry.byStoreDayMethod.orderCount += 1;
        entry.byStoreDayMethod.totalRevenue += order.amount_total;
      }
      if (inSessionRange && countsAsSale) {
        entry.bySessionMethod.orderCount += 1;
        entry.bySessionMethod.totalRevenue += order.amount_total;
      }

      if (inStoreDayRange !== inSessionRange) {
        const boundaryOrder: ReconciliationOrderDoc = {
          id: order.id,
          name: order.name,
          state: order.state,
          dateOrder: order.date_order,
          storeDate,
          sessionDate: sessionDate ?? null,
          amountTotal: order.amount_total,
          includedByStoreDayMethod: inStoreDayRange,
          includedBySessionMethod: inSessionRange,
        };
        entry.boundaryOrders.push(boundaryOrder);
      }
    }

    // Tiendas sin ninguna orden en el rango también aparecen, en ceros
    // (igual que el resto de reportes de la app).
    for (const store of stores) {
      getOrInit(store.id, store.name);
    }

    return [...resultByStore.values()]
      .map((entry) => ({
        ...entry,
        orderCountDifference:
          entry.byStoreDayMethod.orderCount - entry.bySessionMethod.orderCount,
        boundaryOrders: entry.boundaryOrders.sort((a, b) => (a.dateOrder < b.dateOrder ? -1 : 1)),
      }))
      .sort((a, b) => a.storeName.localeCompare(b.storeName));
  }
}
