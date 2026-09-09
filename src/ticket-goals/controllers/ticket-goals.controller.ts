import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { TicketGoalsService } from '../services/ticket-goals.service.js';
import { UpsertTicketGoalsBulkDto } from '../dto/upsert-ticket-goals-bulk.dto.js';
import { FindTicketGoalsSummaryQueryDto } from '../dto/find-ticket-goals-summary-query.dto.js';

// SUPER_ADMIN y FINANZAS pueden ambos ver/editar el % de crecimiento del
// ticket promedio — mismo criterio de autorización que Goals/SalesGoals.
@ApiTags('ticket-goals')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS)
@Controller('ticket-goals')
export class TicketGoalsController {
  constructor(private readonly ticketGoalsService: TicketGoalsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Meta de ticket promedio (encadenada mes a mes), real y diferencia por tienda, para un mes dado.',
    description:
      'Trae venta y órdenes reales de Odoo (vía el mismo agregado que usa Ventas/Visitas), calcula el ticket promedio real (venta/órdenes) y la meta encadenada sobre la meta del mes anterior * (1 + % guardado). En el mes en curso, "real" es hasta ayer.',
  })
  getSummary(@Query() query: FindTicketGoalsSummaryQueryDto) {
    return this.ticketGoalsService.getSummary(query);
  }

  @Put()
  @ApiOperation({
    summary: 'Registra o actualiza el % de crecimiento del ticket promedio de una o varias tiendas para un mes (lote).',
  })
  upsertBulk(@Body() dto: UpsertTicketGoalsBulkDto) {
    return this.ticketGoalsService.upsertBulk(dto);
  }
}
