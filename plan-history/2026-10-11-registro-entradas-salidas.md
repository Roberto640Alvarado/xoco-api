# Registro de entradas y salidas por tienda (ledger)

## Objetivo

El usuario pidió llevar, por tienda, un registro de las entradas y salidas con fecha y hora. Confirmó: incluir todo (ventas de Odoo, movimientos manuales y conteos), una línea por venta con su hora exacta, y filtros por rango de fechas, producto y tipo, más exportar a Excel.

## Cambios realizados

- `prisma/schema.prisma`: nuevo modelo `StoreInventoryCountLog` (posConfigId, productId, quantity, previousQuantity, countedAt, countedByEmail). `StoreInventoryItem` solo guarda el valor actual, así que sin esto no había historial de conteos. Solo existe desde ahora: los conteos anteriores no tienen registro.
- `InventoryService.upsertBulk`: antes de guardar lee la cantidad previa y, después, agrega una fila al historial por cada producto guardado.
- `InventoryRepository`: `createCountLogs` y `findCountLogs`. `InventoryMovementsRepository`: `findForLedger` (todos los estados, rango y producto opcional).
- `InventoryLedgerService` (nuevo) y `GET /inventory/stores/:posConfigId/ledger` (SUPER_ADMIN/FINANZAS, módulo `dashboard.inventario`): une ventas (pos.order.line de Odoo, órdenes no canceladas, una línea por producto con la hora de la orden y su número), movimientos (merma, regalía, degustación, entrada, con su estado) y conteos ("Antes: X" / "Primer conteo"), ordenados del más reciente al más antiguo. Filtros `dateFrom`/`dateTo` (día local de la tienda, con `storeDayRangeToUtc`), `productId` y `type`.
- Contrato: `InventoryLedgerEntryDoc` con `direction` (IN/OUT/COUNT) y cantidad sin signo; el frontend pone el signo.

## Razones

- No se calcula saldo corrido por línea: la existencia estimada ya se calcula en `estimateQuantity` y un saldo histórico exigiría reconstruir el estado en cada fecha. El registro dice qué pasó y cuándo.
- Los movimientos PENDIENTE/RECHAZADO sí aparecen, con su estado, para que se vea qué falta por confirmar; solo los CONFIRMADOS afectan la existencia.
- Las ventas se leen en vivo de Odoo (no se copian a nuestra base), igual que en la existencia estimada.

## Resultado

`npx tsc --noEmit`: solo el error preexistente de `supertest/types`. `npx oxlint src/inventory src/odoo src/common`: 0 errores.
