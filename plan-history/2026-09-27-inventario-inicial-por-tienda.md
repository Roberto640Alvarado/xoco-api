# Módulo Inventario — Tramo 1: inventario inicial por tienda

## Contexto

El negocio pidió una vista de Inventario y compartió su proceso completo (inventario físico inicial → carga en Odoo → existencia → ventas/mermas/regalías → envío planta→tienda → recepción → reportes Kardex/Existencias). Antes de construir todo el flujo de una vez, se verificó con el usuario (AskUserQuestion) qué hacer, dado un dato ya conocido de conversaciones previas: **el API key de Odoo es de SOLO LECTURA**, así que el paso "cargar en Odoo como inventario inicial" no se puede hacer desde esta app.

Decisiones confirmadas por el usuario:
- El inventario (inicial y su seguimiento) vive ENTERAMENTE en nuestra propia base — Odoo se sigue usando solo de lectura para catálogo/ventas, nunca se le escribe.
- La captura del inventario inicial es CENTRALIZADA por Finanzas (no cada Vendedor por su tienda).
- Se captura TODO el catálogo de Odoo (`product.product`), no un subconjunto.
- Mermas y regalías a clientes quedan FUERA de este tramo — se resuelven después.

## Diseño

**`prisma/schema.prisma`**: nuevo modelo `StoreInventoryItem` (`posConfigId` + `productId` único, `quantity: Float`, `updatedAt`/`updatedByEmail`) — mismo patrón que `StoreGoal`/`StoreSalesGoal`. Solo guarda el valor ACTUAL, sin historial de versiones.

**`src/common/utils/product-uom.util.ts`** (movido desde `src/sales/utils/`): ahora lo usa también Inventory (para decidir "unidad" vs "Kg" por producto), mismo criterio ya aplicado a `fetchAllOdooPages` cuando pasó a ser compartido entre `SalesService` y `StoreInvoiceTotalsService`.

**`src/inventory/`** (nuevo módulo, mismo patrón que `goals`):
- `InventoryRepository`: único acceso a `store_inventory_items`.
- `InventoryService.findItemsForStore(posConfigId)`: trae TODO `product.product` activo de Odoo (paginado con `fetchAllOdooPages`) y lo cruza con lo guardado en Mongo — `quantity: null` cuando el producto todavía no se ha contado (distinto de `0`).
- `InventoryService.upsertBulk(posConfigId, dto, updatedByEmail)`: guarda en lote.
- `InventoryController`: `GET/PUT /inventory/stores/:posConfigId/items`, restringido a `@Roles(SUPER_ADMIN, FINANZAS)` — Vendedor NO tiene acceso en este tramo (a diferencia de Goals/Sales).

**RBAC**: se agregó `dashboard.inventario` al catálogo de moduleKey (`module-keys.const.ts`, ceiling `[SUPER_ADMIN, FINANZAS]`) y al backfill (`backfill-role-module-access.mjs`) — mismo tratamiento que "Cierre del mes" (roles como techo real + moduleKey togglable desde el panel de Permisos).

## Razones del cambio

- Construir el inventario en nuestra base (no en Odoo) no es una preferencia de diseño sino la única opción real dado el API key de solo lectura — se documenta explícitamente en el código para que no se intente "sincronizar hacia Odoo" más adelante sin revisar esta restricción.
- Se prefirió reutilizar el patrón de bulk upsert de Goals (en vez de inventar uno nuevo) para mantener consistencia en cómo el frontend guarda listas editables.
- Se restringió a SUPER_ADMIN/FINANZAS (sin Vendedor) porque el usuario confirmó explícitamente que la captura es centralizada — evita construir de más (una vista para Vendedor) antes de que el negocio lo pida.

## Pendiente

- Mermas, regalías, envíos planta→tienda, recepción y Kardex quedan para tramos futuros — este tramo solo cubre "inventario inicial capturado y visible por tienda".
- Correr `node prisma/backfill-role-module-access.mjs` una vez desplegado el cambio, para sembrar `dashboard.inventario` en `role_module_access`.
- `npm run lint` (oxlint) y `npm test` (vitest) no se pudieron correr en esta sesión — mismo problema de binarios nativos (Linux ARM vs macOS ARM en `node_modules`) ya documentado en sesiones anteriores. `npx tsc --noEmit` sí corrió limpio (solo un error preexistente y no relacionado en `test/app.e2e-spec.ts`, tipos de `supertest`).
