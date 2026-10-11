# Flujo de solicitud de stock + lectura de Inventario para Vendedor

## Contexto
El negocio definió el flujo: el Vendedor solicita más stock; Admin/Finanzas la recibe en una bandeja y la acepta ("en camino") o la rechaza con motivo; cuando llega, el Vendedor la marca recibida con la cantidad real y Admin/Finanzas confirma — recién ahí se suma al stock. El Vendedor además debe poder ver (solo lectura) el stock y el Registro de su tienda.

## Cambios
- `StoreInventoryMovement`: nuevo estado `EN_CAMINO`; campos `acceptedByEmail`, `acceptedAt`, `rejectionReason`.
- Flujo ENTRADA: PENDIENTE → (accept) EN_CAMINO → (receive, Vendedor) RECIBIDO → (confirm) CONFIRMADO. `receive` ahora exige EN_CAMINO; `confirm` de una ENTRADA exige RECIBIDO; `reject` exige motivo (`RejectMovementDto`) y vale en PENDIENTE/EN_CAMINO/RECIBIDO.
- Nuevos endpoints: `PATCH movements/:id/accept`, `GET movements/inbox?kind=requests|movements` (Admin/Finanzas, todas las tiendas).
- `GET movements/notifications` ahora devuelve `{ total, movements, requests }` (un contador por pantalla) y acepta `sinceMovements`/`sinceRequests`.
- `GET stores/:id/items` y `GET stores/:id/ledger` abiertos a VENDEDOR solo para su tienda (`assertOwnStoreOrThrow`); `PUT items` sigue exclusivo de Admin/Finanzas.
- `dashboard.inventario`: el techo de rol y el backfill incluyen VENDEDOR → correr `node prisma/backfill-role-module-access.mjs` tras desplegar.
- Sin migraciones (MongoDB): `npx prisma generate`.
