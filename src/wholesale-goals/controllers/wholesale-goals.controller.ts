import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { WHOLESALE_CLIENTS } from '../../sales/constants/wholesale-clients.const.js';
import { WholesaleGoalsService } from '../services/wholesale-goals.service.js';
import { UpsertWholesaleGoalsBulkDto } from '../dto/upsert-wholesale-goals-bulk.dto.js';
import { FindWholesaleGoalsSummaryQueryDto } from '../dto/find-wholesale-goals-summary-query.dto.js';

// SUPER_ADMIN y FINANZAS pueden ambos ver/editar el % de crecimiento de
// mayoreo — mismo criterio de autorización que Sales/SalesGoals (ver
// CLAUDE.md, "Autorización").
@ApiTags('wholesale-goals')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS)
@Controller('wholesale-goals')
export class WholesaleGoalsController {
  constructor(private readonly wholesaleGoalsService: WholesaleGoalsService) {}

  @Get('clients')
  @ApiOperation({
    summary: 'Clientes de mayoreo trackeados (Selectos, Operadora del Sur) — para el filtro/modal del panel',
    description: 'Lista fija y curada, no todos los partners de Odoo — ver WHOLESALE_CLIENTS.',
  })
  findClients() {
    return WHOLESALE_CLIENTS.map((client) => ({ key: client.key, label: client.label }));
  }

  @Get('summary')
  @ApiOperation({
    summary:
      'Meta de venta ($, encadenada mes a mes), avance real y valor pendiente por cliente de mayoreo, para un mes dado.',
    description:
      'Trae el monto real de Odoo (vía /sales/by-wholesale-client) y calcula "Meta" encadenada sobre la meta del ' +
      'mes anterior * (1 + % guardado). En el mes en curso, "real" es hasta ayer.',
  })
  getSummary(@Query() query: FindWholesaleGoalsSummaryQueryDto) {
    return this.wholesaleGoalsService.getSummary(query);
  }

  @Put()
  @ApiOperation({
    summary: 'Registra o actualiza el % de crecimiento de venta ($) de uno o varios clientes de mayoreo para un mes (lote).',
  })
  upsertBulk(@Body() dto: UpsertWholesaleGoalsBulkDto) {
    return this.wholesaleGoalsService.upsertBulk(dto);
  }
}
