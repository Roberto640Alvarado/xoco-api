import { Module } from '@nestjs/common';
import { OdooModule } from '../odoo/odoo.module.js';
import { SalesController } from './controllers/sales.controller.js';
import { PosTicketsController } from './controllers/pos-tickets.controller.js';
import { PosTicketsService } from './services/pos-tickets.service.js';
import { SalesService } from './services/sales.service.js';
import { SalespersonSalesService } from './services/salesperson-sales.service.js';
import { StoreInvoiceTotalsService } from './services/store-invoice-totals.service.js';
import { WholesaleClientTotalsService } from './services/wholesale-client-totals.service.js';
import { CustomerSearchService } from './services/customer-search.service.js';

@Module({
  imports: [OdooModule],
  controllers: [SalesController, PosTicketsController],
  providers: [
    SalesService,
    SalespersonSalesService,
    StoreInvoiceTotalsService,
    WholesaleClientTotalsService,
    CustomerSearchService,
    PosTicketsService,
  ],
  exports: [
    SalesService,
    SalespersonSalesService,
    StoreInvoiceTotalsService,
    WholesaleClientTotalsService,
    CustomerSearchService,
  ],
})
export class SalesModule {}
