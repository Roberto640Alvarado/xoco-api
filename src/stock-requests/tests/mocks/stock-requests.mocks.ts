import { vi } from 'vitest';
import type { OdooService } from '../../../odoo/services/odoo.service.js';
import type { OdooProduct } from '../../../odoo/types/odoo-entities.types.js';
import type { InventoryMovementsService } from '../../../inventory/services/inventory-movements.service.js';
import type { InventoryAccessService } from '../../../inventory/services/inventory-access.service.js';
import type { AuthenticatedUser } from '../../../common/interfaces/jwt-payload.interface.js';
import { Role, StockRequestStatus, StoreStockRequest } from '../../../generated/prisma/index.js';
import type { StockRequestsRepository } from '../../repositories/stock-requests.repository.js';
import { NotFoundException } from '@nestjs/common';

export const RAMBLAS = 3;
export const CENTRO = 4;

export const USERS = {
  tienda: { id: 'u1', email: 'ramblas@xoco.com', role: Role.VENDEDOR, posConfigId: RAMBLAS, inventoryEnabled: true } as AuthenticatedUser,
  otraTienda: { id: 'u2', email: 'centro@xoco.com', role: Role.VENDEDOR, posConfigId: CENTRO, inventoryEnabled: true } as AuthenticatedUser,
  planta: { id: 'u3', email: 'planta@xoco.com', role: Role.PLANTA, posConfigId: null } as AuthenticatedUser,
  admin: { id: 'u4', email: 'admin@xoco.com', role: Role.SUPER_ADMIN, posConfigId: null } as AuthenticatedUser,
  finanzas: { id: 'u5', email: 'fin@xoco.com', role: Role.FINANZAS, posConfigId: null } as AuthenticatedUser,
};

function product(id: number, name: string, category: string, uom: string): OdooProduct {
  return {
    id,
    display_name: name,
    categ_id: [id, category],
    uom_id: [1, uom],
    default_code: false,
    barcode: false,
    type: 'consu',
    list_price: 1,
    standard_price: 1,
    qty_available: 0,
    active: true,
    product_tmpl_id: [id, name],
    create_date: '',
    write_date: '',
  };
}

export const PRODUCTS: OdooProduct[] = [
  product(100, 'Tableta Leche 70g', 'All / Tabletas', 'Unidades'),
  product(101, 'Tableta Oscura 70g', 'All / Tabletas', 'Unidades'),
  product(200, 'Bombón Mixto', 'All / Bombones', 'Unidades'),
  product(300, 'Granola Chocolate', 'All / Welness', 'Unidades'),
  product(400, 'Crocks', 'All / Grajeados', 'kg'),
];

export function createOdooMock() {
  const findProducts = vi.fn().mockResolvedValue(PRODUCTS);
  const findPosConfigs = vi.fn().mockResolvedValue([
    { id: RAMBLAS, name: 'Tienda Ramblas' },
    { id: CENTRO, name: 'Tienda Centro' },
  ]);
  return { findProducts, findPosConfigs, service: { findProducts, findPosConfigs } as unknown as OdooService };
}

export function createAccessMock() {
  const assertEnabledFor = vi.fn().mockResolvedValue(undefined);
  const isEnabledFor = vi.fn().mockResolvedValue(true);
  return { assertEnabledFor, isEnabledFor, service: { assertEnabledFor, isEnabledFor } as unknown as InventoryAccessService };
}

export function createMovementsMock() {
  const createConfirmedEntries = vi.fn().mockResolvedValue(undefined);
  return { createConfirmedEntries, service: { createConfirmedEntries } as unknown as InventoryMovementsService };
}

// Repositorio en memoria con la misma regla de concurrencia que el real:
// un cambio solo se guarda si la solicitud no cambió desde que se leyó.
export class FakeStockRequestsRepository {
  rows: StoreStockRequest[] = [];
  private seq = 0;
  private tick = 0;
  /** Para simular que alguien más guardó antes. */
  failNextUpdate = false;

  nextNumber = vi.fn(async () => ++this.seq);

  create = vi.fn(async (data: Record<string, unknown>) => {
    const row = {
      dispatchedAt: null,
      receivedAt: null,
      createdAt: new Date(2026, 9, 26, 10, 0, this.tick++),
      updatedAt: new Date(2026, 9, 26, 10, 0, this.tick++),
      ...data,
      id: `6${String(this.rows.length + 1).padStart(23, '0')}`,
    } as unknown as StoreStockRequest;
    this.rows.push(row);
    return row;
  });

  findById = vi.fn(async (id: string) => this.rows.find((row) => row.id === id) ?? null);

  findByIdOrThrow = vi.fn(async (id: string) => {
    const row = await this.findById(id);
    if (!row) throw new NotFoundException('No se encontró la solicitud.');
    return row;
  });

  findMany = vi.fn(async (filters: { status?: StockRequestStatus; posConfigId?: number }) =>
    this.rows.filter(
      (row) =>
        (!filters.status || row.status === filters.status) &&
        (filters.posConfigId === undefined || row.posConfigId === filters.posConfigId),
    ),
  );

  count = vi.fn(async (statuses: StockRequestStatus[], posConfigId?: number) =>
    this.rows.filter((row) => statuses.includes(row.status) && (posConfigId === undefined || row.posConfigId === posConfigId))
      .length,
  );

  updateIfUnchanged = vi.fn(async (current: StoreStockRequest, data: Record<string, unknown>) => {
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      return false;
    }
    const row = this.rows.find((candidate) => candidate.id === current.id);
    if (!row || row.updatedAt.getTime() !== current.updatedAt.getTime()) return false;
    for (const [key, value] of Object.entries(data)) {
      const next = value && typeof value === 'object' && 'set' in (value as object) ? (value as { set: unknown }).set : value;
      (row as unknown as Record<string, unknown>)[key] = next;
    }
    row.updatedAt = new Date(2026, 9, 26, 10, 0, this.tick++);
    return true;
  });

  get service(): StockRequestsRepository {
    return this as unknown as StockRequestsRepository;
  }
}
