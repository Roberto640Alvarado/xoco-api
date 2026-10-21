import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/index.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { User } from '../../common/decorators/user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface.js';
import { scopedPosConfigId } from '../../common/utils/scoped-pos-config-id.util.js';
import { RequiresModule } from '../../common/decorators/requires-module.decorator.js';
import { SalesService } from '../services/sales.service.js';
import { SalespersonSalesService } from '../services/salesperson-sales.service.js';
import { StoreInvoiceTotalsService } from '../services/store-invoice-totals.service.js';
import { WholesaleClientTotalsService } from '../services/wholesale-client-totals.service.js';
import { CustomerSearchService } from '../services/customer-search.service.js';
import { FindCustomerSearchQueryDto } from '../dto/find-customer-search-query.dto.js';
import { FindOrdersQueryDto } from '../dto/find-orders-query.dto.js';
import { FindTopProductsQueryDto } from '../dto/find-top-products-query.dto.js';
import { FindProductComparisonQueryDto } from '../dto/find-product-comparison-query.dto.js';
import { FindTopProductsByCategoryQueryDto } from '../dto/find-top-products-by-category-query.dto.js';
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
    private readonly wholesaleClientTotalsService: WholesaleClientTotalsService,
    private readonly customerSearchService: CustomerSearchService,
  ) {}

  // Solo Admin y Finanzas (hereda el @Roles de la clase) y con la pantalla de
  // tickets o el Resumen habilitados.
  @RequiresModule('dashboard.ticket-detallado', 'dashboard.resumen')
  @Get('orders')
  @ApiOperation({
    summary: 'Órdenes por rango de fecha y tienda, paginado',
    description:
      'Agrupa por el día LOCAL de la tienda en que se cobró la orden (date_order convertido de UTC), igual que los ' +
      'reportes propios de Odoo. Sin posConfigId trae todas las tiendas mezcladas en una sola lista.',
  })
  findOrders(@Query() query: FindOrdersQueryDto, @User() user: AuthenticatedUser) {
    query.posConfigId = scopedPosConfigId(user, query.posConfigId);
    return this.salesService.findOrders(query);
  }

  @Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR)
  @RequiresModule('dashboard.productos')
  @Get('top-products')
  @ApiOperation({
    summary: 'Top N productos más vendidos (por unidades) en un rango de fecha, por tienda',
    description:
      'Ordenado por cantidad vendida descendente. Excluye órdenes canceladas y productos a granel (ver ' +
      '/sales/top-products-by-weight) — su `qty` viene en gramos, no en piezas, y no es comparable al resto del ' +
      'ranking. Sin posConfigId agrega todas las tiendas.',
  })
  findTopProducts(@Query() query: FindTopProductsQueryDto, @User() user: AuthenticatedUser) {
    query.posConfigId = scopedPosConfigId(user, query.posConfigId);
    return this.salesService.findTopProducts(query);
  }

  @Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR)
  @RequiresModule('dashboard.productos')
  @Get('top-products-by-weight')
  @ApiOperation({
    summary: 'Top N productos vendidos a granel (por Kg) en un rango de fecha, por tienda',
    description:
      'Misma forma que /sales/top-products, pero solo para productos cuya unidad de medida en Odoo es de peso ' +
      '(ej. "Crocks" y similares) — se agregan y ordenan por kilogramos vendidos (ya convertido, sea cual sea la ' +
      'UoM nativa de la línea), no por unidades. Excluye órdenes canceladas.',
  })
  findTopProductsByWeight(@Query() query: FindTopProductsQueryDto, @User() user: AuthenticatedUser) {
    query.posConfigId = scopedPosConfigId(user, query.posConfigId);
    return this.salesService.findTopProductsByWeight(query);
  }

  // Pantalla propia (Productos → Comparación), con su propio moduleKey.
  // El Vendedor solo compara su tienda: scopedPosConfigId ignora el
  // posConfigId que mande y usa siempre el suyo.
  @Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR)
  @RequiresModule('dashboard.comparacion-productos')
  @Get('product-comparison')
  @ApiOperation({
    summary: 'Compara, producto por producto, unidades e ingreso de dos períodos (A vs. B)',
    description:
      'Dos rangos libres de días locales de tienda (ej. mes en curso vs. mes anterior, dos meses cualquiera o ' +
      'dos rangos personalizados), de hasta 366 días cada uno. Devuelve los totales de cada período y todos los ' +
      'productos vendidos en cualquiera de los dos, ordenados por unidades del período A. Mismo criterio de ' +
      '"producto" que /sales/top-products: excluye órdenes canceladas y productos a granel.',
  })
  @ApiResponse({ status: 200, description: 'Totales de cada período y productos comparados.' })
  @ApiResponse({ status: 400, description: 'Un período tiene la fecha inicial después de la final o pasa de 366 días.' })
  @ApiResponse({ status: 403, description: 'El rol no tiene acceso a Comparación de productos.' })
  findProductComparison(@Query() query: FindProductComparisonQueryDto, @User() user: AuthenticatedUser) {
    query.posConfigId = scopedPosConfigId(user, query.posConfigId);
    return this.salesService.findProductComparison(query);
  }

  @Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR)
  @RequiresModule('dashboard.categorias')
  @Get('top-products-by-category')
  @ApiOperation({
    summary: 'Top N productos DENTRO DE CADA CATEGORÍA (product.category de Odoo), en un rango de fecha, por tienda',
    description:
      'Categorías siempre ordenadas por su venta total en ingresos (mayor primero); dentro de cada una, sus ' +
      'productos ordenados por `metric` (ingresos por default, o cantidad — ver query param). A diferencia de ' +
      '/sales/top-products, acá NO se excluyen los productos a granel (ej. Crocks): por ingresos son comparables ' +
      'entre un producto por pieza y uno por peso, así que conviven en el ranking de su categoría; por cantidad ' +
      'cada producto trae su propia unidad (`unit`: "unidad" o "kg"). Excluye órdenes canceladas. Sin posConfigId ' +
      'agrega todas las tiendas.',
  })
  findTopProductsByCategory(@Query() query: FindTopProductsByCategoryQueryDto, @User() user: AuthenticatedUser) {
    query.posConfigId = scopedPosConfigId(user, query.posConfigId);
    return this.salesService.findTopProductsByCategory(query);
  }

  @Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR)
  @RequiresModule(
    'dashboard.resumen',
    'dashboard.visitas',
    'dashboard.trafico-diario',
    'dashboard.venta-diaria',
    'dashboard.ticket-detallado',
  )
  @Get('daily-summary')
  @ApiOperation({
    summary: 'Ventas agregadas por día local de la tienda — para la gráfica de tendencia',
    description:
      'Un punto por cada día del rango (incluye días en cero, sin huecos). Excluye órdenes canceladas.',
  })
  findDailySummary(@Query() query: FindDailySummaryQueryDto, @User() user: AuthenticatedUser) {
    query.posConfigId = scopedPosConfigId(user, query.posConfigId);
    return this.salesService.findDailySummary(query);
  }

  @Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR)
  @Get('stores')
  @ApiOperation({
    summary: 'Tiendas activas (pos.config) — para el filtro del dashboard',
    description:
      'Para un Vendedor, devuelve únicamente su propia tienda (arreglo de 1) — nunca la lista completa, así el ' +
      'mismo selector de tienda del resto de la app queda naturalmente bloqueado en la suya.',
  })
  async findStores(@User() user: AuthenticatedUser) {
    const stores = await this.salesService.findStores();
    if (user.role === Role.VENDEDOR) {
      return stores.filter((store) => store.id === user.posConfigId);
    }
    return stores;
  }

  @RequiresModule('dashboard.visitas', 'dashboard.venta-mensual')
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

  @RequiresModule('dashboard.visitas', 'dashboard.venta-mensual')
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

  @RequiresModule('dashboard.ventas-mayoreo')
  @Get('by-wholesale-client')
  @ApiOperation({
    summary: 'Visitas y venta por CLIENTE DE MAYOREO (Selectos, Operadora del Sur), con desglose por comprador',
    description:
      'Mismas facturas y mismo rango que /sales/by-salesperson y /sales/by-store, pero agrupadas por cliente de ' +
      'mayoreo (commercial_partner_id de Odoo) en vez de por vendedor o tienda — son cuentas que facturan sin ' +
      'pasar por caja (ver /sales/by-store, `outsideStores`). Cada cliente trae además su desglose por comprador ' +
      'puntual (partner_id, ej. una sucursal de Selectos), ordenado por venta descendente. Los montos van netos ' +
      'de notas de crédito, igual que el resto de /sales basado en facturas.',
  })
  findTotalsByWholesaleClient(@Query() query: FindInvoiceRangeQueryDto) {
    return this.wholesaleClientTotalsService.findTotalsByClient(query);
  }

  @RequiresModule('dashboard.buscar-compradores')
  @Get('customers/search')
  @ApiOperation({
    summary: 'Buscador general de clientes por nombre, con su venta total facturada en un rango de fechas',
    description:
      'No está limitado a los clientes de mayoreo fijos de Ventas Mayoreo — busca contra CUALQUIER partner de ' +
      'Odoo con al menos una factura en el rango cuyo nombre matchea `q` (mayoreo, minorista, persona natural). ' +
      'Cada resultado es un cliente puntual (partner_id de la factura, ej. una sucursal) con su empresa matriz ' +
      '(commercialPartnerId/Name) al lado para contexto. Ordenado por venta descendente, recortado a `limit`.',
  })
  searchCustomers(@Query() query: FindCustomerSearchQueryDto) {
    return this.customerSearchService.search(query);
  }

  @Roles(Role.SUPER_ADMIN, Role.FINANZAS, Role.VENDEDOR)
  @RequiresModule('dashboard.efectivo-otros-medios')
  @Get('payment-methods')
  @ApiOperation({
    summary: 'Venta por método de pago (Efectivo vs. otros medios), por rango de fecha y tienda',
    description:
      'Agrupa los pagos (pos.payment) de las órdenes del rango/tienda pedidos por método de pago, separados en 2 ' +
      'baldes según el `type` de Odoo: Efectivo (cada tienda tiene el suyo, se suman todos) vs. cualquier otro ' +
      'medio (tarjeta, transferencia, apps de delivery, cuenta de cliente). `methods` trae el desglose completo ' +
      'por método puntual. Excluye órdenes canceladas. Sin posConfigId agrega todas las tiendas.',
  })
  findPaymentMethodsSummary(@Query() query: FindDailySummaryQueryDto, @User() user: AuthenticatedUser) {
    query.posConfigId = scopedPosConfigId(user, query.posConfigId);
    return this.salesService.findPaymentMethodsSummary(query);
  }

  // Diagnóstico: solo Admin y Finanzas y con alguna pantalla de ventas habilitada.
  @RequiresModule(
    'dashboard.resumen',
    'dashboard.visitas',
    'dashboard.trafico-diario',
    'dashboard.venta-diaria',
    'dashboard.ticket-detallado',
  )
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
  getReconciliation(@Query() query: FindReconciliationQueryDto, @User() user: AuthenticatedUser) {
    query.posConfigId = scopedPosConfigId(user, query.posConfigId);
    return this.salesService.getReconciliation(query);
  }
}
