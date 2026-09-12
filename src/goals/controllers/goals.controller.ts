import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { GoalsService } from '../services/goals.service.js';
import { UpsertGoalsBulkDto } from '../dto/upsert-goals-bulk.dto.js';
import { FindGoalsSummaryQueryDto } from '../dto/find-goals-summary-query.dto.js';

// SUPER_ADMIN y FINANZAS pueden ambos ver/editar el % de crecimiento —
// mismo criterio de autorización que Sales (ver CLAUDE.md, "Autorización").
@ApiTags('goals')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Meta (derivada del mes anterior), avance real y proyección de cierre por tienda, para un mes dado.',
    description:
      'Trae las visitas reales del mes en curso y del mes anterior desde Odoo (cantidad de FACTURAS por tienda) y calcula "Meta del mes" = real del mes anterior * (1 + % guardado). En el mes en curso, "real" es hasta ayer y se agrega una proyección de cierre por ritmo diario.',
  })
  getSummary(@Query() query: FindGoalsSummaryQueryDto) {
    return this.goalsService.getSummary(query);
  }

  @Put()
  @ApiOperation({
    summary: 'Registra o actualiza el % de crecimiento de una o varias tiendas para un mes (lote).',
  })
  upsertBulk(@Body() dto: UpsertGoalsBulkDto) {
    return this.goalsService.upsertBulk(dto);
  }
}
