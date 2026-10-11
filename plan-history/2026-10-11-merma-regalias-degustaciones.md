# Movimientos de inventario: merma, regalías y degustaciones

## Objetivo

El usuario pidió registrar, por tienda, las salidas de inventario que no son ventas: merma, regalías y degustaciones. El admin/finanzas debe poder registrar estos movimientos, y cada vendedor debe poder registrar los de su propia tienda. Estos movimientos deben descontarse del cálculo de `estimatedQuantity` del inventario estimado por tienda. Se dejó explícitamente fuera de este trabajo (fase futura, a pedido del usuario) el módulo de solicitud de reabastecimiento iniciado por el vendedor con flujo de notificación/confirmación.

## Investigación previa

Se revisó la arquitectura RBAC existente de 3 fases (`@Roles` + `RolesGuard`, `scopedPosConfigId` para filtrado por query param, `@RequiresModule` + `ModuleAccessGuard` + `PermissionsService` + `MODULE_KEY_CEILING` para control de acceso a módulos configurable desde el panel de Permisos) antes de agregar nada, para mantener el mismo patrón. Se intentó además revisar Odoo directamente (stock.quant, stock.move.line, stock.picking.type) para ver si ya existe algo equivalente, pero la sesión de Odoo estaba cerrada en esta corrida — la decisión de diseño se basó en el código existente y en lo que el usuario describió.

## Cambios realizados (backend, xoco-api)

- **`prisma/schema.prisma`**: nuevos enums `InventoryMovementType` (MERMA, REGALIA, DEGUSTACION) e `InventoryMovementStatus` (PENDIENTE, CONFIRMADO, RECHAZADO), y el modelo `StoreInventoryMovement` (posConfigId, productId, type, quantity, note, occurredAt, status, registeredByEmail/Role, createdAt, resolvedByEmail, resolvedAt) mapeado a `store_inventory_movements`.
- **`src/common/utils/assert-own-store.util.ts`** (nuevo): `assertOwnStoreOrThrow(user, posConfigId)` — el complemento para parámetros de RUTA del ya existente `scopedPosConfigId` (que es para parámetros de QUERY). Un vendedor que pide un `posConfigId` de ruta que no es el suyo recibe 403 en vez de un redireccionamiento silencioso, porque un parámetro de ruta no se puede "corregir" sin que el cliente se confunda.
- **`src/inventory/dto/create-inventory-movement.dto.ts`**, **`doc/inventory-movement.doc.ts`**, **`repositories/inventory-movements.repository.ts`**, **`services/inventory-movements.service.ts`**, **`controllers/inventory-movements.controller.ts`** (todos nuevos): CRUD mínimo para el ledger. Rutas: `POST`/`GET /inventory/stores/:posConfigId/movements` (accesible a SUPER_ADMIN, FINANZAS y VENDEDOR, cada uno restringido a su propia tienda vía `assertOwnStoreOrThrow`), y `PATCH /inventory/movements/:id/confirm` / `:id/reject` (solo SUPER_ADMIN/FINANZAS).
- **Flujo de aprobación**: un movimiento creado por un VENDEDOR nace en estado PENDIENTE y NO afecta el inventario estimado hasta que admin/finanzas lo confirma. Un movimiento creado por admin/finanzas nace CONFIRMADO de inmediato (no necesita autoaprobación, porque ya es quien tiene la autoridad para registrar entradas/salidas).
- **`src/inventory/services/inventory.service.ts`**: `estimateQuantity()` ahora también resta los movimientos CONFIRMADOS ocurridos desde la última actualización guardada del inventario, usando un nuevo helper `toOdooDateTime` (exportado desde `common/utils/store-date.util.ts`) para construir el rango de fecha. `findItemsForStore()` ahora trae en paralelo las ventas de Odoo y los movimientos confirmados de Mongo.
- **`src/common/constants/module-keys.const.ts`** + **`prisma/backfill-role-module-access.mjs`**: se agregó el nuevo moduleKey `dashboard.inventario-movimientos` al listado y al techo de roles (`MODULE_KEY_CEILING` / `MODULE_ROLE_CEILING`) como `[SUPER_ADMIN, FINANZAS, VENDEDOR]` — separado del moduleKey existente `dashboard.inventario` (que sigue siendo solo Admin/Finanzas), para que un vendedor pueda ver/registrar movimientos de su tienda sin heredar acceso al inventario completo de todas las tiendas.

## Razones del cambio

- **Por qué un moduleKey nuevo y no reusar `dashboard.inventario`**: el inventario general (`dashboard.inventario`) muestra todas las tiendas y es información gerencial — nunca estuvo pensado para que un vendedor lo viera. El nuevo moduleKey (`dashboard.inventario-movimientos`) es una rebanada angosta y específica (solo movimientos, solo su propia tienda) que sí tiene sentido exponerle al vendedor, sin tocar el techo del módulo general.
- **Por qué PENDIENTE/CONFIRMADO/RECHAZADO y no aplicar el movimiento al toque**: el usuario pidió explícitamente que cuando el vendedor registre algo, "la notificación la reciba el admin o finanzas y el ya realiza su gestión" — es decir, el vendedor informa, pero quien tiene la autoridad sobre el stock es admin/finanzas. Aplicar el descuento solo cuando el movimiento está CONFIRMADO respeta eso sin necesitar todavía un sistema de notificaciones (que es trabajo de una fase posterior, también explícitamente diferida).
- **Por qué `assertOwnStoreOrThrow` en vez de reusar `scopedPosConfigId`**: `scopedPosConfigId` fue diseñado para query params, donde silenciosamente redirigir al vendedor a su propia tienda tiene sentido (es un filtro). Para un parámetro de RUTA (`/stores/:posConfigId/movements`), redirigir silenciosamente sería confuso para el cliente (la URL que pidió no es la que se le respondió) — por eso se creó un helper separado que lanza 403 en su lugar.

## Pendiente (explícitamente fuera de este cambio)

- Frontend: pantalla de registro/listado para Admin/Finanzas, vista simplificada para Vendedor, y sincronizar el nuevo moduleKey en `features/permissions/types/permissions.types.ts`, `features/permissions/constants/module-groups.ts` y `app/dashboard/layout.tsx` (xoco-app).
- Fase 2 (diferida a pedido del usuario): módulo de solicitud de reabastecimiento iniciado por el vendedor, con notificación a admin/finanzas y confirmación de cantidad recibida.

## Resultado final

`npx tsc --noEmit -p tsconfig.json`: sin errores nuevos (solo el error preexistente y no relacionado de `test/app.e2e-spec.ts` por falta de tipos de `supertest/types`). `npx oxlint` sobre los 10 archivos nuevos/modificados: 0 advertencias, 0 errores.
