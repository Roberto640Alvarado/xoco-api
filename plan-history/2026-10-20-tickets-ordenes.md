# Tickets → Órdenes (detalle de cada orden de caja)

## Objetivo

Exponer cada orden de caja (pos.order) con su información principal y su detalle completo (productos, impuestos, pagos y cambio), filtrable por fechas y tienda. El Vendedor solo ve las de su tienda; Admin y Finanzas ven todas.

## Cambios realizados

- `GET /sales/tickets`: listado paginado (`dateFrom`, `dateTo`, `posConfigId`, `search`, `sort`, `page`, `limit` hasta 100). Cada orden trae fecha y hora local, tienda, sesión, cajero, cliente, cantidad de productos y unidades (sin granel), montos y métodos de pago. `totals` resume TODO el filtro (órdenes, venta y ticket promedio) con un read_group. Excluye canceladas.
- `GET /sales/tickets/:id`: detalle con líneas (cantidad, unidad, granel convertido a kg, precio, descuento, subtotal y total) y pagos por método.
- Nuevo `PosTicketsController` + `PosTicketsService` (SalesService ya pasa de 700 líneas). El domain de órdenes se extrajo a `builders/pos-order-domain.builder.ts` y lo comparten ambos servicios.
- Seguridad: listado con `scopedPosConfigId` (y 403 si un Vendedor no tiene tienda asignada); detalle con `assertOwnStoreOrThrow` sobre la tienda de la orden (403 si es de otra). Nuevo moduleKey `dashboard.ordenes` (techo: los tres roles), también en el backfill.
- Odoo: se pide `pos_reference` (número de recibo) en pos.order; `toStoreTime` en store-date.util.
- Tests de PosTicketsService (mapeo, totales, domain de búsqueda y tienda, orden/paginación, 404).

## Razones del cambio

El negocio necesita revisar ticket por ticket qué se vendió, quién lo cobró y cómo se pagó, sin entrar a Odoo.

## Resultado final

65 tests en verde, lint sin errores nuevos.
