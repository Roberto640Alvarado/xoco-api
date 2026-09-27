import { Module } from '@nestjs/common';
import { OdooModule } from '../odoo/odoo.module.js';
import { InventoryController } from './controllers/inventory.controller.js';
import { InventoryService } from './services/inventory.service.js';
import { InventoryRepository } from './repositories/inventory.repository.js';

@Module({
  imports: [OdooModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepository],
})
export class InventoryModule {}
