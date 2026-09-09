import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { SalesGoalsService } from '../services/sales-goals.service.js';
import { UpsertSalesGoalsBulkDto } from '../dto/upsert-sales-goals-bulk.dto.js';
import { FindSalesGoalsSummaryQueryDto } from '../dto/find-sales-goals-summary-query.dto.js';

// SUPER_ADMIN y FINANZAS pueden ambos ver/editar el % de crecimiento de
// venta — mismo criterio de autorización que Goals/Sales (ver CLAUDE.md,
// "Autorización").
@ApiTags('sales-goals')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS)
@Controller('sales-goals')
export class SalesGoalsController {
  constructor(private readonly salesGoalsService: SalesGoalsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Meta de venta ($, encadenada mes a mes), avance real y valor pendiente por tienda, para un mes dado.',
    description:
      'Trae el monto real de Odoo (vía el mismo agregado que usa Ventas/Visitas) y calcula "Meta" encadenada sobre la meta del mes anterior * (1 + % guardado). En el mes en curso, "real" es hasta ayer.',
  })
  getSummary(@Query() query: FindSalesGoalsSummaryQueryDto) {
    return this.salesGoalsService.getSummary(query);
  }

  @Put()
  @ApiOperation({
    summary: 'Registra o actualiza el % de crecimiento de venta ($) de una o varias tiendas para un mes (lote).',
  })
  upsertBulk(@Body() dto: UpsertSalesGoalsBulkDto) {
    return this.salesGoalsService.upsertBulk(dto);
  }
}
