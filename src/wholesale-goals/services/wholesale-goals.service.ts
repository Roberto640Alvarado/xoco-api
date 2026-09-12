import { Injectable, Logger } from '@nestjs/common';
import { WholesaleClientTotalsService } from '../../sales/services/wholesale-client-totals.service.js';
import { WHOLESALE_CLIENTS } from '../../sales/constants/wholesale-clients.const.js';
import { WholesaleGoalsRepository } from '../repositories/wholesale-goals.repository.js';
import { UpsertWholesaleGoalsBulkDto } from '../dto/upsert-wholesale-goals-bulk.dto.js';
import { FindWholesaleGoalsSummaryQueryDto } from '../dto/find-wholesale-goals-summary-query.dto.js';
import { WholesaleClientGoalDoc, WholesaleGoalSummaryItemDoc } from '../doc/wholesale-goals.doc.js';

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

function goalKey(clientKey: string, year: number, month: number): string {
  return `${clientKey}:${year}:${month}`;
}

// Mismo tope de seguridad que GoalsService.MAX_CHAIN_DEPTH (src/goals/) —
// ver ese archivo para el porqué.
const MAX_CHAIN_DEPTH = 24;

// Módulo "Ventas Mayoreo": mismo diseño que SalesGoalsService (src/sales-goals/,
// "Venta Mensual" por tienda), pero para los clientes de mayoreo fijos de
// WHOLESALE_CLIENTS (Selectos, Operadora del Sur) en vez de pos.config.
//
// La venta sale de las FACTURAS de cada cliente (vía
// WholesaleClientTotalsService), con impuesto incluido y neta de notas de
// crédito — el mismo criterio que el resto de /sales basado en facturas.
@Injectable()
export class WholesaleGoalsService {
  private readonly logger = new Logger(WholesaleGoalsService.name);

  constructor(
    private readonly wholesaleGoalsRepository: WholesaleGoalsRepository,
    private readonly wholesaleClientTotalsService: WholesaleClientTotalsService,
  ) {}

  async upsertBulk(dto: UpsertWholesaleGoalsBulkDto, updatedByEmail: string): Promise<WholesaleClientGoalDoc[]> {
    const goals = await this.wholesaleGoalsRepository.upsertMany(
      dto.entries.map((entry) => ({
        clientKey: entry.clientKey,
        year: dto.year,
        month: dto.month,
        growthPercent: entry.growthPercent,
        updatedByEmail,
      })),
    );

    return goals.map((goal) => ({
      id: goal.id,
      clientKey: goal.clientKey,
      year: goal.year,
      month: goal.month,
      growthPercent: goal.growthPercent,
      updatedAt: goal.updatedAt,
      updatedByEmail: goal.updatedByEmail,
    }));
  }

  // Venta facturada de TODOS los clientes de mayoreo en un rango.
  // Cacheado por rango dentro de una sola llamada a getSummary(): el
  // agregado por cliente se resuelve de una vez para los dos, así que se
  // pide por rango y no por cliente (mismo patrón que SalesGoalsService).
  private getRevenueForRange(
    dateFrom: string,
    dateTo: string,
    cache: Map<string, Promise<Map<string, number>>>,
  ): Promise<Map<string, number>> {
    const key = `${dateFrom}:${dateTo}`;
    let cached = cache.get(key);
    if (!cached) {
      cached = this.wholesaleClientTotalsService
        .findTotalsByClient({ dateFrom, dateTo })
        .then((report) => new Map(report.items.map((item) => [item.clientKey, item.amountTotal])));
      cache.set(key, cached);
    }
    return cached;
  }

  // Venta facturada de un cliente en un mes completo.
  private async getActualRevenueForMonth(
    clientKey: string,
    year: number,
    month: number,
    cache: Map<string, Promise<Map<string, number>>>,
  ): Promise<number> {
    const revenue = await this.getRevenueForRange(
      toIsoDate(year, month, 1),
      toIsoDate(year, month, daysInMonthOf(year, month)),
      cache,
    );
    return revenue.get(clientKey) ?? 0;
  }

