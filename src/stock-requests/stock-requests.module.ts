import { Module } from '@nestjs/common';
import { OdooModule } from '../odoo/odoo.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { StockRequestsController } from './controllers/stock-requests.controller.js';
import { StockRequestsService } from './services/stock-requests.service.js';
import { StockRequestsRepository } from './repositories/stock-requests.repository.js';

@Module({
  imports: [OdooModule, InventoryModule],
  controllers: [StockRequestsController],
  providers: [StockRequestsService, StockRequestsRepository],
})
export class StockRequestsModule {}
