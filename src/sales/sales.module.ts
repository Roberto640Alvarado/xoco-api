import { Module } from '@nestjs/common';
import { OdooModule } from '../odoo/odoo.module.js';
import { SalesController } from './controllers/sales.controller.js';
import { SalesService } from './services/sales.service.js';

@Module({
  imports: [OdooModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
