import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import { RequiresModule } from '../../common/decorators/requires-module.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
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

  @Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR)
  @RequiresModule('dashboard.trafico-tiendas', 'dashboard.trafico-diario')
  @Get('summary')
  @ApiOperation({
    summary: 'Meta (derivada del mes anterior), avance real y proyección de cierre por tienda, para un mes dado.',
    description:
      'Trae las visitas reales del mes en curso y del mes anterior desde Odoo (cantidad de FACTURAS por tienda) y calcula "Meta del mes" = real del mes anterior * (1 + % guardado). En el mes en curso, "real" es hasta ayer y se agrega una proyección de cierre por ritmo diario.',
  })
  async getSummary(@Query() query: FindGoalsSummaryQueryDto, @User() user: AuthenticatedUser) {
    const items = await this.goalsService.getSummary(query);
    if (user.role === Role.VENDEDOR) {
      return items.filter((item) => item.posConfigId === user.posConfigId);
    }
    return items;
  }

  @RequiresModule('dashboard.trafico-tiendas')
  @Put()
  @ApiOperation({
    summary: 'Registra o actualiza el % de crecimiento de una o varias tiendas para un mes (lote).',
  })
  upsertBulk(@Body() dto: UpsertGoalsBulkDto, @User('email') updatedByEmail: string) {
    return this.goalsService.upsertBulk(dto, updatedByEmail);
  }
}
