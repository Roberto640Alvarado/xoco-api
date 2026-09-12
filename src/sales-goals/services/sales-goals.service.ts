import { Injectable, Logger } from '@nestjs/common';
import { SalesService } from '../../sales/services/sales.service.js';
import { StoreInvoiceTotalsService } from '../../sales/services/store-invoice-totals.service.js';
import { SalesGoalsRepository } from '../repositories/sales-goals.repository.js';
import { UpsertSalesGoalsBulkDto } from '../dto/upsert-sales-goals-bulk.dto.js';
import { FindSalesGoalsSummaryQueryDto } from '../dto/find-sales-goals-summary-query.dto.js';
import { SalesGoalSummaryItemDoc, StoreSalesGoalDoc } from '../doc/sales-goals.doc.js';

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

// Módulo "Venta Mensual": mismo diseño que GoalsService (src/goals/), pero
// la métrica es el monto real en dólares en vez de la cantidad de
// visitas, y con su propio % de crecimiento guardado por separado
// (StoreSalesGoal, no StoreGoal) — ver plan-history.
//
// La venta sale de las FACTURAS de cada tienda (vía
// StoreInvoiceTotalsService), con impuesto incluido y neta de notas de
// crédito — el mismo número que el equipo saca del módulo de
// Contabilidad de Odoo. Ver plan-history "visitas-por-vendedor-facturas".
@Injectable()
export class SalesGoalsService {
  private readonly logger = new Logger(SalesGoalsService.name);

  constructor(
    private readonly salesGoalsRepository: SalesGoalsRepository,
    private readonly salesService: SalesService,
    private readonly storeInvoiceTotalsService: StoreInvoiceTotalsService,
  ) {}

  async upsertBulk(dto: UpsertSalesGoalsBulkDto): Promise<StoreSalesGoalDoc[]> {
    const goals = await this.salesGoalsRepository.upsertMany(
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

  // Venta facturada de TODAS las tiendas en un rango. Cacheado por rango
  // dentro de una sola llamada a getSummary(): la atribución de facturas a
  // tienda se resuelve de una vez para las cuatro, así que se pide por
  // rango y no por tienda (mismo patrón que GoalsService).
  private getRevenueForRange(
    dateFrom: string,
    dateTo: string,
    cache: Map<string, Promise<Map<number, number>>>,
  ): Promise<Map<number, number>> {
    const key = `${dateFrom}:${dateTo}`;
    let cached = cache.get(key);
    if (!cached) {
      cached = this.storeInvoiceTotalsService
        .findTotalsByStore({ dateFrom, dateTo })
        .then((report) => new Map(report.items.map((item) => [item.posConfigId, item.amountTotal])));
      cache.set(key, cached);
    }
    return cached;
  }

  // Venta facturada de una tienda en un mes completo.
  private async getActualRevenueForMonth(
    posConfigId: number,
    year: number,
    month: number,
    cache: Map<string, Promise<Map<number, number>>>,
  ): Promise<number> {
    const revenue = await this.getRevenueForRange(
      toIsoDate(year, month, 1),
      toIsoDate(year, month, daysInMonthOf(year, month)),
      cache,
    );
    return revenue.get(posConfigId) ?? 0;
  }

  // "Meta" ($) encadenada mes a mes: meta(mes N) = meta(mes N-1) * (1 + %
  // de crecimiento del mes N). Cuando la cadena se rompe (mes sin %
  // configurado, o tope de seguridad), se usa como base el monto REAL de
  // ese mes anterior. Mismo diseño que GoalsService.resolveTargetOrders —
  // ver ese archivo para el detalle completo del razonamiento.
  private resolveTargetRevenue(
    posConfigId: number,
    year: number,
    month: number,
    growthByKey: Map<string, number>,
    targetMemo: Map<string, Promise<number | null>>,
    actualRevenueCache: Map<string, Promise<Map<number, number>>>,
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
          `Cadena de metas de venta para posConfigId=${posConfigId} (${year}-${pad2(month)}) superó ${MAX_CHAIN_DEPTH} meses hacia atrás — se corta y se usa lo real de ${prev.year}-${pad2(prev.month)} como base.`,
        );
        const base = await this.getActualRevenueForMonth(posConfigId, prev.year, prev.month, actualRevenueCache);
        return base * (1 + growthPercent);
      }

      const prevTarget = await this.resolveTargetRevenue(
        posConfigId,
        prev.year,
        prev.month,
        growthByKey,
        targetMemo,
        actualRevenueCache,
        depth + 1,
      );
      const base =
        prevTarget != null
          ? prevTarget
          : await this.getActualRevenueForMonth(posConfigId, prev.year, prev.month, actualRevenueCache);
      return base * (1 + growthPercent);
    })();

    targetMemo.set(key, compute);
    return compute;
  }

  async getSummary(query: FindSalesGoalsSummaryQueryDto): Promise<SalesGoalSummaryItemDoc[]> {
    const { year, month } = query;

    const now = new Date();
    const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
    const daysInMonth = daysInMonthOf(year, month);

    // "Hasta ayer" para el mes en curso — mismo criterio que Tráfico de
    // tiendas (el día de hoy todavía no cerró).
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

    const allGoals = await this.salesGoalsRepository.findManyForStores(posConfigIds);
    const growthByKey = new Map<string, number>();
    for (const goal of allGoals) {
      growthByKey.set(goalKey(goal.posConfigId, goal.year, goal.month), goal.growthPercent);
    }

    const actualRevenueCache = new Map<string, Promise<Map<number, number>>>();
    const targetMemo = new Map<string, Promise<number | null>>();

    // La venta del mes en curso se resuelve de una sola vez para todas las
    // tiendas (la atribución de facturas es global, no por tienda).
    const currentRevenue =
      dateTo === null
        ? new Map<number, number>()
        : await this.getRevenueForRange(dateFrom, dateTo, actualRevenueCache);

    return Promise.all(
      stores.map(async (store) => {
        const targetRevenue = await this.resolveTargetRevenue(
          store.id,
          year,
          month,
          growthByKey,
          targetMemo,
          actualRevenueCache,
          0,
        );

        const actualRevenue = currentRevenue.get(store.id) ?? 0;
        const growthPercent = growthByKey.get(goalKey(store.id, year, month)) ?? null;

        const reachPercent = targetRevenue ? actualRevenue / targetRevenue : null;
        const pendingValue = targetRevenue != null ? targetRevenue - actualRevenue : null;

        const item: SalesGoalSummaryItemDoc = {
          posConfigId: store.id,
          storeName: store.name,
          year,
          month,
          growthPercent,
          actualRevenue,
          targetRevenue,
          reachPercent,
          pendingValue,
          isCurrentMonth,
        };
        return item;
      }),
    );
  }
}
