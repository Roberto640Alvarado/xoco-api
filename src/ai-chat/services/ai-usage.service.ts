import { Injectable, Logger } from '@nestjs/common';
import { Prisma, User } from '../../generated/prisma/index.js';
import { AiProviderKey } from '../providers/provider.types.js';
import { AiUsageRepository } from '../repositories/ai-usage.repository.js';
import { estimateCost } from '../utils/ai-pricing.util.js';
import { FindAiUsageQueryDto } from '../dto/find-ai-usage-query.dto.js';

const STORE_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' });

export interface RecordUsageInput {
  user: User;
  provider: AiProviderKey;
  model: string;
  inputTokens: number;
  outputTokens: number;
  steps: number;
  toolCalls: number;
  status: 'OK' | 'ERROR' | 'DETENIDA';
  errorMessage?: string | null;
  durationMs: number;
}

/** Inicio del día local de El Salvador (UTC-6) en UTC. */
function localDayStart(date: string): Date {
  return new Date(`${date}T06:00:00.000Z`);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

// Gasto de Xoco IA: registra cada pregunta con su costo estimado y arma el
// resumen (por día, por IA y por usuario) para la pantalla de Gasto.
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(private readonly repository: AiUsageRepository) {}

  async record(input: RecordUsageInput): Promise<void> {
    try {
      await this.repository.create({
        provider: input.provider,
        model: input.model,
        userId: input.user.id,
        userEmail: input.user.email,
        userName: input.user.name ?? null,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costUsd: estimateCost(input.provider, input.model, input.inputTokens, input.outputTokens),
        steps: input.steps,
        toolCalls: input.toolCalls,
        status: input.status,
        errorMessage: input.errorMessage ?? null,
        durationMs: input.durationMs,
      });
    } catch (error) {
      // El registro de gasto nunca debe romper la respuesta del chat.
      this.logger.error('No se pudo registrar el uso de Xoco IA', error instanceof Error ? error.stack : String(error));
    }
  }

  async find(query: FindAiUsageQueryDto) {
    const today = STORE_DATE.format(new Date());
    const dateTo = query.dateTo ?? today;
    const dateFrom = query.dateFrom ?? `${dateTo.slice(0, 7)}-01`;
    // Sin el filtro de usuario: así la lista de usuarios (para el filtro y el
    // ranking) siempre trae a todos los del período.
    const baseWhere: Prisma.AiUsageLogWhereInput = {
      createdAt: { gte: localDayStart(dateFrom), lt: localDayStart(addDays(dateTo, 1)) },
      ...(query.provider ? { provider: query.provider } : {}),
    };
    const where: Prisma.AiUsageLogWhereInput = { ...baseWhere, ...(query.userId ? { userId: query.userId } : {}) };
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    const [allRows, items, total] = await Promise.all([
      this.repository.findForSummary(baseWhere),
      this.repository.findPage(where, (page - 1) * limit, limit),
      this.repository.count(where),
    ]);

    const byDay = new Map<string, { date: string; costUsd: number; queries: number; claude: number; openai: number }>();
    for (let day = dateFrom; day <= dateTo; day = addDays(day, 1)) {
      byDay.set(day, { date: day, costUsd: 0, queries: 0, claude: 0, openai: 0 });
      if (byDay.size > 400) break;
    }
    const byProvider = new Map<string, { provider: string; model: string; costUsd: number; queries: number; inputTokens: number; outputTokens: number }>();
    const byUser = new Map<string, { userId: string; userEmail: string; userName: string | null; costUsd: number; queries: number }>();
    const totals = { costUsd: 0, queries: 0, inputTokens: 0, outputTokens: 0, errors: 0 };

    for (const row of allRows) {
      const userRow = byUser.get(row.userId) ?? { userId: row.userId, userEmail: row.userEmail, userName: row.userName, costUsd: 0, queries: 0 };
      userRow.costUsd += row.costUsd;
      userRow.queries += 1;
      byUser.set(row.userId, userRow);
    }

    const rows = query.userId ? allRows.filter((row) => row.userId === query.userId) : allRows;
    for (const row of rows) {
      totals.costUsd += row.costUsd;
      totals.queries += 1;
      totals.inputTokens += row.inputTokens;
      totals.outputTokens += row.outputTokens;
      if (row.status === 'ERROR') totals.errors += 1;

      const day = byDay.get(STORE_DATE.format(row.createdAt));
      if (day) {
        day.costUsd += row.costUsd;
        day.queries += 1;
        if (row.provider === 'claude') day.claude += row.costUsd;
        else day.openai += row.costUsd;
      }

      const providerKey = `${row.provider}:${row.model}`;
      const providerRow = byProvider.get(providerKey) ?? { provider: row.provider, model: row.model, costUsd: 0, queries: 0, inputTokens: 0, outputTokens: 0 };
      providerRow.costUsd += row.costUsd;
      providerRow.queries += 1;
      providerRow.inputTokens += row.inputTokens;
      providerRow.outputTokens += row.outputTokens;
      byProvider.set(providerKey, providerRow);
    }

    return {
      dateFrom,
      dateTo,
      totals: { ...totals, costUsd: round(totals.costUsd), averageCostUsd: totals.queries ? round(totals.costUsd / totals.queries) : 0 },
      byDay: [...byDay.values()].map((day) => ({ ...day, costUsd: round(day.costUsd), claude: round(day.claude), openai: round(day.openai) })),
      byProvider: [...byProvider.values()].map((item) => ({ ...item, costUsd: round(item.costUsd) })).sort((a, b) => b.costUsd - a.costUsd),
      byUser: [...byUser.values()].map((item) => ({ ...item, costUsd: round(item.costUsd) })).sort((a, b) => b.costUsd - a.costUsd),
      items: items.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        provider: item.provider,
        model: item.model,
        userId: item.userId,
        userEmail: item.userEmail,
        userName: item.userName,
        inputTokens: item.inputTokens,
        outputTokens: item.outputTokens,
        costUsd: item.costUsd,
        steps: item.steps,
        toolCalls: item.toolCalls,
        status: item.status,
        errorMessage: item.errorMessage,
        durationMs: item.durationMs,
      })),
      page,
      limit,
      total,
    };
  }
}
