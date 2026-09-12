import { Injectable } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { OdooAccountMoveGroup } from '../../odoo/types/odoo-entities.types.js';
import { buildCustomerInvoiceDomain } from '../builders/customer-invoice-domain.builder.js';
import { FindCustomerSearchQueryDto } from '../dto/find-customer-search-query.dto.js';
import { CustomerSearchResultDoc } from '../doc/sales.doc.js';
import { roundMoney } from '../../common/utils/money.util.js';

const AMOUNT_UNTAXED_FIELD = 'amount_untaxed_signed';
const AMOUNT_TOTAL_FIELD = 'amount_total_signed';

function toDoc(group: OdooAccountMoveGroup): CustomerSearchResultDoc | null {
  const partner = group.partner_id;
  if (!partner) return null; // no debería pasar: partner_id.name ilike ya exige que exista
  const commercial = group.commercial_partner_id ? group.commercial_partner_id : partner;
  const amountUntaxed = roundMoney(group[AMOUNT_UNTAXED_FIELD] ?? 0);
  const amountTotal = roundMoney(group[AMOUNT_TOTAL_FIELD] ?? 0);

  return {
    partnerId: partner[0],
    partnerName: partner[1],
    commercialPartnerId: commercial[0],
    commercialPartnerName: commercial[1],
    visits: group.__count,
    amountUntaxed,
    amountTax: roundMoney(amountTotal - amountUntaxed),
    amountTotal,
  };
}

// Buscador general de clientes: cualquier partner de Odoo con al menos
// una factura en el rango pedido cuyo nombre matchea `q` — no está
// limitado a los clientes de mayoreo fijos de WHOLESALE_CLIENTS (ver
// WholesaleClientTotalsService), es un buscador abierto a cualquier
// comprador (mayoreo, minorista, persona natural — lo que sea que tenga
// facturas).
//
// Un solo `read_group` de account.move con `partner_id.name` en el
// domain (Odoo soporta filtrar por un campo del related vía notación con
// punto) — no hace falta un search_read aparte contra res.partner.
@Injectable()
export class CustomerSearchService {
  constructor(private readonly odooService: OdooService) {}

  async search(query: FindCustomerSearchQueryDto): Promise<CustomerSearchResultDoc[]> {
    const dateTo = query.dateTo ?? query.dateFrom;

    const groups = await this.odooService.readGroupAccountMoves({
      domain: [...buildCustomerInvoiceDomain(query.dateFrom, dateTo), ['partner_id.name', 'ilike', query.q]],
      fields: [AMOUNT_UNTAXED_FIELD, AMOUNT_TOTAL_FIELD],
      groupby: ['partner_id', 'commercial_partner_id'],
    });

    return groups
      .map((group) => toDoc(group))
      .filter((doc): doc is CustomerSearchResultDoc => doc !== null)
      .sort((a, b) => b.amountTotal - a.amountTotal)
      .slice(0, query.limit);
  }
}
