import { Module } from '@nestjs/common';
import { OdooModule } from '../odoo/odoo.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { StockRequestsModule } from '../stock-requests/stock-requests.module.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import { NotificationsService } from './services/notifications.service.js';

// Campana de notificaciones del panel (solicitudes y movimientos por rol).
@Module({
  imports: [OdooModule, InventoryModule, StockRequestsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
