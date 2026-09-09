import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { GoalsService } from '../services/goals.service.js';
import { UpsertGoalDto } from '../dto/upsert-goal.dto.js';
import { FindGoalsSummaryQueryDto } from '../dto/find-goals-summary-query.dto.js';

// SUPER_ADMIN y FINANZAS pueden ambos ver/editar metas — mismo criterio de
// autorización que Sales (ver CLAUDE.md, "Autorización").
@ApiTags('goals')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Meta, avance real y proyección de cierre por tienda, para un mes dado.',
    description:
      'Trae las órdenes reales de ese mes desde Odoo (vía el mismo agregado que usa Visitas) y las combina con la meta guardada. En el mes en curso, "real" es hasta ayer y se agrega una proyección de cierre por ritmo diario.',
  })
  getSummary(@Query() query: FindGoalsSummaryQueryDto) {
    return this.goalsService.getSummary(query);
  }

  @Put()
  @ApiOperation({ summary: 'Registra o actualiza la meta de órdenes de una tienda para un mes.' })
  upsert(@Body() dto: UpsertGoalDto) {
    return this.goalsService.upsert(dto);
  }
}
