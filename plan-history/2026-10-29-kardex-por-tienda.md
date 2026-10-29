# Kardex de inventario por tienda

## Objetivo
Que cada tienda genere y descargue su kardex de inventario (Vendedor: solo el suyo) y que Admin/Finanzas lo generen para la tienda que elijan.

## Cambios realizados
- `GET /inventory/stores/:posConfigId/kardex?dateFrom&dateTo[&productId]` (InventoryController; Roles SUPER_ADMIN/FINANZAS/VENDEDOR, `assertOwnStoreOrThrow` + acceso a Inventario, módulo `dashboard.inventario`).
- `InventoryKardexService`: junta conteos (historial + conteo vigente sin historial), ventas de Odoo (`InventoryLedgerService.findSales`, ahora pública) y movimientos CONFIRMADOS desde el conteo de partida más antiguo necesario.
- `utils/kardex.util.ts` (`buildProductKardex`, puro): saldo inicial, líneas con saldo corrido, ajustes por conteo, ventas seguidas del mismo día agrupadas, saldo final. Sin conteo previo el saldo es null hasta el primer conteo.
- `InventoryKardexDoc`, `FindInventoryKardexQueryDto` (PickType del DTO del Registro). Tests del cálculo.

## Razones del cambio
El Registro mostraba los movimientos pero no saldos; el kardex usa el mismo criterio que la existencia estimada del Conteo para que los números cuadren.

## Resultado final
`tsc` y oxlint sin errores, 109 tests en verde.
