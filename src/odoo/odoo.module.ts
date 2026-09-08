import { Module } from '@nestjs/common';
import { OdooConfigRepository } from './repositories/odoo-config.repository.js';
import { OdooRepository } from './repositories/odoo.repository.js';
import { OdooService } from './services/odoo.service.js';
import { OdooConfigService } from './services/odoo-config.service.js';
import { OdooConfigController } from './controllers/odoo-config.controller.js';

@Module({
  controllers: [OdooConfigController],
  providers: [OdooConfigRepository, OdooRepository, OdooService, OdooConfigService],
  exports: [OdooService],
})
export class OdooModule {}
