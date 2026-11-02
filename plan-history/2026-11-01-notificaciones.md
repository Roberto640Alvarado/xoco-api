# Notificaciones por rol (API)

## Objetivo
Exponer en un solo endpoint los avisos pendientes de cada rol.

## Cambios realizados
- Nuevo módulo `src/notifications` con `GET /notifications?sinceMovements=`.
- `StockRequestsService.findNotificationItems` y `InventoryMovementsService.findNotificationItems`; repositorio `findResolvedSince`.
- Pruebas en `notifications.service.spec.ts`.

## Razones
Reutilizar la lógica existente de solicitudes y movimientos sin duplicar reglas de acceso.

## Resultado final
- Planta: solicitudes nuevas y listas para despachar.
- Vendedor: pedidos en camino, solicitudes de otras tiendas y movimientos confirmados o rechazados.
- Super admin / Finanzas: movimientos por confirmar.
