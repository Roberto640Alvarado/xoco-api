import { Injectable, Logger } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { OdooMany2One, OdooSearchReadOptions } from '../../odoo/types/odoo-common.types.js';
import { OdooPosOrder, OdooPosOrderLine } from '../../odoo/types/odoo-entities.types.js';
import { OdooPosOrderState } from '../../odoo/enums/odoo-pos-order.enum.js';
import {
  enumerateDates,
  endOfMonth,
  shiftDate,
  shiftMonthStart,
  startOfMonth,
  storeDayRangeToUtc,
  toStoreDate,
  todayStoreDate,
} from '../../common/utils/store-date.util.js';
import { fetchAllOdooPages } from '../../common/utils/odoo-pagination.util.js';
import { roundMoney } from '../../common/utils/money.util.js';
import { isWeightUom, weightKgFactor } from '../utils/product-uom.util.js';
import { FindOrdersQueryDto } from '../dto/find-orders-query.dto.js';
import { FindTopProductsQueryDto } from '../dto/find-top-products-query.dto.js';
import { FindProductMonthlyComparisonQueryDto } from '../dto/find-product-monthly-comparison-query.dto.js';
import { FindTopProductsByCategoryQueryDto } from '../dto/find-top-products-by-category-query.dto.js';
import { FindDailySummaryQueryDto } from '../dto/find-daily-summary-query.dto.js';
import { FindReconciliationQueryDto } from '../dto/find-reconciliation-query.dto.js';
import {
  CategoryTopProductsDoc,
  DailySalesDoc,
  PaginatedOrdersDoc,
  PaymentMethodBucketDoc,
  PaymentMethodsSummaryDoc,
  ProductMonthlyComparisonDoc,
  ReconciliationOrderDoc,
  ReconciliationStoreDoc,
  RefDoc,
  SalesOrderDoc,
  StoreDoc,
  TopProductByWeightDoc,
  TopProductDoc,
} from '../doc/sales.doc.js';

// Margen a cada lado del rango que usa solo /sales/reconciliation, para
// alcanzar las órdenes que quedan dentro del rango por un método y fuera
// por el otro. Son 2 días (no 1) porque una sesión puede quedarse abierta
// más de 24 horas — pasó de verdad: la sesión POS/01268 de Tienda Ramblas
// abrió el 2026-09-06 y no cerró hasta el 2026-09-08.
const RECONCILIATION_MARGIN_DAYS = 2;

const UNKNOWN_REF: RefDoc = { id: -1, name: 'Desconocido' };

// Todo producto en Odoo debería tener categ_id (campo obligatorio), pero
// se deja un fallback igual que UNKNOWN_REF por si alguno queda sin
// resolver (ej. producto archivado que ya no matchea el search_read de
// productos) — mejor agruparlo aparte que perder su ingreso del total.
const UNCATEGORIZED_REF: RefDoc = { id: -1, name: 'Sin categoría' };

