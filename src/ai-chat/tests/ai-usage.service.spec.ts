import { describe, expect, it, vi } from 'vitest';
import { Role, User } from '../../generated/prisma/index.js';
import { AiUsageService } from '../services/ai-usage.service.js';
import type { AiUsageRepository } from '../repositories/ai-usage.repository.js';

const row = (createdAt: string, provider: string, userId: string, costUsd: number, status = 'OK') => ({
  provider,
  model: provider === 'claude' ? 'claude-sonnet-5-5' : 'gpt-6.1-sol',
  userId,
  userEmail: `${userId}@xoco.com`,
  userName: userId,
  costUsd,
  inputTokens: 1000,
  outputTokens: 100,
  status,
  createdAt: new Date(createdAt),
});

describe('AiUsageService', () => {
  it('suma por día local, por IA y por usuario', async () => {
    const rows = [
      row('2026-11-01T05:30:00Z', 'claude', 'a', 0.1), // 31 oct 23:30 en El Salvador
      row('2026-11-01T15:00:00Z', 'claude', 'a', 0.2),
      row('2026-11-01T16:00:00Z', 'openai', 'b', 0.05, 'ERROR'),
    ];
    const repository = {
      findForSummary: vi.fn(async () => rows),
      findPage: vi.fn(async () => []),
      count: vi.fn(async () => 3),
    };
    const service = new AiUsageService(repository as unknown as AiUsageRepository);
    const result = await service.find({ dateFrom: '2026-10-31', dateTo: '2026-11-01' });

    const where = (repository.findForSummary.mock.calls[0] as unknown as [{ createdAt: { gte: Date; lt: Date } }])[0];
    expect(where.createdAt.gte.toISOString()).toBe('2026-10-31T06:00:00.000Z');
    expect(where.createdAt.lt.toISOString()).toBe('2026-11-02T06:00:00.000Z');
    expect(result.totals).toMatchObject({ costUsd: 0.35, queries: 3, errors: 1 });
    expect(result.byDay).toEqual([
      { date: '2026-10-31', costUsd: 0.1, queries: 1, claude: 0.1, openai: 0 },
      { date: '2026-11-01', costUsd: 0.25, queries: 2, claude: 0.2, openai: 0.05 },
    ]);
    expect(result.byUser[0]).toMatchObject({ userId: 'a', costUsd: 0.3, queries: 2 });
    expect(result.byProvider.map((item) => item.provider)).toEqual(['claude', 'openai']);
  });

  it('con filtro de usuario, los totales son de ese usuario pero la lista de usuarios trae a todos', async () => {
    const rows = [row('2026-11-01T15:00:00Z', 'claude', 'a', 0.2), row('2026-11-01T16:00:00Z', 'openai', 'b', 0.05)];
    const repository = { findForSummary: vi.fn(async () => rows), findPage: vi.fn(async () => []), count: vi.fn(async () => 1) };
    const service = new AiUsageService(repository as unknown as AiUsageRepository);
    const result = await service.find({ dateFrom: '2026-11-01', dateTo: '2026-11-01', userId: 'b' });
    expect(result.totals).toMatchObject({ costUsd: 0.05, queries: 1 });
    expect(result.byUser.map((user) => user.userId)).toEqual(['a', 'b']);
    const pageWhere = (repository.findPage.mock.calls[0] as unknown as [{ userId?: string }])[0];
    expect(pageWhere.userId).toBe('b');
  });

  it('registrar nunca rompe el chat aunque falle la base', async () => {
    const repository = { create: vi.fn(async () => Promise.reject(new Error('mongo caído'))) };
    const service = new AiUsageService(repository as unknown as AiUsageRepository);
    await expect(
      service.record({
        user: { id: 'u', email: 'a@x.com', name: 'A', role: Role.SUPER_ADMIN } as User,
        provider: 'claude',
        model: 'claude-sonnet-5-5',
        inputTokens: 10,
        outputTokens: 1,
        steps: 1,
        toolCalls: 0,
        status: 'OK',
        durationMs: 5,
      }),
    ).resolves.toBeUndefined();
  });
});
