import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import { InventoryAccessService } from '../services/inventory-access.service.js';
import { SetInventoryAccessDto } from '../dto/set-inventory-access.dto.js';

// Habilitación de Inventario por tienda. Cualquier rol autenticado puede
// LEER qué tiendas están habilitadas (el menú del Vendedor lo necesita);
// solo SUPER_ADMIN lo cambia. No lleva @RequiresModule a propósito: no es
// una pantalla del dashboard sino la bandera que decide si se muestran.
@ApiTags('inventory')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR)
@Controller('inventory/access')
export class InventoryAccessController {
  constructor(private readonly accessService: InventoryAccessService) {}

  @Get()
  @ApiOperation({ summary: 'Tiendas con el módulo de Inventario habilitado para sus Vendedores.' })
  findAccess() {
    return this.accessService.findAccess();
  }

  @Put(':posConfigId')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Habilita o deshabilita Inventario para los Vendedores de una tienda.',
    description:
      'Recomendado: cargar primero el stock manual de la tienda (Conteo) antes de habilitarla. Deshabilitar solo oculta la sección a los Vendedores; no borra datos.',
  })
  setEnabled(
    @Param('posConfigId', ParseIntPipe) posConfigId: number,
    @Body() dto: SetInventoryAccessDto,
    @User('email') updatedByEmail: string,
  ) {
    return this.accessService.setEnabled(posConfigId, dto.enabled, updatedByEmail);
  }
}
