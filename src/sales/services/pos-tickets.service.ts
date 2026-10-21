import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { OdooMany2One } from '../../odoo/types/odoo-common.types.js';
import { OdooPosOrder, OdooPosOrderLine, OdooPosPaymentGroup } from '../../odoo/types/odoo-entities.types.js';
import { fetchAllOdooPages } from '../../common/utils/odoo-pagination.util.js';
import { roundMoney } from '../../common/utils/money.util.js';
import { isWeightUom, weightKgFactor } from '../../common/utils/product-uom.util.js';
import { toStoreDate, toStoreTime } from '../../common/utils/store-date.util.js';
import { buildPosOrdersDomain } from '../builders/pos-order-domain.builder.js';
import { FindPosTicketsQueryDto } from '../dto/find-pos-tickets-query.dto.js';
import { PosTicketSort } from '../enums/pos-ticket-sort.enum.js';
import { RefDoc } from '../doc/sales.doc.js';
import {
  PaginatedPosTicketsDoc,
  PosTicketDetailDoc,
  PosTicketLineDoc,
  PosTicketPaymentDoc,
  PosTicketSummaryDoc,
  PosTicketsTotalsDoc,
} from '../doc/pos-tickets.doc.js';

const UNKNOWN_REF: RefDoc = { id: -1, name: 'Desconocido' };

// `order` de search_read por cada orden del listado. El id desempata para
// que la paginación sea estable entre órdenes del mismo segundo/monto.
const SORT_ORDER: Record<PosTicketSort, string> = {
  [PosTicketSort.DATE_DESC]: 'date_order desc, id desc',
  [PosTicketSort.DATE_ASC]: 'date_order asc, id asc',
  [PosTicketSort.AMOUNT_DESC]: 'amount_total desc, id desc',
  [PosTicketSort.AMOUNT_ASC]: 'amount_total asc, id asc',
};

function toRef(value: OdooMany2One): RefDoc | null {
  return value ? { id: value[0], name: value[1] } : null;
}

// Tickets → Órdenes: cada orden de caja (pos.order) con su información
// principal y, en el detalle, qué se compró y cómo se pagó. Vive aparte de
// SalesService (que ya pasa de 700 líneas) y comparte con él el domain de
// órdenes (buildPosOrdersDomain) para contar exactamente lo mismo. Las
// órdenes canceladas no se listan: no vendieron nada.
@Injectable()
export class PosTicketsService {
  private readonly logger = new Logger(PosTicketsService.name);

  constructor(private readonly odooService: OdooService) {}

  private buildDomain(query: FindPosTicketsQueryDto): unknown[] {
    const dateTo = query.dateTo ?? query.dateFrom;
    if (query.dateFrom > dateTo) {
      throw new BadRequestException('La fecha inicial no puede ser posterior a la final.');
    }
    const domain = buildPosOrdersDomain(query.dateFrom, dateTo, query.posConfigId, { excludeCancelled: true });
    if (query.search) {
      domain.push(
        '|',
        '|',
        ['name', 'ilike', query.search],
        ['pos_reference', 'ilike', query.search],
        ['partner_id.name', 'ilike', query.search],
      );
    }
    return domain;
  }

  private fetchLines(orderIds: number[], contextLabel: string): Promise<OdooPosOrderLine[]> {
    return fetchAllOdooPages(
      (options) => this.odooService.findPosOrderLines(options),
      [['order_id', 'in', orderIds]],
      contextLabel,
      this.logger,
    );
  }

  private toSummary(order: OdooPosOrder, lines: OdooPosOrderLine[], paymentMethods: string[]): PosTicketSummaryDoc {
    const unitCount = lines.reduce((sum, line) => (isWeightUom(line.product_uom_id) ? sum : sum + line.qty), 0);
    return {
      id: order.id,
      name: order.name,
      posReference: order.pos_reference || null,
      date: toStoreDate(order.date_order),
      time: toStoreTime(order.date_order),
      state: order.state,
      store: toRef(order.config_id) ?? UNKNOWN_REF,
      session: toRef(order.session_id) ?? UNKNOWN_REF,
      cashier: toRef(order.user_id),
      customer: toRef(order.partner_id),
      lineCount: lines.length,
      unitCount,
      amountUntaxed: roundMoney(order.amount_total - order.amount_tax),
      amountTax: roundMoney(order.amount_tax),
      amountTotal: roundMoney(order.amount_total),
      amountPaid: roundMoney(order.amount_paid),
      amountReturn: roundMoney(order.amount_return),
      paymentMethods,
    };
  }

