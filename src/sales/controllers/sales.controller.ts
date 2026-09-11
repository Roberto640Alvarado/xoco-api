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
    summary: 'Órdenes por rango de fecha y tienda, paginado',
    description:
      'Agrupa por el día LOCAL de la tienda en que se cobró la orden (date_order convertido de UTC), igual que los ' +
      'reportes propios de Odoo. Sin posConfigId trae todas las tiendas mezcladas en una sola lista.',
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
    summary: 'Ventas agregadas por día local de la tienda — para la gráfica de tendencia',
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
    summary: 'Diagnóstico: compara el conteo por día local de la tienda vs. por fecha de sesión',
    description:
      'Para cada tienda en el rango pedido, devuelve el total de órdenes/venta según los 2 métodos de agrupar por ' +
      'día (día LOCAL de date_order — el que usa el resto de la app — vs. fecha en que abrió la SESIÓN POS, que ' +
      'era el método anterior), la diferencia entre ambos, un desglose por estado, y la lista puntual de órdenes ' +
      'donde los 2 métodos no coinciden. Pensado para explicar diferencias contra un conteo externo (ej. un ' +
      'Excel) o contra un número histórico del panel — no cambia cómo cuenta el resto de la app.',
  })
  getReconciliation(@Query() query: FindReconciliationQueryDto) {
    return this.salesService.getReconciliation(query);
  }
}
