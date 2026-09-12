import { Mock, vi } from 'vitest';
import { OdooService } from '../../../odoo/services/odoo.service.js';
import {
  OdooAccountMove,
  OdooAccountMoveGroup,
  OdooPosConfig,
  OdooPosOrder,
  OdooPosOrderGroup,
  OdooPosOrderLine,
  OdooPosPaymentGroup,
  OdooPosPaymentMethod,
  OdooPosSession,
  OdooProduct,
} from '../../../odoo/types/odoo-entities.types.js';

export interface OdooServiceMock {
  service: OdooService;
  findPosOrders: Mock;
  findPosOrderLines: Mock;
  findPosSessions: Mock;
  findPosConfigs: Mock;
  findProducts: Mock;
  findPosPaymentMethods: Mock;
  countPosOrders: Mock;
  findAccountMoves: Mock;
  readGroupAccountMoves: Mock;
  readGroupPosOrders: Mock;
  readGroupPosPayments: Mock;
}

export interface OdooServiceMockData {
  orders?: OdooPosOrder[];
  lines?: OdooPosOrderLine[];
  sessions?: OdooPosSession[];
  configs?: OdooPosConfig[];
  products?: OdooProduct[];
  paymentMethods?: OdooPosPaymentMethod[];
  moves?: OdooAccountMove[];
  moveGroups?: OdooAccountMoveGroup[];
  orderGroups?: OdooPosOrderGroup[];
  paymentGroups?: OdooPosPaymentGroup[];
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
    findProducts: vi.fn().mockResolvedValue(data.products ?? []),
    findPosPaymentMethods: vi.fn().mockResolvedValue(data.paymentMethods ?? []),
    countPosOrders: vi.fn().mockResolvedValue(orders.length),
    findAccountMoves: vi.fn().mockResolvedValue(data.moves ?? []),
    readGroupAccountMoves: vi.fn().mockResolvedValue(data.moveGroups ?? []),
    readGroupPosOrders: vi.fn().mockResolvedValue(data.orderGroups ?? []),
    readGroupPosPayments: vi.fn().mockResolvedValue(data.paymentGroups ?? []),
  };

  return { ...mock, service: mock as unknown as OdooService };
}

// El domain que recibió la n-ésima llamada a un search_read mockeado.
export function domainOfCall(mock: Mock, callIndex = 0): unknown[] {
  const options = mock.mock.calls[callIndex][0] as { domain: unknown[] };
  return options.domain;
}
