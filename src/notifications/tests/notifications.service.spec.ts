import { describe, expect, it, vi } from 'vitest';
import { InventoryMovementStatus, InventoryMovementType, Role, StockRequestStatus } from '../../generated/prisma/index.js';
import { NotificationsService } from '../services/notifications.service.js';
import type { StockRequestsService } from '../../stock-requests/services/stock-requests.service.js';
import type { InventoryMovementsService } from '../../inventory/services/inventory-movements.service.js';
import type { OdooService } from '../../odoo/services/odoo.service.js';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';

const request = (over: Record<string, unknown>) => ({
  id: 'r1',
  number: 12,
  posConfigId: 1,
  storeName: 'CENTRIKA',
  sourcePosConfigId: null,
  sourceName: 'Planta',
  status: StockRequestStatus.SOLICITADA,
  updatedAt: new Date('2026-11-01T15:00:00Z'),
  lines: [{ addedByPlant: false }, { addedByPlant: false }, { addedByPlant: true }],
  ...over,
});

const movement = (over: Record<string, unknown>) => ({
  id: 'm1',
  posConfigId: 1,
  productName: 'Bombones x6',
  type: InventoryMovementType.MERMA,
  quantity: 2,
  status: InventoryMovementStatus.PENDIENTE,
  registeredByEmail: 'tienda@xoco.com',
  occurredAt: new Date('2026-11-01T16:00:00Z'),
  resolvedAt: null,
  rejectionReason: null,
  ...over,
});

function setup(requests: unknown[], movements: unknown[]) {
  const service = new NotificationsService(
    { findNotificationItems: vi.fn(async () => requests) } as unknown as StockRequestsService,
    { findNotificationItems: vi.fn(async () => movements) } as unknown as InventoryMovementsService,
    { findPosConfigs: vi.fn(async () => [{ id: 1, name: 'CENTRIKA' }]) } as unknown as OdooService,
  );
  return service;
}

describe('NotificationsService', () => {
  it('Planta: solicitudes por responder y por despachar', async () => {
    const service = setup([request({}), request({ id: 'r2', number: 13, status: StockRequestStatus.EN_PREPARACION, updatedAt: new Date('2026-11-01T17:00:00Z') })], []);
    const { items } = await service.find({ role: Role.PLANTA } as AuthenticatedUser);
    expect(items.map((item) => item.title)).toEqual(['Lista para despachar: SOL-0013', 'Nueva solicitud de CENTRIKA']);
    expect(items[1]).toMatchObject({ tone: 'warning', description: 'SOL-0012 · 2 productos · por responder', href: '/dashboard/inventario/solicitudes' });
  });

  it('Vendedor: envío en camino, lo que le piden y movimientos resueltos', async () => {
    const service = setup(
      [request({ status: StockRequestStatus.EN_CAMINO }), request({ id: 'r3', posConfigId: 2, storeName: 'San Benito', sourcePosConfigId: 1 })],
      [movement({ status: InventoryMovementStatus.RECHAZADO, rejectionReason: 'No coincide', resolvedAt: new Date('2026-11-01T18:00:00Z') })],
    );
    const { items } = await service.find({ role: Role.VENDEDOR, posConfigId: 1 } as AuthenticatedUser);
    expect(items[0]).toMatchObject({ tone: 'danger', title: 'Rechazaron tu merma', description: 'Bombones x6 · 2 · motivo: No coincide' });
    expect(items.map((item) => item.title)).toContain('Tu pedido SOL-0012 va en camino');
    expect(items.map((item) => item.title)).toContain('San Benito te pide productos');
  });

  it('Admin: movimientos por confirmar con el nombre de la tienda', async () => {
    const service = setup([], [movement({})]);
    const { items, total } = await service.find({ role: Role.SUPER_ADMIN } as AuthenticatedUser);
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({ title: 'Merma por confirmar en CENTRIKA', description: 'Bombones x6 · 2 · registró tienda@xoco.com', href: '/dashboard/inventario/movimientos' });
  });
});
