import { Controller, ForbiddenException, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import { RequiresModule } from '../../common/decorators/requires-module.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { scopedPosConfigId } from '../../common/utils/scoped-pos-config-id.util.js';
import { assertOwnStoreOrThrow } from '../../common/utils/assert-own-store.util.js';
import { PosTicketsService } from '../services/pos-tickets.service.js';
import { FindPosTicketsQueryDto } from '../dto/find-pos-tickets-query.dto.js';

// Tickets → Órdenes. Los tres roles entran (si Permisos no lo apaga), pero
// el Vendedor solo ve las órdenes de SU tienda: en el listado se fuerza su
// posConfigId (scopedPosConfigId) y en el detalle se rechaza con 403 una
// orden de otra tienda (assertOwnStoreOrThrow).
@ApiTags('sales')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR)
@RequiresModule('dashboard.ordenes')
@Controller('sales/tickets')
export class PosTicketsController {
  constructor(private readonly posTicketsService: PosTicketsService) {}

  @Get()
  @ApiOperation({
    summary: 'Órdenes de caja (tickets) por rango de fecha y tienda, paginado',
    description:
      'Cada orden con fecha y hora local, tienda, cajero, cliente, cantidad de productos, montos y métodos de pago. ' +
      'Excluye canceladas. `totals` resume TODO el filtro (órdenes, venta y ticket promedio), no solo la página.',
  })
  @ApiResponse({ status: 200, description: 'Página de órdenes con sus totales.' })
  @ApiResponse({ status: 400, description: 'Rango de fechas o parámetros inválidos.' })
  @ApiResponse({ status: 403, description: 'Sin acceso a Órdenes o Vendedor sin tienda asignada.' })
  findTickets(@Query() query: FindPosTicketsQueryDto, @User() user: AuthenticatedUser) {
    query.posConfigId = scopedPosConfigId(user, query.posConfigId);
    // Un Vendedor sin tienda asignada no debe caer en "todas las tiendas".
    if (user.role === Role.VENDEDOR && !query.posConfigId) {
      throw new ForbiddenException('Tu usuario no tiene una tienda asignada.');
    }
    return this.posTicketsService.findTickets(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una orden: productos, impuestos, pagos y cambio' })
  @ApiParam({ name: 'id', description: 'id de pos.order en Odoo' })
  @ApiResponse({ status: 200, description: 'Detalle de la orden.' })
  @ApiResponse({ status: 403, description: 'La orden es de otra tienda (Vendedor).' })
  @ApiResponse({ status: 404, description: 'La orden no existe.' })
  async findTicket(@Param('id', ParseIntPipe) id: number, @User() user: AuthenticatedUser) {
    const ticket = await this.posTicketsService.findTicket(id);
    assertOwnStoreOrThrow(user, ticket.store.id);
    return ticket;
  }
}
