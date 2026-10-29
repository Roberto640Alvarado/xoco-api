import { Body, Controller, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import { RequiresModule } from '../../common/decorators/requires-module.decorator.js';
import { assertOwnStoreOrThrow } from '../../common/utils/assert-own-store.util.js';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { InventoryService } from '../services/inventory.service.js';
import { InventoryLedgerService } from '../services/inventory-ledger.service.js';
import { InventoryAccessService } from '../services/inventory-access.service.js';
import { FindInventoryLedgerQueryDto } from '../dto/find-inventory-ledger-query.dto.js';
import { UpsertInventoryBulkDto } from '../dto/upsert-inventory-bulk.dto.js';

// Inventario por tienda. La captura del conteo físico (PUT) es
// centralizada: solo Admin/Finanzas. El Vendedor puede LEER el stock y el
// Registro de SU tienda (assertOwnStoreOrThrow -> 403 si pide otra), nunca
// escribir. Planta (despacho) puede LEER el stock de CUALQUIER tienda para
// saber qué mandar — nunca el Registro ni capturar conteos.
@ApiTags('inventory')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR)
@RequiresModule('dashboard.inventario')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly ledgerService: InventoryLedgerService,
    private readonly accessService: InventoryAccessService,
  ) {}

  // Las pantallas de Solicitudes y Movimientos eligen el producto de esta
  // lista: basta con tener Conteo y Registro o Movimientos y solicitudes.
  @RequiresModule('dashboard.inventario', 'dashboard.inventario-movimientos')
  @Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR, Role.PLANTA)
  @Get('stores/:posConfigId/items')
  @ApiOperation({
    summary: 'Catálogo completo de Odoo cruzado con el inventario ya capturado para una tienda.',
    description:
      'Trae TODO product.product activo de Odoo (solo lectura) y lo cruza con lo guardado en nuestra base para esta tienda. quantity=null significa que ese producto todavía no se ha contado. estimatedQuantity es el conteo físico menos ventas y mermas/regalías/degustaciones, más entradas confirmadas desde ese conteo.',
  })
  async findItemsForStore(@Param('posConfigId', ParseIntPipe) posConfigId: number, @User() user: AuthenticatedUser) {
    assertOwnStoreOrThrow(user, posConfigId);
    await this.accessService.assertEnabledFor(user, posConfigId);
    return this.inventoryService.findItemsForStore(posConfigId);
  }

  @Put('stores/:posConfigId/items')
  @Roles(Role.SUPER_ADMIN, Role.FINANZAS)
  @ApiOperation({
    summary: 'Guarda (crea o actualiza) la cantidad física de uno o varios productos para una tienda.',
  })
  upsertBulk(
    @Param('posConfigId', ParseIntPipe) posConfigId: number,
    @Body() dto: UpsertInventoryBulkDto,
    @User('email') updatedByEmail: string,
  ) {
    return this.inventoryService.upsertBulk(posConfigId, dto, updatedByEmail);
  }

  @Get('stores/:posConfigId/ledger')
  @ApiOperation({
    summary: 'Registro de entradas y salidas de una tienda, con fecha y hora, más recientes primero.',
    description:
      'Une ventas de Odoo (una línea por producto vendido), merma/regalía/degustación/entrada y conteos físicos. Filtra por rango de días (hora local de la tienda), producto y tipo.',
  })
  async findLedger(
    @Param('posConfigId', ParseIntPipe) posConfigId: number,
    @Query() query: FindInventoryLedgerQueryDto,
    @User() user: AuthenticatedUser,
  ) {
    assertOwnStoreOrThrow(user, posConfigId);
    await this.accessService.assertEnabledFor(user, posConfigId);
    return this.ledgerService.findLedger(posConfigId, query);
  }
}
