import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import { RecipesService } from '../services/recipes.service.js';
import { UpsertRecipeDto } from '../dto/upsert-recipe.dto.js';
import { FindRecipesQueryDto } from '../dto/find-recipes-query.dto.js';

// Administración → Recetas: solo SUPER_ADMIN. Sin @RequiresModule a
// propósito: es configuración de Administración, no una pantalla del
// dashboard (mismo criterio que la habilitación de Inventario por tienda).
@ApiTags('inventory-recipes')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('inventory/recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Productos de Odoo para elegir el producto vendido y sus ingredientes.' })
  findCatalog() {
    return this.recipesService.findCatalog();
  }

  @Get()
  @ApiOperation({ summary: 'Recetas de una tienda: qué ingredientes descuenta cada producto vendido.' })
  findForStore(@Query() query: FindRecipesQueryDto) {
    return this.recipesService.findForStore(query.posConfigId);
  }

  @Put(':posConfigId/:productId')
  @ApiOperation({
    summary: 'Crea o reemplaza la receta de un producto en una tienda.',
    description:
      'Cada venta de este producto en esa tienda descuenta sus ingredientes (cantidad × lo vendido) en vez del producto. ' +
      'Una receta es de un solo nivel: un ingrediente no puede tener su propia receta.',
  })
  @ApiParam({ name: 'posConfigId', description: 'id de pos.config (tienda).' })
  @ApiParam({ name: 'productId', description: 'id de product.product que se vende.' })
  @ApiResponse({ status: 400, description: 'Tienda o productos inválidos, ingredientes repetidos o recetas anidadas.' })
  upsert(
    @Param('posConfigId', ParseIntPipe) posConfigId: number,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: UpsertRecipeDto,
    @User('email') email: string,
  ) {
    return this.recipesService.upsert(posConfigId, productId, dto, email);
  }

  @Delete(':posConfigId/:productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quita la receta: las ventas de ese producto vuelven a descontar el producto mismo.' })
  @ApiResponse({ status: 404, description: 'La receta no existe en esa tienda.' })
  async remove(@Param('posConfigId', ParseIntPipe) posConfigId: number, @Param('productId', ParseIntPipe) productId: number) {
    await this.recipesService.remove(posConfigId, productId);
    return { removed: true };
  }

  @Post(':posConfigId/copy-from/:sourcePosConfigId')
  @ApiOperation({
    summary: 'Copia todas las recetas de otra tienda a esta.',
    description: 'Reemplaza las recetas de los mismos productos; las demás de esta tienda se conservan.',
  })
  copyFrom(
    @Param('posConfigId', ParseIntPipe) posConfigId: number,
    @Param('sourcePosConfigId', ParseIntPipe) sourcePosConfigId: number,
    @User('email') email: string,
  ) {
    return this.recipesService.copyFrom(posConfigId, sourcePosConfigId, email);
  }
}
