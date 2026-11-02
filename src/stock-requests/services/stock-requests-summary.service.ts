import { Injectable } from '@nestjs/common';
import { StockRequestStatus } from '../../generated/prisma/index.js';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { shiftDate, todayStoreDate } from '../../common/utils/store-date.util.js';
import { StockRequestsRepository } from '../repositories/stock-requests.repository.js';
import { OPEN_STATUSES } from '../utils/stock-request-flow.util.js';

const DAYS = 14;
const STORE_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' });

export interface PlantSummaryStore {
  posConfigId: number;
  storeName: string;
  /** Pedidos de hoy. */
  today: number;
  /** Por responder (solicitada) o en preparación. */
  pending: number;
  onTheWay: number;
  /** Pedidos en los últimos 14 días. */
  recent: number;
  /** Unidades pedidas en los últimos 14 días. */
  units: number;
}

export interface PlantSummaryDay {
  date: string;
  total: number;
  /** Pedidos de ese día por tienda (posConfigId → cantidad). */
  byStore: Record<string, number>;
}

/** Inicio de Planta: los pedidos de las tiendas (a planta) en gráfica. */
@Injectable()
export class StockRequestsSummaryService {
  constructor(
    private readonly repository: StockRequestsRepository,
    private readonly odooService: OdooService,
  ) {}

  async summary() {
    const today = todayStoreDate();
    const firstDay = shiftDate(today, -(DAYS - 1));
    const since = new Date(`${firstDay}T06:00:00.000Z`); // 00:00 en El Salvador (UTC-6)
    const [requests, configs] = await Promise.all([
      this.repository.findPlantForSummary(since, OPEN_STATUSES),
      this.odooService.findPosConfigs({ domain: [['active', '=', true]], order: 'name asc' }),
    ]);

    const stores = new Map<number, PlantSummaryStore>(
      configs.map((config) => [config.id, { posConfigId: config.id, storeName: config.name, today: 0, pending: 0, onTheWay: 0, recent: 0, units: 0 }]),
    );
    const days = new Map<string, PlantSummaryDay>();
    for (let index = 0; index < DAYS; index += 1) {
      const date = shiftDate(firstDay, index);
      days.set(date, { date, total: 0, byStore: {} });
    }
    const totals = { today: 0, pending: 0, onTheWay: 0, receivedToday: 0, recent: 0 };

    for (const request of requests) {
      const store =
        stores.get(request.posConfigId) ??
        stores.set(request.posConfigId, { posConfigId: request.posConfigId, storeName: `Tienda ${request.posConfigId}`, today: 0, pending: 0, onTheWay: 0, recent: 0, units: 0 }).get(request.posConfigId)!;
      const created = STORE_DATE.format(request.createdAt);

      if (request.status === StockRequestStatus.SOLICITADA || request.status === StockRequestStatus.EN_PREPARACION) {
        store.pending += 1;
        totals.pending += 1;
      }
      if (request.status === StockRequestStatus.EN_CAMINO) {
        store.onTheWay += 1;
        totals.onTheWay += 1;
      }
      if (request.receivedAt && STORE_DATE.format(request.receivedAt) === today) totals.receivedToday += 1;

      const day = days.get(created);
      if (!day || request.status === StockRequestStatus.CANCELADA) continue;
      day.total += 1;
      day.byStore[request.posConfigId] = (day.byStore[request.posConfigId] ?? 0) + 1;
      store.recent += 1;
      store.units += request.lines.filter((line) => !line.addedByPlant).reduce((sum, line) => sum + line.requestedQuantity, 0);
      totals.recent += 1;
      if (created === today) {
        store.today += 1;
        totals.today += 1;
      }
    }

    return {
      date: today,
      totals,
      stores: [...stores.values()].sort((a, b) => b.pending - a.pending || b.today - a.today || a.storeName.localeCompare(b.storeName)),
      byDay: [...days.values()],
    };
  }
}
