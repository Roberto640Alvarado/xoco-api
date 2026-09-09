import { Injectable } from '@nestjs/common';
import { SalesService } from '../../sales/services/sales.service.js';
import { GoalsRepository } from '../repositories/goals.repository.js';
import { UpsertGoalDto } from '../dto/upsert-goal.dto.js';
import { FindGoalsSummaryQueryDto } from '../dto/find-goals-summary-query.dto.js';
import { GoalSummaryItemDoc, StoreGoalDoc } from '../doc/goals.doc.js';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

@Injectable()
export class GoalsService {
  constructor(
    private readonly goalsRepository: GoalsRepository,
    private readonly salesService: SalesService,
  ) {}

  async upsert(dto: UpsertGoalDto): Promise<StoreGoalDoc> {
    const goal = await this.goalsRepository.upsert(dto);
    return {
      id: goal.id,
      posConfigId: goal.posConfigId,
      year: goal.year,
      month: goal.month,
      targetOrders: goal.targetOrders,
      updatedAt: goal.updatedAt,
    };
  }

  // Combina la meta guardada (Mongo) con lo real (Odoo, vía SalesService)
  // para cada tienda activa, y calcula Alcance + una proyección de cierre
  // de mes por ritmo diario (ver GoalSummaryItemDoc para el detalle de
  // cada campo).
  async getSummary(query: FindGoalsSummaryQueryDto): Promise<GoalSummaryItemDoc[]> {
    const { year, month } = query;

    const now = new Date();
    const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

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

    const [stores, goals] = await Promise.all([
      this.salesService.findStores(),
      this.goalsRepository.findManyForMonth(year, month),
    ]);
    const targetByStore = new Map(goals.map((goal) => [goal.posConfigId, goal.targetOrders]));

    return Promise.all(
      stores.map(async (store) => {
        const actualOrders =
          dateTo === null
            ? 0
            : (
                await this.salesService.findDailySummary({ dateFrom, dateTo, posConfigId: store.id })
              ).reduce((sum, day) => sum + day.orderCount, 0);

        const targetOrders = targetByStore.get(store.id) ?? null;
        const reachPercent = targetOrders ? actualOrders / targetOrders : null;

        const projectedOrders = isCurrentMonth
          ? daysElapsed > 0
            ? Math.round((actualOrders / daysElapsed) * daysInMonth)
            : 0
          : actualOrders;
        const projectedReachPercent = targetOrders ? projectedOrders / targetOrders : null;

        const item: GoalSummaryItemDoc = {
          posConfigId: store.id,
          storeName: store.name,
          year,
          month,
          targetOrders,
          actualOrders,
          reachPercent,
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