  // "Meta" ($) encadenada mes a mes: meta(mes N) = meta(mes N-1) * (1 + %
  // de crecimiento del mes N). Cuando la cadena se rompe (mes sin %
  // configurado, o tope de seguridad), se usa como base el monto REAL de
  // ese mes anterior. Mismo diseño que SalesGoalsService.resolveTargetRevenue
  // — ver ese archivo para el detalle completo del razonamiento.
  private resolveTargetRevenue(
    clientKey: string,
    year: number,
    month: number,
    growthByKey: Map<string, number>,
    targetMemo: Map<string, Promise<number | null>>,
    actualRevenueCache: Map<string, Promise<Map<string, number>>>,
    depth: number,
  ): Promise<number | null> {
    const key = goalKey(clientKey, year, month);
    const cached = targetMemo.get(key);
    if (cached) return cached;

    const compute = (async (): Promise<number | null> => {
      const growthPercent = growthByKey.get(key);
      if (growthPercent == null) return null;

      const prev = previousMonthOf(year, month);

      if (depth >= MAX_CHAIN_DEPTH) {
        this.logger.warn(
          `Cadena de metas de mayoreo para clientKey=${clientKey} (${year}-${pad2(month)}) superó ${MAX_CHAIN_DEPTH} meses hacia atrás — se corta y se usa lo real de ${prev.year}-${pad2(prev.month)} como base.`,
        );
        const base = await this.getActualRevenueForMonth(clientKey, prev.year, prev.month, actualRevenueCache);
        return base * (1 + growthPercent);
      }

      const prevTarget = await this.resolveTargetRevenue(
        clientKey,
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
          : await this.getActualRevenueForMonth(clientKey, prev.year, prev.month, actualRevenueCache);
      return base * (1 + growthPercent);
    })();

    targetMemo.set(key, compute);
    return compute;
  }

  async getSummary(query: FindWholesaleGoalsSummaryQueryDto): Promise<WholesaleGoalSummaryItemDoc[]> {
    const { year, month } = query;

    const now = new Date();
    const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
    const daysInMonth = daysInMonthOf(year, month);

    // "Hasta ayer" para el mes en curso — mismo criterio que Venta Mensual.
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

    const clientKeys = WHOLESALE_CLIENTS.map((client) => client.key);
    const allGoals = await this.wholesaleGoalsRepository.findManyForClients(clientKeys);
    const growthByKey = new Map<string, number>();
    const auditByKey = new Map<string, { updatedAt: Date; updatedByEmail: string | null }>();
    for (const goal of allGoals) {
      growthByKey.set(goalKey(goal.clientKey, goal.year, goal.month), goal.growthPercent);
      auditByKey.set(goalKey(goal.clientKey, goal.year, goal.month), { updatedAt: goal.updatedAt, updatedByEmail: goal.updatedByEmail });
    }

    const actualRevenueCache = new Map<string, Promise<Map<string, number>>>();
    const targetMemo = new Map<string, Promise<number | null>>();

    // La venta del mes en curso se resuelve de una sola vez para todos los
    // clientes (el agregado de facturas es global, no por cliente).
    const currentRevenue =
      dateTo === null
        ? new Map<string, number>()
        : await this.getRevenueForRange(dateFrom, dateTo, actualRevenueCache);

    return Promise.all(
      WHOLESALE_CLIENTS.map(async (client) => {
        const targetRevenue = await this.resolveTargetRevenue(
          client.key,
          year,
          month,
          growthByKey,
          targetMemo,
          actualRevenueCache,
          0,
        );

        const actualRevenue = currentRevenue.get(client.key) ?? 0;
        const growthPercent = growthByKey.get(goalKey(client.key, year, month)) ?? null;

        const reachPercent = targetRevenue ? actualRevenue / targetRevenue : null;
        const pendingValue = targetRevenue != null ? targetRevenue - actualRevenue : null;

        const audit = auditByKey.get(goalKey(client.key, year, month)) ?? null;
        const item: WholesaleGoalSummaryItemDoc = {
          clientKey: client.key,
          clientLabel: client.label,
          year,
          month,
          growthPercent,
          actualRevenue,
          targetRevenue,
          reachPercent,
          pendingValue,
          isCurrentMonth,
          updatedAt: audit ? audit.updatedAt : null,
          updatedByEmail: audit ? audit.updatedByEmail : null,
        };
        return item;
      }),
    );
  }
}
