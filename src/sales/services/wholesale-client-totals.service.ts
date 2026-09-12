import { Injectable } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { OdooAccountMoveGroup } from '../../odoo/types/odoo-entities.types.js';
import { buildCustomerInvoiceDomain } from '../builders/customer-invoice-domain.builder.js';
import { FindInvoiceRangeQueryDto } from '../dto/find-invoice-range-query.dto.js';
import { WHOLESALE_CLIENTS } from '../constants/wholesale-clients.const.js';
import {
  InvoiceTotalsDoc,
  WholesaleBuyerTotalsDoc,
  WholesaleClientTotalsDoc,
  WholesaleClientTotalsReportDoc,
} from '../doc/sales.doc.js';
import { roundMoney } from '../../common/utils/money.util.js';

const AMOUNT_UNTAXED_FIELD = 'amount_untaxed_signed';
const AMOUNT_TOTAL_FIELD = 'amount_total_signed';

function toBuyerDoc(group: OdooAccountMoveGroup): WholesaleBuyerTotalsDoc {
  const partner = group.partner_id;
  const amountUntaxed = roundMoney(group[AMOUNT_UNTAXED_FIELD] ?? 0);
  const amountTotal = roundMoney(group[AMOUNT_TOTAL_FIELD] ?? 0);
  return {
    // `commercial_partner_id` siempre viene en el domain (ver findTotalsByClient),
    // así que `partner_id` siempre viene resuelto en cada fila del read_group.
    partnerId: partner ? partner[0] : -1,
    partnerName: partner ? partner[1] : 'Desconocido',
    visits: group.__count,
    amountUntaxed,
    amountTax: roundMoney(amountTotal - amountUntaxed),
    amountTotal,
  };
}

function emptyTotals(): InvoiceTotalsDoc {
  return { visits: 0, amountUntaxed: 0, amountTax: 0, amountTotal: 0 };
}

function addTotals(a: InvoiceTotalsDoc, b: InvoiceTotalsDoc): InvoiceTotalsDoc {
  return {
    visits: a.visits + b.visits,
    amountUntaxed: roundMoney(a.amountUntaxed + b.amountUntaxed),
    amountTax: roundMoney(a.amountTax + b.amountTax),
    amountTotal: roundMoney(a.amountTotal + b.amountTotal),
  };
}

// Visitas y venta de los clientes de mayoreo fijos que el negocio pidió
// trackear (WHOLESALE_CLIENTS — Selectos, Operadora del Sur), con
// desglose por comprador puntual (partner_id — ej. una sucursal de
// Selectos).
//
// Mismo domain de facturas que el resto de /sales basado en cuentas
// (buildCustomerInvoiceDomain — incluye notas de crédito, no filtra
// estado), pero MUCHO más simple que StoreInvoiceTotalsService: acá no
// hace falta resolver diario/vendedor, porque `commercial_partner_id` YA
// identifica al cliente directamente en la factura — es el mismo campo
// que arma el propio Odoo.
@Injectable()
export class WholesaleClientTotalsService {
  constructor(private readonly odooService: OdooService) {}

  async findTotalsByClient(query: FindInvoiceRangeQueryDto): Promise<WholesaleClientTotalsReportDoc> {
    const dateFrom = query.dateFrom;
    const dateTo = query.dateTo ?? query.dateFrom;

    const commercialPartnerIds = WHOLESALE_CLIENTS.map((client) => client.commercialPartnerId);
    const groups = await this.odooService.readGroupAccountMoves({
      domain: [
        ...buildCustomerInvoiceDomain(dateFrom, dateTo),
        ['commercial_partner_id', 'in', commercialPartnerIds],
      ],
      fields: [AMOUNT_UNTAXED_FIELD, AMOUNT_TOTAL_FIELD],
      groupby: ['commercial_partner_id', 'partner_id'],
    });

    const buyersByCommercialId = new Map<number, WholesaleBuyerTotalsDoc[]>();
    for (const group of groups) {
      const commercialId = group.commercial_partner_id ? group.commercial_partner_id[0] : null;
      if (commercialId == null) continue; // no debería pasar: el domain ya filtró por estos ids
      const buyers = buyersByCommercialId.get(commercialId) ?? [];
      buyers.push(toBuyerDoc(group));
      buyersByCommercialId.set(commercialId, buyers);
    }

    // Todos los clientes configurados aparecen, en cero si no facturaron
    // en el rango — igual que el resto de los reportes del módulo.
    const items: WholesaleClientTotalsDoc[] = WHOLESALE_CLIENTS.map((client) => {
      const buyers = (buyersByCommercialId.get(client.commercialPartnerId) ?? []).sort(
        (a, b) => b.amountTotal - a.amountTotal,
      );
      const totals = buyers.reduce<InvoiceTotalsDoc>((accumulated, buyer) => addTotals(accumulated, buyer), emptyTotals());
      return {
        clientKey: client.key,
        clientLabel: client.label,
        buyers,
        ...totals,
      };
    });

    const totals = items.reduce<InvoiceTotalsDoc>((accumulated, item) => addTotals(accumulated, item), emptyTotals());

    return { items, totals };
  }
}
