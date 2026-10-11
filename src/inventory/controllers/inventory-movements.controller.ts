import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
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

  @Patch('movements/:id/confirm')
  @Roles(Role.SUPER_ADMIN, Role.FINANZAS)
  @ApiOperation({ summary: 'Confirma un movimiento pendiente reportado por un Vendedor.' })
  confirm(@Param('id') id: string, @User('email') resolvedByEmail: string) {
    return this.movementsService.confirm(id, resolvedByEmail);
  }

  @Patch('movements/:id/reject')
  @Roles(Role.SUPER_ADMIN, Role.FINANZAS)
  @ApiOperation({ summary: 'Rechaza un movimiento pendiente reportado por un Vendedor (ej. dato incorrecto).' })
  reject(@Param('id') id: string, @User('email') resolvedByEmail: string) {
    return this.movementsService.reject(id, resolvedByEmail);
  }

  @Patch('movements/:id/receive')
  @ApiOperation({
    summary: 'Marca una ENTRADA (envío planta→tienda) como recibida, con la cantidad real que llegó.',
    description:
      'Exclusivo de movimientos tipo ENTRADA en estado PENDIENTE. Queda en RECIBIDO, pendiente de que Admin o Finanzas lo confirme o rechace.',
  })
  receive(
    @Param('id') id: string,
    @Body() dto: MarkMovementReceivedDto,
    @User() user: AuthenticatedUser,
  ) {
    return this.movementsService.receive(id, dto, user);
  }
}
