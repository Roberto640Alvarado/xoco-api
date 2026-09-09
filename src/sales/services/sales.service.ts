import { Injectable, Logger } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { OdooMany2One, OdooSearchReadOptions } from '../../odoo/types/odoo-common.types.js';
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
// intermedios para agregar: sesiones del rango, órdenes de esas sesiones,
// líneas de esas órdenes). fetchAllPages() pagina de verdad con offset
// hasta traer todo, así que esto es solo el tamaño de cada viaje a Odoo,
// no un tope de resultados.
const INTERNAL_PAGE_SIZE = 1000;

// Tope de seguridad para que un bug de paginación (o un volumen de datos
// absurdo) no deje a fetchAllPages() en un loop infinito o trayendo
// millones de registros a memoria. Muy por encima de cualquier volumen
// real esperado (4 tiendas) — si algún día se topa, hay que revisar por
// qué hay tantos registros, no solo subir el número.
const INTERNAL_FETCH_HARD_CAP = 50_000;

function many2OneToRef(value: OdooMany2One): RefDoc | null {
  return value ? { id: value[0], name: value[1] } : null;
}

// "2026-09-02 01:00:19" -> "2026-09-02". start_at es la fecha de SESIÓN por
// la que agrupamos todo (ver CLAUDE.md / decisión confirmada con el
// usuario) — nunca la fecha de la orden individual.
function toDateOnly(value: string): string {
  return value.slice(0, 10);
}

