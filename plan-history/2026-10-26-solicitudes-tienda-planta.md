# Solicitudes de stock tienda → planta → tienda (rol Planta)

## Objetivo

Reemplazar el flujo anterior de inventario (una solicitud por producto que aceptaba y confirmaba Admin/Finanzas) por el flujo real de despacho, igual al "Formato envío a sucursales":

1. La tienda pide stock a planta (un pedido con varios productos, por categoría).
2. Planta toma el pedido, dice qué sí y qué no tiene, puede agregar productos y despacha (completo o parcial). La tienda recibe una alerta de que va en camino.
3. La tienda solo confirma lo que recibió (cantidad real por producto, con observación si hay diferencia) y recién ahí se suma al inventario.
4. Admin/Finanzas ven todo el seguimiento; Admin sigue actualizando el inventario directo con Conteo.

Rol nuevo: **PLANTA**, que solo ve Inventario → Solicitudes.

## Cambios realizados

- `schema.prisma`: `Role.PLANTA`; enum `StockRequestStatus` (SOLICITADA, EN_PREPARACION, EN_CAMINO, RECIBIDA, CANCELADA); tipos compuestos `StockRequestLine` / `StockRequestEvent`; modelos `StoreStockRequest` (con `events` como seguimiento) y `Counter` (número corrido SOL-0001). `StoreInventoryMovement.stockRequestId` liga cada ENTRADA con su solicitud.
- Nuevo módulo `src/stock-requests/` (`inventory/requests`): catálogo con categoría y unidad, listado/detalle, crear (tienda), `start`, `PUT response` (guardar avance), `dispatch`, `receive` (tienda) y `cancel` (por rol y estado), más `notifications` para el globo del menú. Concurrencia optimista por `updatedAt`.
- Al recibir, cada producto llegado crea una ENTRADA ya CONFIRMADA (`InventoryMovementsService.createConfirmedEntries`), así `estimatedQuantity` y el Registro funcionan sin cambios.
- Se retira el flujo viejo de ENTRADA: fuera `accept`, `receive` y la bandeja de solicitudes del controller de movimientos; la creación manual solo admite MERMA, REGALIA y DEGUSTACION; confirmar/rechazar ya no aplica a ENTRADA. Los avisos de Movimientos ya no cuentan solicitudes.
- Nuevo `dashboard.inventario-solicitudes` (techo: los 4 roles; Planta solo ese). Backfill actualizado. Usuarios: Planta no lleva tienda.
- `GET /inventory/stores/:id/items` trae `categoryName` (inventario presentable por categoría). Util `productCategoryName`.
- `prisma/close-legacy-stock-entries.mjs`: cierra (con simulación por defecto) las solicitudes del flujo anterior que hayan quedado abiertas.
- Tests: 36 nuevos (flujo, permisos por rol/tienda, diferencias, cancelación, alertas, catálogo).

## Razones del cambio

Despacho trabaja con un formulario por pedido y por categoría; el flujo viejo (un producto por solicitud, aprobado por Admin) no lo reflejaba y metía a Admin/Finanzas en una operación que le toca a planta y a las tiendas.

## Resultado final

102 tests en verde. Pasos al desplegar: `npx prisma generate`, `npm run db:push` (crea los índices de las colecciones nuevas), `node prisma/backfill-role-module-access.mjs` y, una vez, `node prisma/close-legacy-stock-entries.mjs` (simulación) y con `--apply`. Crear los usuarios Planta desde Administración → Usuarios.
