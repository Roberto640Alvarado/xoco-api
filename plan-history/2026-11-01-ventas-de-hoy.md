# Ventas de hoy (Inicio)

## Objetivo
Que el Inicio muestre cómo van las ventas del día: todas las tiendas para Admin y Finanzas, y la propia tienda por hora para el Vendedor.

## Cambios realizados
- `GET /sales/today` (`TodaySalesService`): órdenes POS de hoy y del mismo día de la semana pasada (sin canceladas, hora de El Salvador). Por tienda y en total: vendido, órdenes, ticket promedio, lo de la semana pasada hasta esta misma hora y su variación, última venta, hora más fuerte y las 24 horas (hoy y semana pasada).
- Roles Super admin, Finanzas y Vendedor (el Vendedor siempre su tienda), con el permiso `dashboard.resumen`.
- Prueba con hora fija que verifica horas locales, comparación a la misma hora y totales.

## Razones
Pedido del usuario: ver lo que va del día al entrar al panel.

## Resultado final
El Inicio muestra las ventas del día y se actualiza cada 2 minutos.

## Actualización: resumen de pedidos para Planta
- `GET /inventory/requests/summary` (`StockRequestsSummaryService`, Planta, Admin y Finanzas): solo pedidos a planta; hoy, por preparar (solicitada o en preparación), en camino, recibidos hoy; por tienda (incluye unidades pedidas en 14 días) y por día de los últimos 14 días por tienda. Las canceladas no cuentan en días ni totales recientes.