// Suma (o resta, con `days` negativo) días a una fecha YYYY-MM-DD.
function shiftDate(date: string, days: number): string {
  const cursor = new Date(`${date}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

function enumerateDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

interface ResolvedSessions {
  sessionIds: number[];
  sessionRefById: Map<number, { session: RefDoc; posConfig: RefDoc; date: string }>;
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

  // Agrupamos por fecha de SESIÓN (no de orden): se resuelven primero las
  // pos.session dentro del rango + tienda, y desde ahí se sabe qué
  // órdenes pertenecen a cuál sesión/tienda/día.
  private async resolveSessions(
    dateFrom: string,
    dateTo: string,
    posConfigId?: number,
  ): Promise<ResolvedSessions> {
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
      'resolveSessions',
    );

    const sessionRefById = new Map<number, { session: RefDoc; posConfig: RefDoc; date: string }>();
    for (const session of sessions) {
      const posConfig = many2OneToRef(session.config_id);
      if (!posConfig || !session.start_at) continue; // no debería pasar, ambos son obligatorios en Odoo
      sessionRefById.set(session.id, {
        session: { id: session.id, name: session.name },
        posConfig,
        date: toDateOnly(session.start_at),
      });
    }

    return { sessionIds: [...sessionRefById.keys()], sessionRefById };
  }

  async findOrders(query: FindOrdersQueryDto): Promise<PaginatedOrdersDoc> {
    const dateTo = query.dateTo ?? query.dateFrom;
    const { sessionIds, sessionRefById } = await this.resolveSessions(
      query.dateFrom,
      dateTo,
      query.posConfigId,
    );

    if (sessionIds.length === 0) {
      return { items: [], meta: { total: 0, page: query.page, limit: query.limit, totalPages: 0 } };
    }

    const domain = [['session_id', 'in', sessionIds]];
    const offset = (query.page - 1) * query.limit;

    const [total, orders] = await Promise.all([
      this.odooService.countPosOrders(domain),
      this.odooService.findPosOrders({ domain, limit: query.limit, offset, order: 'date_order desc' }),
    ]);

    const items: SalesOrderDoc[] = orders.map((order) => {
      const refs = sessionRefById.get(order.session_id ? order.session_id[0] : -1);
      return {
        id: order.id,
        name: order.name,
        dateOrder: order.date_order,
        state: order.state,
        amountTotal: order.amount_total,
        amountTax: order.amount_tax,
        amountPaid: order.amount_paid,
        amountReturn: order.amount_return,
        partner: many2OneToRef(order.partner_id),
        // refs siempre debería existir (la orden vino de esta misma
        // sesión), pero por si Odoo devuelve algo inesperado no truena.
        posConfig: refs?.posConfig ?? { id: -1, name: 'Desconocido' },
        session: refs?.session ?? { id: -1, name: 'Desconocido' },
      };
    });

    return {
      items,
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
    const { sessionIds } = await this.resolveSessions(query.dateFrom, dateTo, query.posConfigId);
    if (sessionIds.length === 0) {
      return [];
    }

    // Se excluyen las órdenes canceladas: no se "vendió" nada en ellas.
    const orders = await this.fetchAllPages(
      (options) => this.odooService.findPosOrders(options),
      [
        ['session_id', 'in', sessionIds],
        ['state', '!=', 'cancel'],
      ],
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

    const direction = query.order === "asc" ? 1 : -1;
    return [...totalsByProduct.values()]
      .sort((a, b) => direction * (a.totalQuantity - b.totalQuantity))
      .slice(0, query.limit);
  }

  // Ventas agregadas por día (fecha de SESIÓN) — para la gráfica de
  // tendencia del dashboard. Rellena con ceros los días del rango que no
  // tuvieron ninguna sesión/orden, para que la gráfica no tenga huecos.
  async findDailySummary(query: FindDailySummaryQueryDto): Promise<DailySalesDoc[]> {
    const dateTo = query.dateTo ?? query.dateFrom;
    const { sessionIds, sessionRefById } = await this.resolveSessions(
      query.dateFrom,
      dateTo,
      query.posConfigId,
    );

    const totalsByDate = new Map<string, { orderCount: number; totalRevenue: number; totalTax: number }>();
    for (const date of enumerateDates(query.dateFrom, dateTo)) {
      totalsByDate.set(date, { orderCount: 0, totalRevenue: 0, totalTax: 0 });
    }

    if (sessionIds.length > 0) {
      const orders = await this.fetchAllPages(
        (options) => this.odooService.findPosOrders(options),
        [
          ['session_id', 'in', sessionIds],
          ['state', '!=', 'cancel'],
        ],
        'findDailySummary',
      );

      for (const order of orders) {
        const sessionId = order.session_id ? order.session_id[0] : undefined;
        const date = sessionId ? sessionRefById.get(sessionId)?.date : undefined;
        if (!date) continue;
        const bucket = totalsByDate.get(date);
        if (!bucket) continue; // no debería pasar: viene de una sesión ya filtrada por el mismo rango
        bucket.orderCount += 1;
        bucket.totalRevenue += order.amount_total;
        bucket.totalTax += order.amount_tax;
      }
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

  // Reporte de diagnóstico: compara, para cada tienda, cuántas órdenes
  // (y cuánta venta) da el rango pedido según los 2 métodos posibles de
  // "a qué día pertenece una orden" — por fecha de SESIÓN (start_at, lo
  // que usa el resto de la app) vs. por date_order (la fecha/hora propia
  // de la orden individual). Surgió al investigar por qué "Tráfico de
  // tiendas" no siempre cuadra 1:1 contra un conteo manual (ej. un
  // Excel): las tiendas que cierran después de medianoche tienen
  // órdenes cuyo date_order cae al día siguiente aunque pertenezcan a la
  // sesión del día anterior — un conteo manual que no distinguió entre
  // ambos métodos puede terminar corriendo esas órdenes de un día a
  // otro. Este endpoint no cambia cómo cuenta el resto de la app (la
  // fecha de sesión sigue siendo la oficial) — es una herramienta de
  // reconciliación para diagnosticar diferencias puntuales.
  async getReconciliation(query: FindReconciliationQueryDto): Promise<ReconciliationStoreDoc[]> {
    const dateFrom = query.dateFrom;
    const dateTo = query.dateTo ?? query.dateFrom;

    // Se trae una ventana 1 día más ancha a cada lado: una orden puede
    // caer dentro del rango pedido por date_order aunque su sesión haya
    // empezado el día anterior (o viceversa), y esas son justo las que
    // hay que detectar.
    const wideFrom = shiftDate(dateFrom, -1);
    const wideTo = shiftDate(dateTo, 1);

    const { sessionIds, sessionRefById } = await this.resolveSessions(wideFrom, wideTo, query.posConfigId);

    // Se trae SIEMPRE la lista completa de tiendas (para tener el nombre
    // real), aunque después se filtre a una sola si vino posConfigId —
    // así el reporte no muestra el nombre vacío cuando se pide una
    // tienda puntual.
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
          bySessionMethod: { orderCount: 0, totalRevenue: 0 },
          byOrderDateMethod: { orderCount: 0, totalRevenue: 0 },
          orderCountDifference: 0,
          stateBreakdown: {},
          boundaryOrders: [],
        };
        resultByStore.set(posConfigId, entry);
      }
      return entry;
    }

    if (sessionIds.length > 0) {
      const orders = await this.fetchAllPages(
        (options) => this.odooService.findPosOrders(options),
        [['session_id', 'in', sessionIds]],
        'getReconciliation',
      );

      for (const order of orders) {
        const sessionId = order.session_id ? order.session_id[0] : undefined;
        const refs = sessionId ? sessionRefById.get(sessionId) : undefined;
        if (!refs) continue;

        const posConfigId = refs.posConfig.id;
        const storeName = storeNameById.get(posConfigId) ?? refs.posConfig.name;
        const sessionDate = refs.date;
        const orderDate = toDateOnly(order.date_order);

        const inSessionRange = sessionDate >= dateFrom && sessionDate <= dateTo;
        const inOrderDateRange = orderDate >= dateFrom && orderDate <= dateTo;
        // Fuera de los dos rangos: la orden solo aparece por el margen
        // de 1 día de la ventana ampliada, no aporta nada a este reporte.
        if (!inSessionRange && !inOrderDateRange) continue;

        const entry = getOrInit(posConfigId, storeName);

        entry.stateBreakdown[order.state] = (entry.stateBreakdown[order.state] ?? 0) + 1;

        const countsAsSale = order.state !== 'cancel';
        if (inSessionRange && countsAsSale) {
          entry.bySessionMethod.orderCount += 1;
          entry.bySessionMethod.totalRevenue += order.amount_total;
        }
        if (inOrderDateRange && countsAsSale) {
          entry.byOrderDateMethod.orderCount += 1;
          entry.byOrderDateMethod.totalRevenue += order.amount_total;
        }

        if (inSessionRange !== inOrderDateRange) {
          const boundaryOrder: ReconciliationOrderDoc = {
            id: order.id,
            name: order.name,
            state: order.state,
            dateOrder: order.date_order,
            sessionDate,
            amountTotal: order.amount_total,
            includedBySessionMethod: inSessionRange,
            includedByOrderDateMethod: inOrderDateRange,
          };
          entry.boundaryOrders.push(boundaryOrder);
        }
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
        orderCountDifference: entry.bySessionMethod.orderCount - entry.byOrderDateMethod.orderCount,
        boundaryOrders: entry.boundaryOrders.sort((a, b) => (a.dateOrder < b.dateOrder ? -1 : 1)),
      }))
      .sort((a, b) => a.storeName.localeCompare(b.storeName));
  }
}
