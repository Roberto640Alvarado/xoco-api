import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TodaySalesService } from '../services/today-sales.service.js';
import type { OdooService } from '../../odoo/services/odoo.service.js';

const order = (id: number, store: number, utc: string, amount: number) => ({ id, config_id: [store, `T${store}`], date_order: utc, amount_total: amount, amount_tax: 0 });

describe('TodaySalesService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 1 nov 2026, 14:30 en El Salvador = 20:30 UTC
    vi.setSystemTime(new Date('2026-11-01T20:30:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('suma por tienda y por hora local, y compara con la semana pasada hasta la misma hora', async () => {
    const today = [order(1, 1, '2026-11-01 15:10:00', 10), order(2, 1, '2026-11-01 20:05:00', 30), order(3, 2, '2026-11-01 16:00:00', 5)];
    const lastWeek = [order(4, 1, '2026-10-25 15:00:00', 20), order(5, 1, '2026-10-25 23:00:00', 100)];
    const findPosOrders = vi.fn(async (options: { domain: unknown[][]; offset?: number }) => {
      if (options.offset) return [];
      const from = String(options.domain[0][2]);
      return from.startsWith('2026-11-01') ? today : lastWeek;
    });
    const odoo = {
      findPosOrders,
      findPosConfigs: vi.fn(async () => [{ id: 1, name: 'CENTRIKA' }, { id: 2, name: 'San Benito' }]),
    } as unknown as OdooService;

    const result = await new TodaySalesService(odoo).findToday();
    expect(result).toMatchObject({ date: '2026-11-01', lastWeekDate: '2026-10-25', asOf: '14:30' });
    const centrika = result.stores[0];
    expect(centrika).toMatchObject({ storeName: 'CENTRIKA', total: 40, orders: 2, averageTicket: 20, lastWeekToNow: 20, changePct: 100, lastOrderTime: '14:05', bestHour: 14 });
    expect(centrika.byHour[9]).toMatchObject({ total: 10, orders: 1, lastWeekTotal: 20 });
    expect(centrika.byHour[17].lastWeekTotal).toBe(100);
    expect(result.totals).toMatchObject({ total: 45, orders: 3 });
  });
});
