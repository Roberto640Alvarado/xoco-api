import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import { RequiresModule } from '../../common/decorators/requires-module.decorator.js';
import { InventoryService } from '../services/inventory.service.js';
import { UpsertInventoryBulkDto } from '../dto/upsert-inventory-bulk.dto.js';

// Inventario por tienda — a diferencia de Goals/Sales, Vendedor NO tiene
// acceso en este primer tramo: la captura del inventario inicial es
// centralizada por Finanzas (ver plan-history). Vendedor podrá entrar en
// un tramo futuro (recepción/confirmación de envíos).
@ApiTags('inventory')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS)
@RequiresModule('dashboard.inventario')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stores/:posConfigId/items')
  @ApiOperation({
    summary: 'Catálogo completo de Odoo cruzado con el inventario ya capturado para una tienda.',
    description:
      'Trae TODO product.product activo de Odoo (solo lectura) y lo cruza con lo guardado en nuestra base para esta tienda. quantity=null significa que ese producto todavía no se ha contado.',
  })
  findItemsForStore(@Param('posConfigId', ParseIntPipe) posConfigId: number) {
    return this.inventoryService.findItemsForStore(posConfigId);
  }

  @Put('stores/:posConfigId/items')
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
}
