import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { SalesService } from '../services/sales.service.js';
import { SalespersonSalesService } from '../services/salesperson-sales.service.js';
import { StoreInvoiceTotalsService } from '../services/store-invoice-totals.service.js';
import { FindOrdersQueryDto } from '../dto/find-orders-query.dto.js';
import { FindTopProductsQueryDto } from '../dto/find-top-products-query.dto.js';
import { FindDailySummaryQueryDto } from '../dto/find-daily-summary-query.dto.js';
import { FindReconciliationQueryDto } from '../dto/find-reconciliation-query.dto.js';
import { FindInvoiceRangeQueryDto } from '../dto/find-invoice-range-query.dto.js';

// SUPER_ADMIN y FINANZAS pueden ambos acceder a Ventas (ver CLAUDE.md,
// "Autorización": FINANZAS solo puede acceder a ventas/reportes/finanzas).
@ApiTags('sales')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.FINANZAS)
@Controller('sales')
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly salespersonSalesService: SalespersonSalesService,
    private readonly storeInvoiceTotalsService: StoreInvoiceTotalsService,
  ) {}

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

  @Get('by-salesperson')
  @ApiOperation({
    summary: 'Visitas y venta por vendedor, contando facturas',
    description:
      'Réplica del método del negocio: agrupa las FACTURAS de cliente de Odoo (account.move) del rango por ' +
      'vendedor. Por cada vendedor devuelve las visitas (cantidad de facturas), la venta sin impuesto y la venta ' +
      'con impuesto, más una fila de totales. A diferencia del resto de /sales, la fuente son las facturas y no ' +
      'las órdenes de POS: así el reporte también incluye el canal de mayoreo, que factura sin pasar por caja. ' +
      'Los montos van netos de notas de crédito, igual que los suma la lista de facturas de Odoo.',
  })
  findBySalesperson(@Query() query: FindInvoiceRangeQueryDto) {
    return this.salespersonSalesService.findBySalesperson(query);
  }

  @Get('by-store')
  @ApiOperation({
    summary: 'Visitas y venta por tienda, contando facturas — la fuente de Visitas y Venta Mensual',
    description:
      'Cuenta las mismas facturas que /sales/by-salesperson, pero atribuidas a su TIENDA (una factura no tiene ' +
      'tienda en Odoo: se resuelve por el diario contable de su serie fiscal y por el vendedor que la emitió). ' +
      'Es el número que alimenta los módulos de Visitas y Venta Mensual, y cuadra con el conteo que hace el ' +
      'equipo a mano. Mayoreo no pertenece a ninguna tienda: no entra en `totals` y se devuelve aparte en ' +
      '`outsideStores`. Los montos van netos de notas de crédito, igual que los suma la lista de Odoo.',
  })
  findTotalsByStore(@Query() query: FindInvoiceRangeQueryDto) {
    return this.storeInvoiceTotalsService.findTotalsByStore(query);
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
