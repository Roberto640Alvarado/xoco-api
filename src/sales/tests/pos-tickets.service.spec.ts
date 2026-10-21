import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PosTicketsService } from '../services/pos-tickets.service.js';
import { PosTicketSort } from '../enums/pos-ticket-sort.enum.js';
import { createOdooServiceMock, domainOfCall } from './mocks/odoo.service.mock.js';
import type { OdooPosOrder, OdooPosOrderLine } from '../../odoo/types/odoo-entities.types.js';

const RAMBLAS_ID = 3;

function orderOf(id: number, dateOrder: string, overrides: Partial<OdooPosOrder> = {}): OdooPosOrder {
  return {
    id,
    name: `Ramblas/${id}`,
    session_id: [9000, 'POS/09000'],
    config_id: [RAMBLAS_ID, 'Tienda Ramblas'],
    partner_id: false,
    date_order: dateOrder,
    state: 'paid',
    amount_total: 10,
    amount_tax: 1.15,
    amount_paid: 20,
    amount_return: 10,
    user_id: [7, 'Ana Cajera'],
    company_id: [1, 'Xocolatísimo'],
    create_date: dateOrder,
    write_date: dateOrder,
    pos_reference: `Orden 00012-003-000${id}`,
    ...overrides,
  };
}

function lineOf(id: number, orderId: number, product: [number, string], qty: number, total: number, uom: [number, string] | false = false): OdooPosOrderLine {
  return {
    id,
    order_id: [orderId, `Ramblas/${orderId}`],
    product_id: product,
    product_uom_id: uom,
    qty,
    price_unit: total / qty,
    price_subtotal: total / 1.13,
    price_subtotal_incl: total,
    discount: 0,
    full_product_name: product[1],
    create_date: '',
    write_date: '',
  };
}

const BASE_QUERY = { dateFrom: '2026-10-01', dateTo: '2026-10-20', page: 1, limit: 20, sort: PosTicketSort.DATE_DESC };

describe('PosTicketsService', () => {
  describe('findTickets', () => {
    it('arma cada orden con hora local, unidades sin granel, métodos de pago y totales del filtro', async () => {
      const odoo = createOdooServiceMock({
        orders: [orderOf(1, '2026-10-08 01:04:31')], // 2026-10-07 19:04 local
        lines: [
          lineOf(10, 1, [100, 'Trufa Leche'], 2, 3.5),
          lineOf(11, 1, [101, 'Crocks'], 250, 5, [5, 'g']),
        ],
        orderGroups: [
          { __count: 3, config_id: [RAMBLAS_ID, 'Tienda Ramblas'], amount_total: 30 },
          { __count: 1, config_id: [4, 'Tienda Centro'], amount_total: 10.01 },
        ],
        paymentGroups: [
          { __count: 1, pos_order_id: [1, 'Ramblas/1'], payment_method_id: [1, 'Efectivo'], amount: 5 },
          { __count: 1, pos_order_id: [1, 'Ramblas/1'], payment_method_id: [2, 'Tarjeta'], amount: 5 },
        ],
      });
      const service = new PosTicketsService(odoo.service);

      const result = await service.findTickets({ ...BASE_QUERY, posConfigId: RAMBLAS_ID, search: 'ana' });

      expect(result.items[0]).toMatchObject({
        date: '2026-10-07',
        time: '19:04',
        posReference: 'Orden 00012-003-0001',
        cashier: { id: 7, name: 'Ana Cajera' },
        lineCount: 2,
        unitCount: 2,
        amountUntaxed: 8.85,
        paymentMethods: ['Efectivo', 'Tarjeta'],
      });
      expect(result.totals).toEqual({ orderCount: 4, totalRevenue: 40.01, averageTicket: 10 });

      const domain = domainOfCall(odoo.findPosOrders);
      expect(domain).toContainEqual(['config_id', '=', RAMBLAS_ID]);
      expect(domain).toContainEqual(['state', '!=', 'cancel']);
      expect(domain).toContainEqual(['partner_id.name', 'ilike', 'ana']);
      expect(odoo.findPosOrders.mock.calls[0][0]).toMatchObject({ limit: 20, offset: 0, order: 'date_order desc, id desc' });
    });

    it('no consulta líneas ni pagos si la página viene vacía', async () => {
      const odoo = createOdooServiceMock();
      const service = new PosTicketsService(odoo.service);

      const result = await service.findTickets({ ...BASE_QUERY, sort: PosTicketSort.AMOUNT_DESC, page: 3 });

      expect(result.items).toEqual([]);
      expect(odoo.findPosOrders.mock.calls[0][0]).toMatchObject({ offset: 40, order: 'amount_total desc, id desc' });
      expect(odoo.findPosOrderLines).not.toHaveBeenCalled();
      expect(odoo.readGroupPosPayments).not.toHaveBeenCalled();
    });

    it('rechaza un rango con la fecha inicial después de la final', async () => {
      const service = new PosTicketsService(createOdooServiceMock().service);
      await expect(service.findTickets({ ...BASE_QUERY, dateFrom: '2026-10-21' })).rejects.toThrow(
        'La fecha inicial no puede ser posterior a la final.',
      );
    });
  });

  describe('findTicket', () => {
    it('devuelve productos (granel marcado) y pagos ordenados por monto', async () => {
      const odoo = createOdooServiceMock({
        orders: [orderOf(1, '2026-10-08 01:04:31')],
        lines: [lineOf(11, 1, [101, 'Crocks'], 250, 5, [5, 'g']), lineOf(10, 1, [100, 'Trufa Leche'], 2, 3.5)],
        paymentGroups: [
          { __count: 1, payment_method_id: [2, 'Tarjeta'], amount: 3 },
          { __count: 1, payment_method_id: [1, 'Efectivo'], amount: 17 },
        ],
      });
      const ticket = await new PosTicketsService(odoo.service).findTicket(1);

      expect(ticket.lines.map((line) => line.productName)).toEqual(['Trufa Leche', 'Crocks']);
      expect(ticket.lines[1]).toMatchObject({ isWeight: true, uomName: 'g', quantity: 250, quantityKg: 0.25 });
      expect(ticket.payments.map((payment) => payment.paymentMethodName)).toEqual(['Efectivo', 'Tarjeta']);
      expect(ticket.store).toEqual({ id: RAMBLAS_ID, name: 'Tienda Ramblas' });
    });

    it('responde 404 si la orden no existe', async () => {
      const service = new PosTicketsService(createOdooServiceMock().service);
      await expect(service.findTicket(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
