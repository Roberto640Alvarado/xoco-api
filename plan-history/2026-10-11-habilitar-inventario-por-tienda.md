# Habilitar Inventario por tienda

## Contexto
Inventario no debe ser visible para los Vendedores hasta que cada tienda tenga su stock cargado a mano. El Super admin lo habilita tienda por tienda desde Administración.

## Cambios
- Modelo `StoreInventoryAccess` (`posConfigId` único, `enabled` por defecto false, `updatedByEmail`) — colección `store_inventory_access`.
- `GET /inventory/access` (todos los roles): `{ enabledPosConfigIds }`. `PUT /inventory/access/:posConfigId` (solo SUPER_ADMIN): `{ enabled }`.
- Enforcement: un Vendedor cuya tienda no esté habilitada recibe 403 ("El inventario todavía no está habilitado para tu tienda.") en items, ledger, movimientos de la tienda y recepción; sus avisos (`notifications`) quedan en cero. Admin y Finanzas no se restringen.
- `InventoryAccessRepository` / `InventoryAccessService` / `InventoryAccessController`.

Sin migración (MongoDB): `npx prisma generate`. Por defecto ninguna tienda está habilitada, así que al desplegar los Vendedores dejan de ver Inventario hasta que el Super admin lo habilite.
