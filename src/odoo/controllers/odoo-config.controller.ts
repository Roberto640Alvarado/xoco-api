import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import { OdooConfigService } from '../services/odoo-config.service.js';
import { RotateOdooConfigDto } from '../dto/rotate-odoo-config.dto.js';
import { OdooConfigHistoryItemDoc, OdooConfigResponseDoc } from '../doc/odoo-config-response.doc.js';

// Exclusivo de SUPER_ADMIN (ver CLAUDE.md, "Autorización") — FINANZAS no
// administra la integración con Odoo, solo consume sus datos vía /sales.
@ApiTags('odoo-config')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('odoo/config')
export class OdooConfigController {
  constructor(private readonly odooConfigService: OdooConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Estado actual del API key de Odoo (nunca expone el key completo).' })
  @ApiResponse({ status: 200, type: OdooConfigResponseDoc })
  getCurrent() {
    return this.odooConfigService.getCurrent();
  }

  @Get('history')
  @ApiOperation({ summary: 'Historial de API keys de Odoo (la activa y las reemplazadas), enmascaradas.' })
  @ApiResponse({ status: 200, type: [OdooConfigHistoryItemDoc] })
  getHistory() {
    return this.odooConfigService.getHistory();
  }

  @Put()
  @ApiOperation({ summary: 'Registra o rota el API key de Odoo y su duración. La anterior queda en el historial.' })
  @ApiResponse({ status: 200, type: OdooConfigResponseDoc })
  rotate(@Body() dto: RotateOdooConfigDto, @User('email') email: string) {
    return this.odooConfigService.rotate(dto, email ?? null);
  }
}
