import { Injectable } from '@nestjs/common';
import { SalesService } from '../../sales/services/sales.service.js';
import { GoalsRepository } from '../repositories/goals.repository.js';
import { UpsertGoalsBulkDto } from '../dto/upsert-goals-bulk.dto.js';
import { FindGoalsSummaryQueryDto } from '../dto/find-goals-summary-query.dto.js';
import { GoalSummaryItemDoc, StoreGoalDoc } from '../doc/goals.doc.js';

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

@Injectable()
export class GoalsService {
  constructor(
    private readonly goalsRepository: GoalsRepository,
    private readonly salesService: SalesService,
  ) {}

  async upsertBulk(dto: UpsertGoalsBulkDto): Promise<StoreGoalDoc[]> {
    const goals = await this.goalsRepository.upsertMany(
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

  // Combina el % de crecimiento guardado (Mongo) con lo real de Odoo (vía
  // SalesService, mismo agregado que usa Visitas) para cada tienda activa:
  // "Meta del mes" se deriva del total real del mes ANTERIOR, nunca de un
  // número guardado a mano (ver GoalSummaryItemDoc para el detalle de cada
  // campo).
  async getSummary(query: FindGoalsSummaryQueryDto): Promise<GoalSummaryItemDoc[]> {
    const { year, month } = query;

    const now = new Date();
    const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
    const daysInMonth = daysInMonthOf(year, month);

    // "Hasta ayer" para el mes en curso — el día de hoy todavía no cerró
    // (mismo criterio que "Fecha actualización" = TODAY()-1 en el Excel
    // original). Si hoy es el día 1 del mes, "ayer" cae en el mes
    // anterior: 0 días transcurridos todavía en este mes.
    let daysElapsed: number;
    let dateTo: string | null;
    if (isCurrentMonth) {
      const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
      const yesterdayIsSameMonth =
        yesterday.getUTCFullYear() === year && yesterday.getUTCMonth() + 1 === month;
      daysElapsed = yesterdayIsSameMonth ? yesterday.getUTCDate() : 0;
      dateTo = yesterdayIsSameMonth ? toIsoDate(year, month, yesterday.getUTCDate()) : null;
    } else {
      // Mes ya cerrado (o futuro, aunque no debería pedirse): se toma el
      // mes completo.
      daysElapsed = daysInMonth;
      dateTo = toIsoDate(year, month, daysInMonth);
    }
    const dateFrom = toIsoDate(year, month, 1);

    const prev = previousMonthOf(year, month);
    const prevDaysInMonth = daysInMonthOf(prev.year, prev.month);
    const prevDateFrom = toIsoDate(prev.year, prev.month, 1);
    const prevDateTo = toIsoDate(prev.year, prev.month, prevDaysInMonth);

    const [stores, goals] = await Promise.all([
      this.salesService.findStores(),
      this.goalsRepository.findManyForMonth(year, month),
    ]);
    const growthByStore = new Map(goals.map((goal) => [goal.posConfigId, goal.growthPercent]));

    return Promise.all(
      stores.map(async (store) => {
        const [currentMonthDays, previousMonthDays] = await Promise.all([
          dateTo === null
            ? Promise.resolve([])
            : this.salesService.findDailySummary({ dateFrom, dateTo, posConfigId: store.id }),
          this.salesService.findDailySummary({
            dateFrom: prevDateFrom,
            dateTo: prevDateTo,
            posConfigId: store.id,
          }),
        ]);

        const actualOrders = currentMonthDays.reduce((sum, day) => sum + day.orderCount, 0);
        const previousMonthActualOrders = previousMonthDays.reduce((sum, day) => sum + day.orderCount, 0);

        const growthPercent = growthByStore.get(store.id) ?? null;
        const targetOrders =
          growthPercent != null ? Math.round(previousMonthActualOrders * (1 + growthPercent)) : null;

        const reachPercent = targetOrders ? actualOrders / targetOrders : null;
        const missingOrders = targetOrders != null ? targetOrders - actualOrders : null;
        // "Visitas Diarias Necesarias": el mismo valor que "faltantes a la
        // fecha", tal como lo pidió el usuario (así está también en el
        // Excel original) — no una división por días restantes.
        const dailyNeededOrders = missingOrders;

        const projectedOrders =
          isCurrentMonth && daysElapsed === 0
            ? 0
            : Math.round((actualOrders / daysElapsed) * daysInMonth);
        const projectedReachPercent = targetOrders ? projectedOrders / targetOrders : null;

        const item: GoalSummaryItemDoc = {
          posConfigId: store.id,
          storeName: store.name,
          year,
          month,
          growthPercent,
          previousMonthActualOrders,
          targetOrders,
          actualOrders,
          reachPercent,
          missingOrders,
          dailyNeededOrders,
          isCurrentMonth,
          daysElapsed,
          daysInMonth,
          projectedOrders,
          projectedReachPercent,
        };
        return item;
      }),
    );
  }
}
