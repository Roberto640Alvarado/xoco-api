import { Injectable } from '@nestjs/common';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { OdooAccountMoveGroup } from '../../odoo/types/odoo-entities.types.js';
import {
  buildCustomerInvoiceDomain,
  SALESPERSON_FIELD,
} from '../builders/customer-invoice-domain.builder.js';
import { FindInvoiceRangeQueryDto } from '../dto/find-invoice-range-query.dto.js';
import {
  InvoiceTotalsDoc,
  SalespersonSalesDoc,
  SalespersonSalesReportDoc,
} from '../doc/sales.doc.js';
import { roundMoney } from '../../common/utils/money.util.js';

// Campos monetarios de account.move que se piden agregados. Son las
// variantes `_signed`, las mismas que muestra la lista de facturas de
// Odoo: en una nota de crédito vienen en negativo, así que la suma del
// grupo queda NETA de devoluciones.
const AMOUNT_UNTAXED_FIELD = 'amount_untaxed_signed';
const AMOUNT_TOTAL_FIELD = 'amount_total_signed';

const WITHOUT_SALESPERSON_NAME = 'Sin vendedor';

// "Visitas" y venta por vendedor, contando FACTURAS de cliente
// (account.move) en vez de órdenes de POS.
//
// Es el método que usa el negocio: en el módulo de Contabilidad de Odoo
// abren la lista de facturas del período y la agrupan por vendedor; el
// número de facturas de cada grupo es la cantidad de visitas, y a la par
// quedan la venta sin impuesto y la venta con impuesto.
//
// Cuenta lo mismo que StoreInvoiceTotalsService (comparten el domain), pero
// agrupado por vendedor en vez de por tienda: así se ve también el canal
// de MAYOREO, que factura sin pasar por caja y por eso no existe en
// `pos.order` ni pertenece a ninguna tienda.
//
// Vive en su propio service (y no dentro de SalesService) porque es otra
// fuente de datos de Odoo — ver CLAUDE.md, "Convenciones".
@Injectable()
export class SalespersonSalesService {
  constructor(private readonly odooService: OdooService) {}

  private toDoc(group: OdooAccountMoveGroup): SalespersonSalesDoc {
    const salesperson = group[SALESPERSON_FIELD];
    const amountUntaxed = roundMoney(group[AMOUNT_UNTAXED_FIELD] ?? 0);
    const amountTotal = roundMoney(group[AMOUNT_TOTAL_FIELD] ?? 0);

    return {
      salespersonId: salesperson ? salesperson[0] : null,
      salespersonName: salesperson ? salesperson[1] : WITHOUT_SALESPERSON_NAME,
      visits: group.__count,
      amountUntaxed,
      amountTax: roundMoney(amountTotal - amountUntaxed),
      amountTotal,
    };
  }

  private sumTotals(items: SalespersonSalesDoc[]): InvoiceTotalsDoc {
    const totals = items.reduce<InvoiceTotalsDoc>(
      (accumulated, item) => ({
        visits: accumulated.visits + item.visits,
        amountUntaxed: accumulated.amountUntaxed + item.amountUntaxed,
        amountTax: accumulated.amountTax + item.amountTax,
        amountTotal: accumulated.amountTotal + item.amountTotal,
      }),
      { visits: 0, amountUntaxed: 0, amountTax: 0, amountTotal: 0 },
    );

    return {
      ...totals,
      amountUntaxed: roundMoney(totals.amountUntaxed),
      amountTax: roundMoney(totals.amountTax),
      amountTotal: roundMoney(totals.amountTotal),
    };
  }

  // Más visitas primero (es el número que mira el negocio); a igual
  // cantidad, por nombre, para que el orden no baile entre llamadas.
  private toSortedDocs(groups: OdooAccountMoveGroup[]): SalespersonSalesDoc[] {
    return groups
      .map((group) => this.toDoc(group))
      .sort(
        (a, b) =>
          b.visits - a.visits || a.salespersonName.localeCompare(b.salespersonName),
      );
  }

  async findBySalesperson(query: FindInvoiceRangeQueryDto): Promise<SalespersonSalesReportDoc> {
    const groups = await this.odooService.readGroupAccountMoves({
      domain: buildCustomerInvoiceDomain(query.dateFrom, query.dateTo ?? query.dateFrom),
      fields: [AMOUNT_UNTAXED_FIELD, AMOUNT_TOTAL_FIELD],
      groupby: [SALESPERSON_FIELD],
    });

    const items = this.toSortedDocs(groups);
    return { items, totals: this.sumTotals(items) };
  }
}
