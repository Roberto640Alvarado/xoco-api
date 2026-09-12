import { Mock, vi } from 'vitest';
import { OdooService } from '../../../odoo/services/odoo.service.js';
import {
  OdooAccountMove,
  OdooAccountMoveGroup,
  OdooPosConfig,
  OdooPosOrder,
  OdooPosOrderGroup,
  OdooPosOrderLine,
  OdooPosSession,
} from '../../../odoo/types/odoo-entities.types.js';

export interface OdooServiceMock {
  service: OdooService;
  findPosOrders: Mock;
  findPosOrderLines: Mock;
  findPosSessions: Mock;
  findPosConfigs: Mock;
  countPosOrders: Mock;
  findAccountMoves: Mock;
  readGroupAccountMoves: Mock;
  readGroupPosOrders: Mock;
}

export interface OdooServiceMockData {
  orders?: OdooPosOrder[];
  lines?: OdooPosOrderLine[];
  sessions?: OdooPosSession[];
  configs?: OdooPosConfig[];
  moves?: OdooAccountMove[];
  moveGroups?: OdooAccountMoveGroup[];
  orderGroups?: OdooPosOrderGroup[];
}

// Doble de OdooService que devuelve siempre el mismo conjunto de
// registros, sin interpretar el domain. Es a propósito: así los tests
// verifican lo que le toca al SalesService (qué domain arma y cómo agrupa
// lo que recibe), no una reimplementación del motor de búsqueda de Odoo.
export function createOdooServiceMock(data: OdooServiceMockData = {}): OdooServiceMock {
  const orders = data.orders ?? [];

  const mock = {
    findPosOrders: vi.fn().mockResolvedValue(orders),
    findPosOrderLines: vi.fn().mockResolvedValue(data.lines ?? []),
    findPosSessions: vi.fn().mockResolvedValue(data.sessions ?? []),
    findPosConfigs: vi.fn().mockResolvedValue(data.configs ?? []),
    countPosOrders: vi.fn().mockResolvedValue(orders.length),
    findAccountMoves: vi.fn().mockResolvedValue(data.moves ?? []),
    readGroupAccountMoves: vi.fn().mockResolvedValue(data.moveGroups ?? []),
    readGroupPosOrders: vi.fn().mockResolvedValue(data.orderGroups ?? []),
  };

  return { ...mock, service: mock as unknown as OdooService };
}

// El domain que recibió la n-ésima llamada a un search_read mockeado.
export function domainOfCall(mock: Mock, callIndex = 0): unknown[] {
  const options = mock.mock.calls[callIndex][0] as { domain: unknown[] };
  return options.domain;
}
