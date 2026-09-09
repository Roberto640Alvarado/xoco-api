import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { SalesService } from '../services/sales.service.js';
import { FindOrdersQueryDto } from '../dto/find-orders-query.dto.js';
import { FindTopProductsQueryDto } from '../dto/find-top-products-query.dto.js';
import { FindDailySummaryQueryDto } from '../dto/find-daily-summary-query.dto.js';
import { FindReconciliationQueryDto } from '../dto/find-reconciliation-query.dto.js';

// SUPER_ADMIN y FINANZAS pueden ambos acceder a Ventas (ver CLAUDE.md,
// "Autorización": FINANZAS solo puede acceder a ventas/reportes/finanzas).
@ApiTags('sales')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('orders')
  @ApiOperation({
    summary: 'Órdenes por rango de fecha (de sesión) y tienda, paginado',
    description:
      'Agrupa por fecha de la sesión POS (start_at). Sin posConfigId trae todas las tiendas mezcladas en una sola lista.',
  })
  findOrders(@Query() query: FindOrdersQueryDto) {
    return this.salesService.findOrders(query);
  }

  @Get('top-products')
  @ApiOperation({
    summary: 'Top N productos más vendidos (por unidades) en un rango de fecha, por tienda',
    description:
      'Ordenado por cantidad vendida descendente. Excluye órdenes canceladas. Sin posConfigId agrega todas las tiendas.',
  })
  findTopProducts(@Query() query: FindTopProductsQueryDto) {
    return this.salesService.findTopProducts(query);
  }

  @Get('daily-summary')
  @ApiOperation({
    summary: 'Ventas agregadas por día (fecha de sesión) — para la gráfica de tendencia',
    description:
      'Un punto por cada día del rango (incluye días en cero, sin huecos). Excluye órdenes canceladas.',
  })
  findDailySummary(@Query() query: FindDailySummaryQueryDto) {
    return this.salesService.findDailySummary(query);
  }

  @Get('stores')
  @ApiOperation({ summary: 'Tiendas activas (pos.config) — para el filtro del dashboard' })
  findStores() {
    return this.salesService.findStores();
  }

  @Get('reconciliation')
  @ApiOperation({
    summary: 'Diagnóstico: compara el conteo por fecha de sesión vs. por fecha de orden individual',
    description:
      'Para cada tienda en el rango pedido, devuelve el total de órdenes/venta según los 2 métodos posibles de ' +
      'agrupar por día (fecha de SESIÓN — el que usa el resto de la app — vs. fecha de la orden individual), la ' +
      'diferencia entre ambos, un desglose por estado, y la lista puntual de órdenes donde los 2 métodos no ' +
      'coinciden (las que caen justo en el borde de medianoche). Pensado para explicar diferencias contra un ' +
      'conteo externo (ej. un Excel) sin tener que investigar caso por caso — no cambia cómo cuenta el resto de ' +
      'la app.',
  })
  getReconciliation(@Query() query: FindReconciliationQueryDto) {
    return this.salesService.getReconciliation(query);
  }
}
