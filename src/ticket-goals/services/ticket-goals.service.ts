import { Injectable, Logger } from '@nestjs/common';
import { SalesService } from '../../sales/services/sales.service.js';
import { TicketGoalsRepository } from '../repositories/ticket-goals.repository.js';
import { UpsertTicketGoalsBulkDto } from '../dto/upsert-ticket-goals-bulk.dto.js';
import { FindTicketGoalsSummaryQueryDto } from '../dto/find-ticket-goals-summary-query.dto.js';
import { TicketGoalSummaryItemDoc, StoreTicketGoalDoc } from '../doc/ticket-goals.doc.js';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function daysInMonthOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function previousMonthOf(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function goalKey(posConfigId: number, year: number, month: number): string {
  return `${posConfigId}:${year}:${month}`;
}

// Mismo tope de seguridad que GoalsService.MAX_CHAIN_DEPTH (src/goals/) —
// ver ese archivo para el porqué.
const MAX_CHAIN_DEPTH = 24;

// Módulo "Ticket Promedio": mismo diseño que GoalsService/
// SalesGoalsService, pero la métrica es venta / cantidad de órdenes
// (ticket promedio) en vez de una de esas dos por separado, con su propio
// % de crecimiento guardado aparte (StoreTicketGoal) — ver plan-history.
@Injectable()
export class TicketGoalsService {
  private readonly logger = new Logger(TicketGoalsService.name);

  constructor(
    private readonly ticketGoalsRepository: TicketGoalsRepository,
    private readonly salesService: SalesService,
  ) {}

  async upsertBulk(dto: UpsertTicketGoalsBulkDto): Promise<StoreTicketGoalDoc[]> {
    const goals = await this.ticketGoalsRepository.upsertMany(
      dto.entries.map((entry) => ({
        posConfigId: entry.posConfigId,
        year: dto.year,
        month: dto.month,
        growthPercent: entry.growthPercent,
      })),
    );

    return goals.map((goal) => ({
      id: goal.id,
      posConfigId: goal.posConfigId,
      year: goal.year,
      month: goal.month,
      growthPercent: goal.growthPercent,
      updatedAt: goal.updatedAt,
    }));
  }

  // Ticket promedio real (venta real / cantidad de órdenes reales) de una
  // tienda en un mes completo — cacheado por (tienda, año, mes) dentro de
  // una sola llamada a getSummary(). 0 si no hubo órdenes en el mes (evita
  // dividir entre cero).
  private async getActualAverageTicketForMonth(
    posConfigId: number,
    year: number,
    month: number,
    cache: Map<string, Promise<number>>,
  ): Promise<number> {
    const key = goalKey(posConfigId, year, month);
    let cached = cache.get(key);
    if (!cached) {
      const dateFrom = toIsoDate(year, month, 1);
      const dateTo = toIsoDate(year, month, daysInMonthOf(year, month));
      cached = this.salesService.findDailySummary({ dateFrom, dateTo, posConfigId }).then((days) => {
        const totals = days.reduce(
          (acc, day) => ({ orders: acc.orders + day.orderCount, revenue: acc.revenue + day.totalRevenue }),
          { orders: 0, revenue: 0 },
        );
        return totals.orders > 0 ? totals.revenue / totals.orders : 0;
      });
      cache.set(key, cached);
    }
    return cached;
  }

  // "Meta" (ticket promedio) encadenada mes a mes: meta(mes N) = meta(mes
  // N-1) * (1 + % de crecimiento del mes N). Cuando la cadena se rompe
  // (mes sin % configurado, o tope de seguridad), se usa como base el
  // ticket promedio REAL de ese mes anterior. Mismo diseño que
  // GoalsService.resolveTargetOrders — ver ese archivo para el detalle
  // completo del razonamiento.
  private resolveTargetAverageTicket(
    posConfigId: number,
    year: number,
    month: number,
    growthByKey: Map<string, number>,
    targetMemo: Map<string, Promise<number | null>>,
    actualTicketCache: Map<string, Promise<number>>,
    depth: number,
  ): Promise<number | null> {
    const key = goalKey(posConfigId, year, month);
    const cached = targetMemo.get(key);
    if (cached) return cached;

    const compute = (async (): Promise<number | null> => {
      const growthPercent = growthByKey.get(key);
      if (growthPercent == null) return null;

      const prev = previousMonthOf(year, month);

      if (depth >= MAX_CHAIN_DEPTH) {
        this.logger.warn(
          `Cadena de metas de ticket promedio para posConfigId=${posConfigId} (${year}-${pad2(month)}) superó ${MAX_CHAIN_DEPTH} meses hacia atrás — se corta y se usa lo real de ${prev.year}-${pad2(prev.month)} como base.`,
        );
        const base = await this.getActualAverageTicketForMonth(posConfigId, prev.year, prev.month, actualTicketCache);
        return base * (1 + growthPercent);
      }

      const prevTarget = await this.resolveTargetAverageTicket(
        posConfigId,
        prev.year,
        prev.month,
        growthByKey,
        targetMemo,
        actualTicketCache,
        depth + 1,
      );
      const base =
        prevTarget != null
          ? prevTarget
          : await this.getActualAverageTicketForMonth(posConfigId, prev.year, prev.month, actualTicketCache);
      return base * (1 + growthPercent);
    })();

    targetMemo.set(key, compute);
    return compute;
  }

  async getSummary(query: FindTicketGoalsSummaryQueryDto): Promise<TicketGoalSummaryItemDoc[]> {
    const { year, month } = query;

    const now = new Date();
    const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
    const daysInMonth = daysInMonthOf(year, month);

    // "Hasta ayer" para el mes en curso — mismo criterio que los otros 2
    // módulos.
    let dateTo: string | null;
    if (isCurrentMonth) {
      const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
      const yesterdayIsSameMonth =
        yesterday.getUTCFullYear() === year && yesterday.getUTCMonth() + 1 === month;
      dateTo = yesterdayIsSameMonth ? toIsoDate(year, month, yesterday.getUTCDate()) : null;
    } else {
      dateTo = toIsoDate(year, month, daysInMonth);
    }
    const dateFrom = toIsoDate(year, month, 1);

    const stores = await this.salesService.findStores();
    const posConfigIds = stores.map((store) => store.id);

    const allGoals = await this.ticketGoalsRepository.findManyForStores(posConfigIds);
    const growthByKey = new Map<string, number>();
    for (const goal of allGoals) {
      growthByKey.set(goalKey(goal.posConfigId, goal.year, goal.month), goal.growthPercent);
    }

    const actualTicketCache = new Map<string, Promise<number>>();
    const targetMemo = new Map<string, Promise<number | null>>();

    return Promise.all(
      stores.map(async (store) => {
        const [currentMonthDays, targetAverageTicket] = await Promise.all([
          dateTo === null
            ? Promise.resolve([])
            : this.salesService.findDailySummary({ dateFrom, dateTo, posConfigId: store.id }),
          this.resolveTargetAverageTicket(store.id, year, month, growthByKey, targetMemo, actualTicketCache, 0),
        ]);

        const currentTotals = currentMonthDays.reduce(
          (acc, day) => ({ orders: acc.orders + day.orderCount, revenue: acc.revenue + day.totalRevenue }),
          { orders: 0, revenue: 0 },
        );
        const actualAverageTicket = currentTotals.orders > 0 ? currentTotals.revenue / currentTotals.orders : 0;
        const growthPercent = growthByKey.get(goalKey(store.id, year, month)) ?? null;

        const reachPercent = targetAverageTicket ? actualAverageTicket / targetAverageTicket : null;
        const difference = targetAverageTicket != null ? actualAverageTicket - targetAverageTicket : null;

        const item: TicketGoalSummaryItemDoc = {
          posConfigId: store.id,
          storeName: store.name,
          year,
          month,
          growthPercent,
          actualAverageTicket,
          targetAverageTicket,
          difference,
          reachPercent,
          isCurrentMonth,
        };
        return item;
      }),
    );
  }
}
