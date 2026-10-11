import { Module } from '@nestjs/common';
import { OdooModule } from '../odoo/odoo.module.js';
import { InventoryController } from './controllers/inventory.controller.js';
import { InventoryMovementsController } from './controllers/inventory-movements.controller.js';
import { InventoryService } from './services/inventory.service.js';
import { InventoryMovementsService } from './services/inventory-movements.service.js';
import { InventoryRepository } from './repositories/inventory.repository.js';
import { InventoryMovementsRepository } from './repositories/inventory-movements.repository.js';

@Module({
  imports: [OdooModule],
  controllers: [InventoryController, InventoryMovementsController],
  providers: [InventoryService, InventoryMovementsService, InventoryRepository, InventoryMovementsRepository],
})
export class InventoryModule {}
