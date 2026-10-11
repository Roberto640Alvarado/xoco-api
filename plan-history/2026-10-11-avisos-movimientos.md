# Avisos de movimientos pendientes (backend)

## Contexto
Admin/Finanzas no se enteraban de lo que un Vendedor reportaba hasta abrir Movimientos tienda por tienda, y el Vendedor no sabía cuándo se resolvía lo suyo.

## Cambios
- `GET /inventory/movements/notifications` (`?since=ISO` opcional, roles SUPER_ADMIN/FINANZAS/VENDEDOR, `dashboard.inventario-movimientos`).
- Admin/Finanzas: `toResolve` = movimientos PENDIENTE o RECIBIDO de todas las tiendas.
- Vendedor (su tienda): `toReceive` = ENTRADA en PENDIENTE; `resolvedUnseen` = lo que él registró y quedó CONFIRMADO/RECHAZADO después de `since` (por defecto últimos 7 días).
- Repositorio: `countByStatuses`, `countPendingEntradas`, `countResolvedSince`. Servicio: `findNotifications`. DTO `FindMovementNotificationsQueryDto`, doc `InventoryMovementNotificationsDoc`.

Sin cambios de esquema ni nuevas moduleKeys.
