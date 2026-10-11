import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import { RequiresModule } from '../../common/decorators/requires-module.decorator.js';
import { assertOwnStoreOrThrow } from '../../common/utils/assert-own-store.util.js';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { InventoryMovementsService } from '../services/inventory-movements.service.js';
import { CreateInventoryMovementDto } from '../dto/create-inventory-movement.dto.js';
import { MarkMovementReceivedDto } from '../dto/mark-movement-received.dto.js';
import { FindMovementNotificationsQueryDto } from '../dto/find-movement-notifications-query.dto.js';
import { FindMovementsInboxQueryDto } from '../dto/find-movements-inbox-query.dto.js';
import { RejectMovementDto } from '../dto/reject-movement.dto.js';

// Segundo tramo de Inventario (ver plan-history): merma, regalías y
// degustaciones. A diferencia de InventoryController (conteo físico,
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
  constructor(private readonly movementsService: InventoryMovementsService) {}

  @Post('stores/:posConfigId/movements')
  @ApiOperation({
    summary: 'Registra una merma, regalía o degustación para un producto de una tienda.',
    description:
      'Si lo registra SUPER_ADMIN o FINANZAS queda confirmado de inmediato. Si lo registra VENDEDOR queda pendiente hasta que Admin/Finanzas lo confirme o rechace.',
  })
  create(
    @Param('posConfigId', ParseIntPipe) posConfigId: number,
    @Body() dto: CreateInventoryMovementDto,
    @User() user: AuthenticatedUser,
  ) {
    assertOwnStoreOrThrow(user, posConfigId);
    return this.movementsService.create(posConfigId, dto, user);
  }

  @Get('stores/:posConfigId/movements')
  @ApiOperation({ summary: 'Historial de movimientos (merma/regalía/degustación) de una tienda, más recientes primero.' })
  findManyForStore(@Param('posConfigId', ParseIntPipe) posConfigId: number, @User() user: AuthenticatedUser) {
    assertOwnStoreOrThrow(user, posConfigId);
    return this.movementsService.findManyForStore(posConfigId);
  }

  @Get('movements/notifications')
  @ApiOperation({
    summary: 'Contadores de avisos para el menú: Movimientos y Solicitudes.',
    description:
      'Admin/Finanzas: lo pendiente de todas las tiendas. Vendedor: envíos en camino por recibir en su tienda y lo suyo ya resuelto desde `sinceMovements`/`sinceRequests`.',
  })
  findNotifications(@Query() query: FindMovementNotificationsQueryDto, @User() user: AuthenticatedUser) {
    return this.movementsService.findNotifications(
      user,
      query.sinceMovements ? new Date(query.sinceMovements) : undefined,
      query.sinceRequests ? new Date(query.sinceRequests) : undefined,
    );
  }

  @Get('movements/inbox')
  @Roles(Role.SUPER_ADMIN, Role.FINANZAS)
  @ApiOperation({
    summary: 'Bandeja de Admin/Finanzas: movimientos abiertos de todas las tiendas.',
    description:
      'kind=requests: solicitudes de stock (ENTRADA) PENDIENTE/EN_CAMINO/RECIBIDO. kind=movements: merma/regalía/degustación PENDIENTES.',
  })
  findInbox(@Query() query: FindMovementsInboxQueryDto) {
    return this.movementsService.findInbox(query.kind);
  }

  @Patch('movements/:id/accept')
  @Roles(Role.SUPER_ADMIN, Role.FINANZAS)
  @ApiOperation({
    summary: 'Acepta una solicitud de stock: el envío va en camino.',
    description: 'Exclusivo de ENTRADA en PENDIENTE. Pasa a EN_CAMINO; todavía no suma al stock.',
  })
  accept(@Param('id') id: string, @User('email') acceptedByEmail: string) {
    return this.movementsService.accept(id, acceptedByEmail);
  }

  @Patch('movements/:id/confirm')
  @Roles(Role.SUPER_ADMIN, Role.FINANZAS)
  @ApiOperation({
    summary: 'Confirma un movimiento.',
    description:
      'Merma/regalía/degustación: desde PENDIENTE. Entrada: solo desde RECIBIDO — recién ahí se suma al stock.',
  })
  confirm(@Param('id') id: string, @User('email') resolvedByEmail: string) {
    return this.movementsService.confirm(id, resolvedByEmail);
  }

  @Patch('movements/:id/reject')
  @Roles(Role.SUPER_ADMIN, Role.FINANZAS)
  @ApiOperation({
    summary: 'Rechaza un movimiento abierto, con motivo (lo ve el Vendedor).',
  })
  reject(@Param('id') id: string, @Body() dto: RejectMovementDto, @User('email') resolvedByEmail: string) {
    return this.movementsService.reject(id, dto, resolvedByEmail);
  }

  @Patch('movements/:id/receive')
  @ApiOperation({
    summary: 'Marca una ENTRADA (envío planta→tienda) como recibida, con la cantidad real que llegó.',
    description:
      'Exclusivo de movimientos tipo ENTRADA en estado EN_CAMINO (ya aceptados). Queda en RECIBIDO, pendiente de que Admin o Finanzas lo confirme o rechace.',
  })
  receive(
    @Param('id') id: string,
    @Body() dto: MarkMovementReceivedDto,
    @User() user: AuthenticatedUser,
  ) {
    return this.movementsService.receive(id, dto, user);
  }
}
