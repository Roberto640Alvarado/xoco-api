import { Injectable, Logger } from '@nestjs/common';
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

function goalKey(posConfigId: number, year: number, month: number): string {
  return `${posConfigId}:${year}:${month}`;
}

// Tope de seguridad para la cadena "meta del mes depende de la meta del mes
// anterior": 24 meses hacia atrás es muchísimo más de lo que un uso normal
// debería necesitar (implicaría 2 años de % configurados sin interrupción).
// Si se llega a topar, no es un límite funcional real — es para no quedar
// en una recursión larga por un bug de datos — y se corta usando lo real
// del mes anterior como base, igual que cuando la cadena se rompe por
// falta de configuración.
const MAX_CHAIN_DEPTH = 24;

@Injectable()
export class GoalsService {
  private readonly logger = new Logger(GoalsService.name);

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

  // Total real de órdenes (mismo agregado que usa Visitas, vía
  // SalesService) de una tienda en un mes completo. Cacheado por
  // (tienda, año, mes) dentro de una sola llamada a getSummary(), porque
  // tanto "previousMonthActualOrders" (informativo) como el fallback de
  // la cadena de metas pueden pedir el mismo mes.
  private async getActualOrdersForMonth(
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
      cached = this.salesService
        .findDailySummary({ dateFrom, dateTo, posConfigId })
        .then((days) => days.reduce((sum, day) => sum + day.orderCount, 0));
      cache.set(key, cached);
    }
    return cached;
  }

  // "Meta del mes" (targetOrders) se calcula encadenada: la meta del mes N
  // es (meta del mes N-1) * (1 + % crecimiento del mes N) — NO el total
  // real del mes N-1 (así lo corrigió el usuario explícitamente). Esto
  // implica que, para calcular la meta de un mes, hay que resolver primero
  // la meta del mes anterior, y la de ese su propio mes anterior, y así
  // sucesivamente hasta encontrar un mes sin % configurado.
  //
  // Cuando la cadena se rompe (un mes no tiene % guardado, o se llega al
  // tope de seguridad), se usa como base el total REAL de órdenes de ese
  // mes anterior — el mismo mecanismo de "ancla" que tenía el Excel
  // original con su celda de meta base fija.
  private resolveTargetOrders(
    posConfigId: number,
    year: number,
    month: number,
    growthByKey: Map<string, number>,
    targetMemo: Map<string, Promise<number | null>>,
    actualOrdersCache: Map<string, Promise<number>>,
    depth: number,
  ): Promise<number | null> {
    const key = goalKey(posConfigId, year, month);
    const cached = targetMemo.get(key);
    if (cached) return cached;

    const compute = (async (): Promise<number | null> => {
      const growthPercent = growthByKey.get(key);
      if (growthPercent == null) return null; // sin % configurado este mes: no hay meta que encadenar

      const prev = previousMonthOf(year, month);

      if (depth >= MAX_CHAIN_DEPTH) {
        this.logger.warn(
          `Cadena de metas para posConfigId=${posConfigId} (${year}-${pad2(month)}) superó ${MAX_CHAIN_DEPTH} meses hacia atrás — se corta y se usa lo real de ${prev.year}-${pad2(prev.month)} como base.`,
        );
        const base = await this.getActualOrdersForMonth(posConfigId, prev.year, prev.month, actualOrdersCache);
        return Math.round(base * (1 + growthPercent));
      }

      const prevTarget = await this.resolveTargetOrders(
        posConfigId,
        prev.year,
        prev.month,
        growthByKey,
        targetMemo,
        actualOrdersCache,
        depth + 1,
      );
      const base =
        prevTarget != null
          ? prevTarget
          : await this.getActualOrdersForMonth(posConfigId, prev.year, prev.month, actualOrdersCache);
      return Math.round(base * (1 + growthPercent));
    })();

    targetMemo.set(key, compute);
    return compute;
  }

  // Combina el % de crecimiento guardado (Mongo, historial completo) con lo
  // real de Odoo (vía SalesService, mismo agregado que usa Visitas) para
  // cada tienda activa. "Meta del mes" se encadena mes a mes (ver
  // resolveTargetOrders) — nunca se deriva directo del total real del mes
  // anterior.
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

    const stores = await this.salesService.findStores();
    const posConfigIds = stores.map((store) => store.id);

    // Se trae el historial completo (no solo el mes pedido) porque la
    // cadena de metas puede necesitar mirar varios meses hacia atrás.
    const allGoals = await this.goalsRepository.findManyForStores(posConfigIds);
    const growthByKey = new Map<string, number>();
    for (const goal of allGoals) {
      growthByKey.set(goalKey(goal.posConfigId, goal.year, goal.month), goal.growthPercent);
    }

    // Caches compartidos entre tiendas para esta sola consulta: evitan
    // repetir un findDailySummary de Odoo para el mismo (tienda, mes) tanto
    // al resolver la cadena de metas como al mostrar
    // "previousMonthActualOrders".
    const actualOrdersCache = new Map<string, Promise<number>>();
    const targetMemo = new Map<string, Promise<number | null>>();

    return Promise.all(
      stores.map(async (store) => {
        const [currentMonthDays, previousMonthActualOrders, targetOrders] = await Promise.all([
          dateTo === null
            ? Promise.resolve([])
            : this.salesService.findDailySummary({ dateFrom, dateTo, posConfigId: store.id }),
          this.getActualOrdersForMonth(store.id, prev.year, prev.month, actualOrdersCache),
          this.resolveTargetOrders(store.id, year, month, growthByKey, targetMemo, actualOrdersCache, 0),
        ]);

        const actualOrders = currentMonthDays.reduce((sum, day) => sum + day.orderCount, 0);
        const growthPercent = growthByKey.get(goalKey(store.id, year, month)) ?? null;

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