  private toLine(line: OdooPosOrderLine): PosTicketLineDoc {
    const kgFactor = weightKgFactor(line.product_uom_id);
    return {
      id: line.id,
      productId: line.product_id ? line.product_id[0] : null,
      productName: line.full_product_name || (line.product_id ? line.product_id[1] : 'Producto sin nombre'),
      quantity: line.qty,
      uomName: line.product_uom_id ? line.product_uom_id[1] : null,
      isWeight: kgFactor !== null,
      quantityKg: kgFactor === null ? null : line.qty * kgFactor,
      // 4 decimales, no centavos: en granel Odoo da el precio por gramo
      // (ej. $0.0362) y redondearlo a $0.04 falsea el precio por kg.
      priceUnit: Math.round(line.price_unit * 10_000) / 10_000,
      discount: line.discount ?? 0,
      subtotal: roundMoney(line.price_subtotal),
      total: roundMoney(line.price_subtotal_incl),
    };
  }

  private toTotals(groups: { __count: number; amount_total?: number }[]): PosTicketsTotalsDoc {
    const orderCount = groups.reduce((sum, group) => sum + group.__count, 0);
    const totalRevenue = roundMoney(groups.reduce((sum, group) => sum + (group.amount_total ?? 0), 0));
    return { orderCount, totalRevenue, averageTicket: orderCount ? roundMoney(totalRevenue / orderCount) : 0 };
  }

  async findTickets(query: FindPosTicketsQueryDto): Promise<PaginatedPosTicketsDoc> {
    const domain = this.buildDomain(query);
    const offset = (query.page - 1) * query.limit;

    // Total, página y totales del filtro completo, en paralelo. Los
    // totales salen de un read_group (Odoo suma del lado del servidor), así
    // no dependen de la página que se esté viendo.
    const [total, orders, totalGroups] = await Promise.all([
      this.odooService.countPosOrders(domain),
      this.odooService.findPosOrders({ domain, limit: query.limit, offset, order: SORT_ORDER[query.sort] }),
      this.odooService.readGroupPosOrders({ domain, fields: ['amount_total'], groupby: ['config_id'] }),
    ]);

    const orderIds = orders.map((order) => order.id);
    const [lines, paymentGroups]: [OdooPosOrderLine[], OdooPosPaymentGroup[]] =
      orderIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.fetchLines(orderIds, 'findTickets (líneas)'),
            this.odooService.readGroupPosPayments({
              domain: [['pos_order_id', 'in', orderIds]],
              fields: ['amount'],
              groupby: ['pos_order_id', 'payment_method_id'],
            }),
          ]);

    const linesByOrder = new Map<number, OdooPosOrderLine[]>();
    for (const line of lines) {
      if (!line.order_id) continue;
      const bucket = linesByOrder.get(line.order_id[0]) ?? [];
      bucket.push(line);
      linesByOrder.set(line.order_id[0], bucket);
    }
    const methodsByOrder = new Map<number, Set<string>>();
    for (const group of paymentGroups) {
      if (!group.pos_order_id || !group.payment_method_id) continue;
      const methods = methodsByOrder.get(group.pos_order_id[0]) ?? new Set<string>();
      methods.add(group.payment_method_id[1]);
      methodsByOrder.set(group.pos_order_id[0], methods);
    }

    return {
      items: orders.map((order) =>
        this.toSummary(order, linesByOrder.get(order.id) ?? [], [...(methodsByOrder.get(order.id) ?? [])]),
      ),
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
      totals: this.toTotals(totalGroups),
    };
  }

  // Detalle de UNA orden: encabezado, productos y pagos. Quién puede verla
  // (el Vendedor solo las de su tienda) lo decide el controller con la
  // tienda que trae la orden.
  async findTicket(id: number): Promise<PosTicketDetailDoc> {
    const [order] = await this.odooService.findPosOrders({ domain: [['id', '=', id]], limit: 1 });
    if (!order) {
      throw new NotFoundException('No se encontró la orden.');
    }

    const [lines, paymentGroups] = await Promise.all([
      this.fetchLines([order.id], 'findTicket (líneas)'),
      this.odooService.readGroupPosPayments({
        domain: [['pos_order_id', '=', order.id]],
        fields: ['amount'],
        groupby: ['payment_method_id'],
      }),
    ]);

    const payments: PosTicketPaymentDoc[] = paymentGroups
      .filter((group) => group.payment_method_id)
      .map((group) => ({
        paymentMethodId: (group.payment_method_id as [number, string])[0],
        paymentMethodName: (group.payment_method_id as [number, string])[1],
        amount: roundMoney(group.amount ?? 0),
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      ...this.toSummary(
        order,
        lines,
        payments.map((payment) => payment.paymentMethodName),
      ),
      lines: lines.sort((a, b) => a.id - b.id).map((line) => this.toLine(line)),
      payments,
    };
  }
}