function many2OneToRef(value: OdooMany2One): RefDoc | null {
  return value ? { id: value[0], name: value[1] } : null;
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(private readonly odooService: OdooService) {}

  // Ver fetchAllOdooPages() — la paginación real vive en common/utils
  // porque también la usa StoreInvoiceTotalsService.
  private fetchAllPages<T>(
    fetchPage: (options: OdooSearchReadOptions) => Promise<T[]>,
    domain: unknown[],
    contextLabel: string,
  ): Promise<T[]> {
    return fetchAllOdooPages(fetchPage, domain, contextLabel, this.logger);
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
      domain.push(['state', '!=', OdooPosOrderState.CANCEL]);
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

  // Trae órdenes + líneas de un rango en un solo viaje reutilizable — lo
  // usan findTopProducts, findTopProductsByWeight y
  // findProductMonthlyComparison. Si no hay órdenes, ni siquiera consulta
  // líneas (ver el test que lo cubre).
  private async fetchOrdersAndLines(
    dateFrom: string,
    dateTo: string,
    posConfigId: number | undefined,
    contextLabel: string,
  ): Promise<{ orders: OdooPosOrder[]; lines: OdooPosOrderLine[] }> {
    const orders = await this.fetchAllPages(
      (options) => this.odooService.findPosOrders(options),
      this.buildOrdersDomain(dateFrom, dateTo, posConfigId, { excludeCancelled: true }),
      `${contextLabel} (órdenes)`,
    );
    if (orders.length === 0) {
      return { orders, lines: [] };
    }

    const orderIds = orders.map((order) => order.id);
    const lines = await this.fetchAllPages(
      (options) => this.odooService.findPosOrderLines(options),
      [['order_id', 'in', orderIds]],
      `${contextLabel} (líneas)`,
    );
    return { orders, lines };
  }

  async findTopProducts(query: FindTopProductsQueryDto): Promise<TopProductDoc[]> {
    const dateTo = query.dateTo ?? query.dateFrom;
    const { lines } = await this.fetchOrdersAndLines(
      query.dateFrom,
      dateTo,
      query.posConfigId,
      'findTopProducts',
    );

    const totalsByProduct = new Map<number, TopProductDoc>();
    for (const line of lines) {
      if (!line.product_id) continue;
      // Productos a granel (UoM de peso, ej. "Crocks" en g/kg) tienen su
      // propio ranking en findTopProductsByWeight — su `qty` no está en
      // piezas, así que mezclarla aquí infla el ranking por unidades sin
      // ser comparable al resto del catálogo (ver product-uom.util.ts).
      if (isWeightUom(line.product_uom_id)) continue;
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

  // Contraparte de findTopProducts para productos a granel: mismo rango y
  // filtros, pero solo líneas cuya UoM es de peso, y ordenado/agregado por
  // kilogramos en vez de piezas (siempre convertido a kg, sea cual sea la
  // UoM nativa de la línea).
  async findTopProductsByWeight(query: FindTopProductsQueryDto): Promise<TopProductByWeightDoc[]> {
    const dateTo = query.dateTo ?? query.dateFrom;
    const { lines } = await this.fetchOrdersAndLines(
      query.dateFrom,
      dateTo,
      query.posConfigId,
      'findTopProductsByWeight',
    );

    const totalsByProduct = new Map<number, TopProductByWeightDoc>();
    for (const line of lines) {
      if (!line.product_id) continue;
      const factor = weightKgFactor(line.product_uom_id);
      if (factor === null) continue; // no es un producto a granel

      const [productId, productName] = line.product_id;
      const kg = line.qty * factor;
      const existing = totalsByProduct.get(productId);
      if (existing) {
        existing.totalKg += kg;
        existing.totalRevenue += line.price_subtotal_incl;
      } else {
        totalsByProduct.set(productId, {
          productId,
          productName,
          totalKg: kg,
          totalRevenue: line.price_subtotal_incl,
        });
      }
    }

    const direction = query.order === 'asc' ? 1 : -1;
    return [...totalsByProduct.values()]
      .sort((a, b) => direction * (a.totalKg - b.totalKg))
      .slice(0, query.limit);
  }

  // Top N productos por INGRESOS dentro de cada categoría (product.category
  // de Odoo). A diferencia de findTopProducts/findTopProductsByWeight, acá
  // NO se separan los productos a granel: el ingreso ($) es comparable
  // entre un producto por pieza y uno por peso, así que conviven en el
  // mismo ranking de su categoría sin necesitar una unidad común.
  //
  // pos.order.line no trae la categoría del producto — solo product_id
  // (id, nombre) — así que hace falta un segundo viaje a product.product
  // para resolver categ_id de los productos que sí se vendieron en el
  // rango (nunca se piden TODOS los productos del catálogo, solo los que
  // aparecen en `lines`).
  async findTopProductsByCategory(
    query: FindTopProductsByCategoryQueryDto,
  ): Promise<CategoryTopProductsDoc[]> {
    const dateTo = query.dateTo ?? query.dateFrom;
    const { lines } = await this.fetchOrdersAndLines(
      query.dateFrom,
      dateTo,
      query.posConfigId,
      'findTopProductsByCategory',
    );

    interface ProductRevenue {
      productId: number;
      productName: string;
      revenue: number;
    }
    const revenueByProductId = new Map<number, ProductRevenue>();
    for (const line of lines) {
      if (!line.product_id) continue;
      const [productId, productName] = line.product_id;
      const existing = revenueByProductId.get(productId);
      if (existing) {
        existing.revenue += line.price_subtotal_incl;
      } else {
        revenueByProductId.set(productId, { productId, productName, revenue: line.price_subtotal_incl });
      }
    }
    if (revenueByProductId.size === 0) {
      return [];
    }

    const products = await this.fetchAllPages(
      (options) => this.odooService.findProducts(options),
      [['id', 'in', [...revenueByProductId.keys()]]],
      'findTopProductsByCategory (productos)',
    );
    const categoryByProductId = new Map<number, RefDoc>();
    for (const product of products) {
      categoryByProductId.set(
        product.id,
        many2OneToRef(product.categ_id) ?? UNCATEGORIZED_REF,
      );
    }

    interface CategoryBucket {
      categoryId: number;
      categoryName: string;
      totalRevenue: number;
      products: { productId: number; productName: string; revenue: number }[];
    }
    const byCategory = new Map<number, CategoryBucket>();
    for (const product of revenueByProductId.values()) {
      const category = categoryByProductId.get(product.productId) ?? UNCATEGORIZED_REF;
      const bucket = byCategory.get(category.id) ?? {
        categoryId: category.id,
        categoryName: category.name,
        totalRevenue: 0,
        products: [],
      };
      bucket.totalRevenue += product.revenue;
      bucket.products.push({
        productId: product.productId,
        productName: product.productName,
        revenue: product.revenue,
      });
      byCategory.set(category.id, bucket);
    }

    const direction = query.order === 'asc' ? 1 : -1;
    return [...byCategory.values()]
      .sort((a, b) => b.totalRevenue - a.totalRevenue) // categorías con más venta primero
      .map((bucket) => ({
        categoryId: bucket.categoryId,
        categoryName: bucket.categoryName,
        products: bucket.products
          .sort((a, b) => direction * (a.revenue - b.revenue))
          .slice(0, query.limit),
      }));
  }

  // Top N productos (por unidades del mes en curso) con su comparación
  // contra el mes anterior COMPLETO — para el gráfico de "mes en curso
  // arriba / mes anterior abajo" del dashboard de productos. Un solo viaje
  // a Odoo que cubre ambos meses; cada orden se clasifica en su período por
  // su día LOCAL de tienda (igual que el resto de /sales), y las líneas a
  // granel se excluyen igual que en findTopProducts.
  async findProductMonthlyComparison(
    query: FindProductMonthlyComparisonQueryDto,
  ): Promise<ProductMonthlyComparisonDoc[]> {
    const today = query.referenceDate ?? todayStoreDate();
    const currentMonthFrom = startOfMonth(today);
    const currentMonthTo = today;
    const previousMonthFrom = shiftMonthStart(currentMonthFrom, -1);
    const previousMonthTo = endOfMonth(previousMonthFrom);

    const { orders, lines } = await this.fetchOrdersAndLines(
      previousMonthFrom,
      currentMonthTo,
      query.posConfigId,
      'findProductMonthlyComparison',
    );
    if (orders.length === 0) {
      return [];
    }

    type Period = 'current' | 'previous';
    const periodByOrderId = new Map<number, Period>();
    for (const order of orders) {
      const storeDate = toStoreDate(order.date_order);
      if (storeDate >= currentMonthFrom && storeDate <= currentMonthTo) {
        periodByOrderId.set(order.id, 'current');
      } else if (storeDate >= previousMonthFrom && storeDate <= previousMonthTo) {
        periodByOrderId.set(order.id, 'previous');
      }
      // Fuera de ambos rangos no debería pasar: el domain ya pidió
      // exactamente [previousMonthFrom, currentMonthTo].
    }

    interface ProductTotals {
      productName: string;
      quantity: number;
      revenue: number;
    }
    const currentByProduct = new Map<number, ProductTotals>();
    const previousByProduct = new Map<number, ProductTotals>();

    for (const line of lines) {
      if (!line.product_id || !line.order_id) continue;
      if (isWeightUom(line.product_uom_id)) continue; // ver findTopProducts

      const period = periodByOrderId.get(line.order_id[0]);
      if (!period) continue;

      const bucket = period === 'current' ? currentByProduct : previousByProduct;
      const [productId, productName] = line.product_id;
      const existing = bucket.get(productId);
      if (existing) {
        existing.quantity += line.qty;
        existing.revenue += line.price_subtotal_incl;
      } else {
        bucket.set(productId, { productName, quantity: line.qty, revenue: line.price_subtotal_incl });
      }
    }

    const productIds = new Set([...currentByProduct.keys(), ...previousByProduct.keys()]);
    const rows: ProductMonthlyComparisonDoc[] = [...productIds].map((productId) => {
      const current = currentByProduct.get(productId);
      const previous = previousByProduct.get(productId);
      return {
        productId,
        productName: current?.productName ?? previous?.productName ?? 'Desconocido',
        currentMonth: {
          dateFrom: currentMonthFrom,
          dateTo: currentMonthTo,
          quantity: current?.quantity ?? 0,
          revenue: current?.revenue ?? 0,
        },
        previousMonth: {
          dateFrom: previousMonthFrom,
          dateTo: previousMonthTo,
          quantity: previous?.quantity ?? 0,
          revenue: previous?.revenue ?? 0,
        },
      };
    });

    return rows
      .sort((a, b) => b.currentMonth.quantity - a.currentMonth.quantity)
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

  // "Efectivo vs. otros medios" — agrega los pagos (pos.payment) de las
  // órdenes del rango/tienda pedidos, agrupados por método de pago, y los
  // separa en 2 baldes según `pos.payment.method.type` de Odoo: "cash" es
  // Efectivo (cada tienda tiene el suyo propio, ej. "Efectivo Ramblas" —
  // se agrupan todos como un solo balde), cualquier otro type (tarjeta,
  // transferencia, apps de delivery, cuenta de cliente) cae en "otros
  // medios". `methods` trae el desglose completo, por si se quiere ver
  // más allá de las 2 categorías.
  //
  // Mismo domain de órdenes que el resto de reportes por caja
  // (buildOrdersDomain, excluye canceladas) — los pagos no tienen tienda
  // propia, se resuelven a través de la orden que pagan.
  async findPaymentMethodsSummary(query: FindDailySummaryQueryDto): Promise<PaymentMethodsSummaryDoc> {
    const dateTo = query.dateTo ?? query.dateFrom;

    const emptyBucket = (): PaymentMethodBucketDoc => ({ paymentCount: 0, amountTotal: 0 });

    const orders = await this.fetchAllPages(
      (options) => this.odooService.findPosOrders(options),
      this.buildOrdersDomain(query.dateFrom, dateTo, query.posConfigId, { excludeCancelled: true }),
      'findPaymentMethodsSummary (órdenes)',
    );
    if (orders.length === 0) {
      return { cash: emptyBucket(), other: emptyBucket(), total: emptyBucket(), methods: [] };
    }

    const orderIds = orders.map((order) => order.id);
    const [paymentGroups, paymentMethods] = await Promise.all([
      this.odooService.readGroupPosPayments({
        domain: [['pos_order_id', 'in', orderIds]],
        fields: ['amount'],
        groupby: ['payment_method_id'],
      }),
      this.odooService.findPosPaymentMethods(),
    ]);

    const typeByMethodId = new Map(paymentMethods.map((method) => [method.id, method.type]));

    const methods = paymentGroups
      .map((group) => {
        const method = many2OneToRef(group.payment_method_id ?? false);
        if (!method) return null;
        return {
          paymentMethodId: method.id,
          paymentMethodName: method.name,
          type: typeByMethodId.get(method.id) ?? 'unknown',
          paymentCount: group.__count,
          amountTotal: group.amount ?? 0,
        };
      })
      .filter((method): method is NonNullable<typeof method> => method !== null)
      .sort((a, b) => b.amountTotal - a.amountTotal);

    const cash = emptyBucket();
    const other = emptyBucket();
    for (const method of methods) {
      const bucket = method.type === 'cash' ? cash : other;
      bucket.paymentCount += method.paymentCount;
      bucket.amountTotal = roundMoney(bucket.amountTotal + method.amountTotal);
    }
    const total: PaymentMethodBucketDoc = {
      paymentCount: cash.paymentCount + other.paymentCount,
      amountTotal: roundMoney(cash.amountTotal + other.amountTotal),
    };

    return { cash, other, total, methods };
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

      const countsAsSale = order.state !== OdooPosOrderState.CANCEL;
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
