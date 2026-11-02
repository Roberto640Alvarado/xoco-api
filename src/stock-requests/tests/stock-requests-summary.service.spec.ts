import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockRequestStatus } from '../../generated/prisma/index.js';
import { StockRequestsSummaryService } from '../services/stock-requests-summary.service.js';
import type { StockRequestsRepository } from '../repositories/stock-requests.repository.js';
import type { OdooService } from '../../odoo/services/odoo.service.js';

const req = (posConfigId: number, status: StockRequestStatus, createdAt: string, qty = 2) => ({
  posConfigId,
  status,
  createdAt: new Date(createdAt),
  receivedAt: null,
  lines: [{ requestedQuantity: qty, addedByPlant: false }],
});

describe('StockRequestsSummaryService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T20:00:00Z')); // 14:00 en El Salvador
  });
  afterEach(() => vi.useRealTimers());

  it('cuenta pedidos de hoy, pendientes, en camino y por día y tienda (sin canceladas)', async () => {
    const repository = {
      findPlantForSummary: vi.fn(async () => [
        req(1, StockRequestStatus.SOLICITADA, '2026-11-01T15:00:00Z', 3),
        req(1, StockRequestStatus.EN_CAMINO, '2026-10-31T15:00:00Z'),
        req(2, StockRequestStatus.EN_PREPARACION, '2026-11-01T05:30:00Z'), // 31 oct 23:30 local
        req(2, StockRequestStatus.CANCELADA, '2026-11-01T16:00:00Z'),
      ]),
    } as unknown as StockRequestsRepository;
    const odoo = { findPosConfigs: vi.fn(async () => [{ id: 1, name: 'CENTRIKA' }, { id: 2, name: 'San Benito' }]) } as unknown as OdooService;

    const result = await new StockRequestsSummaryService(repository, odoo).summary();
    expect(result.totals).toMatchObject({ today: 1, pending: 2, onTheWay: 1, recent: 3 });
    expect(result.byDay).toHaveLength(14);
    expect(result.byDay.at(-1)).toEqual({ date: '2026-11-01', total: 1, byStore: { 1: 1 } });
    expect(result.byDay.at(-2)).toEqual({ date: '2026-10-31', total: 2, byStore: { 1: 1, 2: 1 } });
    const centrika = result.stores.find((store) => store.posConfigId === 1);
    expect(centrika).toMatchObject({ today: 1, pending: 1, onTheWay: 1, recent: 2, units: 5 });
  });
});
