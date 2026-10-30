import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import { RequiresModule } from '../../common/decorators/requires-module.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { StockRequestsService } from '../services/stock-requests.service.js';
import { CreateStockRequestDto } from '../dto/create-stock-request.dto.js';
import { SavePlantResponseDto } from '../dto/save-plant-response.dto.js';
import { ReceiveStockRequestDto } from '../dto/receive-stock-request.dto.js';
import { CancelStockRequestDto } from '../dto/cancel-stock-request.dto.js';
import { FindStockRequestsQueryDto } from '../dto/find-stock-requests-query.dto.js';

// Inventario → Solicitudes: la tienda (o el Admin por ella) pide stock a
// planta o a otra tienda; quien surte responde y
// despacha, la tienda confirma lo recibido. Admin/Finanzas solo ven el
// seguimiento (y cancelan). Cada acción lleva su @Roles propio; lo que
// depende del estado y de la tienda lo decide StockRequestsService.
@ApiTags('inventory-requests')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR, Role.PLANTA)
@RequiresModule('dashboard.inventario-solicitudes')
@Controller('inventory/requests')
export class StockRequestsController {
  constructor(private readonly requestsService: StockRequestsService) {}

  @Get('catalog')
  @Roles(Role.SUPER_ADMIN, Role.VENDEDOR, Role.PLANTA)
  @ApiOperation({
    summary: 'Productos que se pueden pedir, con su categoría y unidad.',
    description: 'Catálogo activo de Odoo (solo lectura). La tienda lo usa para pedir y planta para agregar productos.',
  })
  findCatalog() {
    return this.requestsService.findCatalog();
  }

  @Get('sources')
  @Roles(Role.SUPER_ADMIN, Role.VENDEDOR)
  @ApiOperation({
    summary: 'Tiendas a las que se les puede pedir (además de planta).',
    description: 'Las que tienen Inventario habilitado, sin la tienda del Vendedor que pide.',
  })
  findSources(@User() user: AuthenticatedUser) {
    return this.requestsService.findSources(user);
  }

  @Get('notifications')
  @ApiOperation({
    summary: 'Contador del globo del menú.',
    description:
      'Planta: solicitudes por responder o despachar. Tienda: envíos en camino por confirmar. Admin/Finanzas: siempre 0.',
  })
  findNotifications(@User() user: AuthenticatedUser) {
    return this.requestsService.findNotifications(user);
  }

  @Get()
  @ApiOperation({
    summary: 'Solicitudes de stock, más recientes primero.',
    description: 'La tienda solo ve las suyas. Planta, Admin y Finanzas ven todas, filtrables por tienda y estado.',
  })
  findMany(@Query() query: FindStockRequestsQueryDto, @User() user: AuthenticatedUser) {
    return this.requestsService.findMany(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Una solicitud con sus productos y su seguimiento completo.' })
  @ApiParam({ name: 'id', description: 'id de la solicitud.' })
  findOne(@Param('id') id: string, @User() user: AuthenticatedUser) {
    return this.requestsService.findOne(id, user);
  }

  @Post()
  @Roles(Role.VENDEDOR, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Pide stock a planta para una tienda.',
    description:
      'Crea una solicitud SOLICITADA con los productos indicados. El Vendedor pide para su propia tienda; el Admin elige la tienda con posConfigId (obligatorio). ' +
      'La tienda confirma la recepción igual que siempre.',
  })
  create(@Body() dto: CreateStockRequestDto, @User() user: AuthenticatedUser) {
    return this.requestsService.create(dto, user);
  }

  @Patch(':id/start')
  @Roles(Role.PLANTA, Role.VENDEDOR)
  @ApiOperation({
    summary: 'Planta toma la solicitud para prepararla.',
    description: 'SOLICITADA -> EN_PREPARACION. La tienda ve que ya la están trabajando.',
  })
  start(@Param('id') id: string, @User() user: AuthenticatedUser) {
    return this.requestsService.start(id, user);
  }

  @Put(':id/response')
  @Roles(Role.PLANTA, Role.VENDEDOR)
  @ApiOperation({
    summary: 'Planta guarda su avance: qué sí, qué no y qué agrega.',
    description: 'No despacha. Se puede guardar varias veces mientras la solicitud siga en SOLICITADA o EN_PREPARACION.',
  })
  savePlantResponse(@Param('id') id: string, @Body() dto: SavePlantResponseDto, @User() user: AuthenticatedUser) {
    return this.requestsService.savePlantResponse(id, dto, user);
  }

  @Post(':id/dispatch')
  @Roles(Role.PLANTA, Role.VENDEDOR)
  @ApiOperation({
    summary: 'Planta despacha: el envío va en camino.',
    description:
      'Guarda la respuesta y pasa a EN_CAMINO (despacho completo o parcial). Toda línea debe estar respondida (0 = no hay) y algo tiene que salir. La tienda recibe el aviso. ' +
      'Planta responde las de planta; en una solicitud entre tiendas, los Vendedores de la tienda que surte, y lo enviado se resta de su inventario (TRASLADO).',
  })
  dispatch(@Param('id') id: string, @Body() dto: SavePlantResponseDto, @User() user: AuthenticatedUser) {
    return this.requestsService.dispatch(id, dto, user);
  }

  @Patch(':id/receive')
  @Roles(Role.VENDEDOR)
  @ApiOperation({
    summary: 'La tienda confirma lo que recibió.',
    description:
      'EN_CAMINO -> RECIBIDA. Se indica la cantidad real de cada producto (con observación si no coincide con lo enviado) y recién entonces se suma al inventario de la tienda.',
  })
  receive(@Param('id') id: string, @Body() dto: ReceiveStockRequestDto, @User() user: AuthenticatedUser) {
    return this.requestsService.receive(id, dto, user);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancela la solicitud, con motivo.',
    description:
      'La tienda solo mientras planta no la toma; planta mientras la responde; Admin/Finanzas hasta que la tienda confirme.',
  })
  cancel(@Param('id') id: string, @Body() dto: CancelStockRequestDto, @User() user: AuthenticatedUser) {
    return this.requestsService.cancel(id, dto, user);
  }
}
