import { Injectable, Logger } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import type { OdooPosOrder } from '../../odoo/types/odoo-entities.types.js';
import { fetchAllOdooPages } from '../../common/utils/odoo-pagination.util.js';
import { shiftDate, toStoreDate, toStoreTime, todayStoreDate } from '../../common/utils/store-date.util.js';
import { buildPosOrdersDomain } from '../builders/pos-order-domain.builder.js';

export interface TodayHourDoc {
  hour: number;
  total: number;
  orders: number;
  /** Lo vendido en esa misma hora el mismo día de la semana pasada. */
  lastWeekTotal: number;
}

export interface TodayStoreDoc {
  posConfigId: number;
  storeName: string;
  total: number;
  orders: number;
  averageTicket: number;
  /** Lo vendido la semana pasada (mismo día) hasta esta misma hora. */
  lastWeekToNow: number;
  /** Variación contra la semana pasada a esta hora, en % (null si la semana pasada fue 0). */
  changePct: number | null;
  lastOrderTime: string | null;
  bestHour: number | null;
  byHour: TodayHourDoc[];
}

export interface TodaySalesDoc {
  date: string;
  lastWeekDate: string;
  /** Hora local de El Salvador en que se calculó ("14:35"). */
  asOf: string;
  totals: Omit<TodayStoreDoc, 'posConfigId' | 'storeName'>;
  stores: TodayStoreDoc[];
}

const round = (value: number) => Math.round(value * 100) / 100;

function emptyHours(): TodayHourDoc[] {
  return Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, orders: 0, lastWeekTotal: 0 }));
}

function summarize(today: OdooPosOrder[], lastWeek: OdooPosOrder[], now: string): Omit<TodayStoreDoc, 'posConfigId' | 'storeName'> {
  const byHour = emptyHours();
  let total = 0;
  let lastOrderTime: string | null = null;
  for (const order of today) {
    const time = toStoreTime(order.date_order);
    const slot = byHour[Number(time.slice(0, 2))];
    slot.total += order.amount_total;
    slot.orders += 1;
    total += order.amount_total;
    if (!lastOrderTime || time > lastOrderTime) lastOrderTime = time;
  }
  let lastWeekToNow = 0;
  for (const order of lastWeek) {
    const time = toStoreTime(order.date_order);
    byHour[Number(time.slice(0, 2))].lastWeekTotal += order.amount_total;
    if (time <= now) lastWeekToNow += order.amount_total;
  }
  const best = byHour.reduce<TodayHourDoc | null>((top, slot) => (slot.total > 0 && (!top || slot.total > top.total) ? slot : top), null);
  return {
    total: round(total),
    orders: today.length,
    averageTicket: today.length ? round(total / today.length) : 0,
    lastWeekToNow: round(lastWeekToNow),
    changePct: lastWeekToNow > 0 ? round(((total - lastWeekToNow) / lastWeekToNow) * 100) : null,
    lastOrderTime,
    bestHour: best?.hour ?? null,
    byHour: byHour.map((slot) => ({ ...slot, total: round(slot.total), lastWeekTotal: round(slot.lastWeekTotal) })),
  };
}

// "Ventas de hoy" del Inicio: lo que va del día por tienda y por hora, contra
// el mismo día de la semana pasada hasta la misma hora. Venta de caja (POS),
// sin canceladas — la misma fuente que el Resumen.
@Injectable()
export class TodaySalesService {
  private readonly logger = new Logger(TodaySalesService.name);

  constructor(private readonly odooService: OdooService) {}

  async findToday(posConfigId?: number): Promise<TodaySalesDoc> {
    const date = todayStoreDate();
    const lastWeekDate = shiftDate(date, -7);
    const now = toStoreTime(new Date().toISOString().slice(0, 19).replace('T', ' '));

    const fetchDay = (day: string) =>
      fetchAllOdooPages(
        (options) => this.odooService.findPosOrders(options),
        buildPosOrdersDomain(day, day, posConfigId, { excludeCancelled: true }),
        `ventas de hoy (${day})`,
        this.logger,
      );
    const [today, lastWeek, configs] = await Promise.all([
      fetchDay(date),
      fetchDay(lastWeekDate),
      this.odooService.findPosConfigs({ domain: [['active', '=', true]], order: 'name asc' }),
    ]);

    const storeIds = posConfigId ? [posConfigId] : configs.map((config) => config.id);
    const nameById = new Map(configs.map((config) => [config.id, config.name]));
    const byStore = (orders: OdooPosOrder[], id: number) => orders.filter((order) => order.config_id !== false && order.config_id[0] === id);

    const stores = storeIds
      .map((id) => ({ posConfigId: id, storeName: nameById.get(id) ?? `Tienda ${id}`, ...summarize(byStore(today, id), byStore(lastWeek, id), now) }))
      .sort((a, b) => b.total - a.total);

    return {
      date,
      lastWeekDate,
      asOf: now,
      totals: summarize(
        today.filter((order) => toStoreDate(order.date_order) === date),
        lastWeek.filter((order) => toStoreDate(order.date_order) === lastWeekDate),
        now,
      ),
      stores,
    };
  }
}
