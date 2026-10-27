import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import { RequiresModule } from '../../common/decorators/requires-module.decorator.js';
import { assertOwnStoreOrThrow } from '../../common/utils/assert-own-store.util.js';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { InventoryMovementsService } from '../services/inventory-movements.service.js';
import { InventoryAccessService } from '../services/inventory-access.service.js';
import { CreateInventoryMovementDto } from '../dto/create-inventory-movement.dto.js';
import { FindMovementNotificationsQueryDto } from '../dto/find-movement-notifications-query.dto.js';
import { RejectMovementDto } from '../dto/reject-movement.dto.js';

// Segundo tramo de Inventario (ver plan-history): merma, regalías y
// degustaciones. El stock que llega de planta ya no pasa por aquí: va por
// las solicitudes (módulo stock-requests). A diferencia de InventoryController (conteo físico,
// solo Admin/Finanzas), acá SÍ entra Vendedor — pero limitado a su
// propia tienda (assertOwnStoreOrThrow) y sin poder confirmar/rechazar
// lo que él mismo reporta (eso es exclusivo de Admin/Finanzas, ver
// @Roles de /confirm y /reject más abajo).
@ApiTags('inventory')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR)
@RequiresModule('dashboard.inventario-movimientos')
@Controller('inventory')
export class InventoryMovementsController {
  constructor(
    private readonly movementsService: InventoryMovementsService,
    private readonly accessService: InventoryAccessService,
  ) {}

  @Post('stores/:posConfigId/movements')
  @ApiOperation({
    summary: 'Registra una merma, regalía o degustación para un producto de una tienda.',
    description:
      'Si lo registra SUPER_ADMIN o FINANZAS queda confirmado de inmediato. Si lo registra VENDEDOR queda pendiente hasta que Admin/Finanzas lo confirme o rechace.',
  })
  async create(
    @Param('posConfigId', ParseIntPipe) posConfigId: number,
    @Body() dto: CreateInventoryMovementDto,
    @User() user: AuthenticatedUser,
  ) {
    assertOwnStoreOrThrow(user, posConfigId);
    await this.accessService.assertEnabledFor(user, posConfigId);
    return this.movementsService.create(posConfigId, dto, user);
  }

  @Get('stores/:posConfigId/movements')
  @ApiOperation({ summary: 'Historial de movimientos (merma/regalía/degustación) de una tienda, más recientes primero.' })
  async findManyForStore(@Param('posConfigId', ParseIntPipe) posConfigId: number, @User() user: AuthenticatedUser) {
    assertOwnStoreOrThrow(user, posConfigId);
    await this.accessService.assertEnabledFor(user, posConfigId);
    return this.movementsService.findManyForStore(posConfigId);
  }

  @Get('movements/notifications')
  @ApiOperation({
    summary: 'Contador del aviso de Movimientos para el menú.',
    description:
      'Admin/Finanzas: lo pendiente de todas las tiendas. Vendedor: lo suyo ya resuelto desde `sinceMovements`.',
  })
  findNotifications(@Query() query: FindMovementNotificationsQueryDto, @User() user: AuthenticatedUser) {
    return this.movementsService.findNotifications(
      user,
      query.sinceMovements ? new Date(query.sinceMovements) : undefined,
    );
  }

  @Get('movements/inbox')
  @Roles(Role.SUPER_ADMIN, Role.FINANZAS)
  @ApiOperation({
    summary: 'Bandeja de Admin/Finanzas: merma, regalías y degustaciones pendientes de todas las tiendas.',
  })
  findInbox() {
    return this.movementsService.findInbox();
  }

  @Patch('movements/:id/confirm')
  @Roles(Role.SUPER_ADMIN, Role.FINANZAS)
  @ApiOperation({
    summary: 'Confirma una merma, regalía o degustación pendiente.',
  })
  confirm(@Param('id') id: string, @User('email') resolvedByEmail: string) {
    return this.movementsService.confirm(id, resolvedByEmail);
  }

  @Patch('movements/:id/reject')
  @Roles(Role.SUPER_ADMIN, Role.FINANZAS)
  @ApiOperation({
    summary: 'Rechaza una merma, regalía o degustación pendiente, con motivo (lo ve el Vendedor).',
  })
  reject(@Param('id') id: string, @Body() dto: RejectMovementDto, @User('email') resolvedByEmail: string) {
    return this.movementsService.reject(id, dto, resolvedByEmail);
  }
}
