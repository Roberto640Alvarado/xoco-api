import { Module } from '@nestjs/common';
import { OdooModule } from '../odoo/odoo.module.js';
import { InventoryController } from './controllers/inventory.controller.js';
import { InventoryMovementsController } from './controllers/inventory-movements.controller.js';
import { InventoryAccessController } from './controllers/inventory-access.controller.js';
import { InventoryAccessService } from './services/inventory-access.service.js';
import { InventoryAccessRepository } from './repositories/inventory-access.repository.js';
import { InventoryService } from './services/inventory.service.js';
import { InventoryLedgerService } from './services/inventory-ledger.service.js';
import { InventoryMovementsService } from './services/inventory-movements.service.js';
import { InventoryRepository } from './repositories/inventory.repository.js';
import { InventoryMovementsRepository } from './repositories/inventory-movements.repository.js';

@Module({
  imports: [OdooModule],
  controllers: [InventoryController, InventoryMovementsController, InventoryAccessController],
  providers: [
    InventoryService,
    InventoryLedgerService,
    InventoryMovementsService,
    InventoryAccessService,
    InventoryRepository,
    InventoryMovementsRepository,
    InventoryAccessRepository,
  ],
  // El módulo de solicitudes de stock suma al inventario de la tienda al
  // recibir un envío, y valida que la tienda tenga Inventario habilitado.
  exports: [InventoryMovementsService, InventoryAccessService],
})
export class InventoryModule {}
