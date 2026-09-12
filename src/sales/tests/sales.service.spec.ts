import { describe, expect, it } from 'vitest';
import { SalesService } from '../services/sales.service.js';
import { createOdooServiceMock, domainOfCall, OdooServiceMock } from './mocks/odoo.service.mock.js';
import {
  RAMBLAS_NEIGHBOUR_ORDERS,
  RAMBLAS_SEPT_7_CANCELLED,
  RAMBLAS_SEPT_7_ORDERS,
  RAMBLAS_SEPT_7_TOTAL,
} from './mocks/pos-orders.mock.js';
import { RAMBLAS } from './mocks/pos-configs.mock.js';

const SEPT_7 = '2026-09-07';
const RAMBLAS_ID = 3;

// Ventana UTC que cubre el 2026-09-07 completo en hora local (UTC-6).
const UTC_WINDOW_SEPT_7 = ['2026-09-07 06:00:00', '2026-09-08 05:59:59'];

describe('SalesService', () => {
  let odoo: OdooServiceMock;

  function buildService(orders = RAMBLAS_SEPT_7_ORDERS): SalesService {
    odoo = createOdooServiceMock({ orders });
    return new SalesService(odoo.service);
  }

  describe('findDailySummary', () => {
    it('cuenta el día por hora local de la tienda, no por la fecha UTC de Odoo', async () => {
      const service = buildService();

      const [day] = await service.findDailySummary({
        dateFrom: SEPT_7,
        dateTo: SEPT_7,
        posConfigId: RAMBLAS_ID,
      });

      // El PDF de Odoo del 07/09/2026 para Tienda Ramblas: 13 órdenes,
      // $200.21. Incluye la orden de las 01:04 UTC del día 8, que en hora
      // local son las 19:04 del día 7.
      expect(day.date).toBe(SEPT_7);
      expect(day.orderCount).toBe(13);
      expect(day.totalRevenue).toBeCloseTo(RAMBLAS_SEPT_7_TOTAL, 2);
    });

    it('pide a Odoo la ventana UTC que corresponde al día local, excluyendo canceladas', async () => {
      const service = buildService();

      await service.findDailySummary({
        dateFrom: SEPT_7,
        dateTo: SEPT_7,
        posConfigId: RAMBLAS_ID,
      });

      expect(domainOfCall(odoo.findPosOrders)).toEqual([
        ['date_order', '>=', UTC_WINDOW_SEPT_7[0]],
        ['date_order', '<=', UTC_WINDOW_SEPT_7[1]],
        ['config_id', '=', RAMBLAS_ID],
        ['state', '!=', 'cancel'],
      ]);
    });

    it('deja fuera las órdenes de días vecinos y no depende de las sesiones', async () => {
      const service = buildService([...RAMBLAS_SEPT_7_ORDERS, ...RAMBLAS_NEIGHBOUR_ORDERS]);

      const days = await service.findDailySummary({ dateFrom: SEPT_7, dateTo: SEPT_7 });

      expect(days).toHaveLength(1);
      expect(days[0].orderCount).toBe(13);
      expect(days[0].totalRevenue).toBeCloseTo(RAMBLAS_SEPT_7_TOTAL, 2);
      // Antes se resolvían primero las pos.session del rango; ese paso era
      // justo el que dejaba el día en cero cuando ninguna sesión abría ese
      // día. Ya no se consultan.
      expect(odoo.findPosSessions).not.toHaveBeenCalled();
    });

    it('devuelve un punto por cada día del rango, en cero los que no tuvieron venta', async () => {
      const service = buildService([]);

      const days = await service.findDailySummary({ dateFrom: '2026-09-06', dateTo: '2026-09-08' });

      expect(days.map((day) => day.date)).toEqual(['2026-09-06', '2026-09-07', '2026-09-08']);
      expect(days.every((day) => day.orderCount === 0 && day.totalRevenue === 0)).toBe(true);
    });
  });

  describe('findOrders', () => {
    it('arma la tienda y la sesión desde la propia orden, sin resolver sesiones aparte', async () => {
      const service = buildService();

      const result = await service.findOrders({
        dateFrom: SEPT_7,
        posConfigId: RAMBLAS_ID,
        page: 1,
        limit: 20,
      });

      expect(result.meta).toEqual({ total: 13, page: 1, limit: 20, totalPages: 1 });
      expect(odoo.findPosSessions).not.toHaveBeenCalled();

      const boundary = result.items.find((item) => item.name === 'Ramblas/5735');
      expect(boundary).toBeDefined();
      expect(boundary?.dateOrder).toBe('2026-09-08 01:04:31'); // crudo de Odoo, en UTC
      expect(boundary?.date).toBe(SEPT_7); // día de negocio al que pertenece
      expect(boundary?.posConfig).toEqual({ id: RAMBLAS_ID, name: 'Tienda Ramblas' });
      expect(boundary?.session).toEqual({ id: 2046, name: 'POS/01268' });
    });

    it('usa dateFrom como dateTo cuando no se manda dateTo', async () => {
      const service = buildService();

      await service.findOrders({ dateFrom: SEPT_7, page: 1, limit: 20 });

      expect(domainOfCall(odoo.findPosOrders)).toEqual([
        ['date_order', '>=', UTC_WINDOW_SEPT_7[0]],
        ['date_order', '<=', UTC_WINDOW_SEPT_7[1]],
      ]);
    });

    it('pagina con offset y pide el total con el mismo domain', async () => {
      const service = buildService();

      await service.findOrders({ dateFrom: SEPT_7, page: 3, limit: 5 });

      expect(odoo.findPosOrders).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5, offset: 10, order: 'date_order desc' }),
      );
      expect(odoo.countPosOrders).toHaveBeenCalledWith(domainOfCall(odoo.findPosOrders));
    });
  });

  describe('findTopProducts', () => {
    it('excluye canceladas en el domain y no consulta líneas si no hay órdenes', async () => {
      const service = buildService([]);

      const products = await service.findTopProducts({
        dateFrom: SEPT_7,
        posConfigId: RAMBLAS_ID,
        limit: 10,
        order: 'desc',
      });

      expect(products).toEqual([]);
      expect(domainOfCall(odoo.findPosOrders)).toContainEqual(['state', '!=', 'cancel']);
      expect(odoo.findPosOrderLines).not.toHaveBeenCalled();
    });

    it('suma unidades e ingreso por producto y respeta el orden pedido', async () => {
      odoo = createOdooServiceMock({
        orders: RAMBLAS_SEPT_7_ORDERS,
        lines: [
          lineOf(1, 33617, [10, 'Trufa Leche'], 2, 1.77),
          lineOf(2, 33618, [11, 'Americano'], 1, 1.99),
          lineOf(3, 33619, [10, 'Trufa Leche'], 3, 2.66),
        ],
      });
      const service = new SalesService(odoo.service);

      const desc = await service.findTopProducts({
        dateFrom: SEPT_7,
        limit: 10,
        order: 'desc',
      });
      expect(desc.map((product) => product.productName)).toEqual(['Trufa Leche', 'Americano']);
      expect(desc[0]).toMatchObject({ totalQuantity: 5, totalRevenue: 4.43 });

      const asc = await service.findTopProducts({ dateFrom: SEPT_7, limit: 10, order: 'asc' });
      expect(asc.map((product) => product.productName)).toEqual(['Americano', 'Trufa Leche']);
    });
  });

  describe('getReconciliation', () => {
    it('separa el método actual del anterior y lista las órdenes donde difieren', async () => {
      odoo = createOdooServiceMock({
        orders: [...RAMBLAS_SEPT_7_ORDERS, ...RAMBLAS_SEPT_7_CANCELLED],
        // La sesión POS/01268 abrió el 6 de septiembre: con el método
        // anterior, TODO lo del día 7 se contaba en el día 6.
        sessions: [
          {
            id: 2046,
            name: 'POS/01268',
            config_id: [RAMBLAS_ID, 'Tienda Ramblas'],
            state: 'closed',
            start_at: '2026-09-06 23:21:20',
            stop_at: '2026-09-08 15:10:29',
            cash_register_balance_start: 0,
            cash_register_balance_end_real: 0,
            user_id: false,
            create_date: '2026-09-06 23:21:20',
            write_date: '2026-09-08 15:10:29',
          },
        ],
        configs: [RAMBLAS],
      });
      const service = new SalesService(odoo.service);

      const [ramblas] = await service.getReconciliation({
        dateFrom: SEPT_7,
        dateTo: SEPT_7,
        posConfigId: RAMBLAS_ID,
      });

      expect(ramblas.byStoreDayMethod.orderCount).toBe(13);
      expect(ramblas.byStoreDayMethod.totalRevenue).toBeCloseTo(RAMBLAS_SEPT_7_TOTAL, 2);
      // El método anterior no veía nada ese día: la sesión abrió el 6.
      expect(ramblas.bySessionMethod).toEqual({ orderCount: 0, totalRevenue: 0 });
      expect(ramblas.orderCountDifference).toBe(13);
      expect(ramblas.stateBreakdown).toEqual({ invoiced: 13, cancel: 2 });
      // Las 15 (13 ventas + 2 canceladas) caen en el rango por un método y
      // no por el otro, así que todas son órdenes de borde.
      expect(ramblas.boundaryOrders).toHaveLength(15);
      expect(ramblas.boundaryOrders[0]).toMatchObject({
        storeDate: SEPT_7,
        sessionDate: '2026-09-06',
        includedByStoreDayMethod: true,
        includedBySessionMethod: false,
      });
    });
  });
});

function lineOf(
  id: number,
  orderId: number,
  product: [number, string],
  qty: number,
  subtotalIncl: number,
) {
  return {
    id,
    order_id: [orderId, `Ramblas/${orderId}`] as [number, string],
    product_id: product,
    qty,
    price_unit: subtotalIncl / qty,
    price_subtotal: subtotalIncl,
    price_subtotal_incl: subtotalIncl,
    discount: 0,
    full_product_name: product[1],
    create_date: '2026-09-07 18:41:25',
    write_date: '2026-09-07 18:41:25',
  };
}
