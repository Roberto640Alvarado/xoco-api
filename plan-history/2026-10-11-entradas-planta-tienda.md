# Entradas (envíos planta→tienda): tercer tramo de Inventario

## Objetivo

El usuario compartió el diagrama de flujo que le dio Xocolatísimo para el manejo de inventario: inventario inicial → existencia en Odoo → (ventas / mermas / regalías) → disminución → envío de planta a tienda → recepción y verificación → entrada en Odoo → reportes (Kardex, existencias). Los primeros tramos (inventario inicial, ventas, mermas/regalías/degustaciones) ya estaban construidos — este tramo agrega la pieza que faltaba: el envío de planta a tienda, como un cuarto tipo de movimiento (`ENTRADA`) dentro del mismo ledger que ya existía, en vez de un módulo aparte.

El usuario confirmó tres decisiones de diseño antes de construir: (1) el Vendedor es quien solicita la entrada (no Admin/Finanzas empujándola sin que se pida), (2) la verificación en tienda es estricta — el Vendedor confirma la cantidad real recibida, no solo un check de "llegó o no", y (3) esto vive en el mismo módulo "Movimientos de inventario" que merma/regalía/degustación, como un tipo más.

## Cambios realizados

- **`prisma/schema.prisma`**: se agregó `ENTRADA` a `InventoryMovementType`, un nuevo estado `RECIBIDO` a `InventoryMovementStatus`, y un campo `receivedQuantity: Float?` a `StoreInventoryMovement` — la cantidad real que el Vendedor confirma haber recibido, que puede diferir de `quantity` (lo solicitado).
- **`src/inventory/dto/mark-movement-received.dto.ts`** (nuevo): `MarkMovementReceivedDto { receivedQuantity: number, Min(0) }`.
- **`src/inventory/repositories/inventory-movements.repository.ts`**: nuevo método `markReceived(id, receivedQuantity)` — pone `status = RECIBIDO`.
- **`src/inventory/services/inventory-movements.service.ts`**:
  - Nuevo método público `receive(id, dto, user)`: valida que el movimiento sea tipo `ENTRADA` y esté en `PENDIENTE`, valida la tienda con `assertOwnStoreOrThrow`, y llama `repository.markReceived`.
  - `resolve()` (privado, usado por `confirm()`/`reject()`) ahora acepta movimientos en `PENDIENTE` **o** `RECIBIDO` como punto de partida (antes solo `PENDIENTE`) — una ENTRADA pasa por `RECIBIDO` antes de poder confirmarse/rechazarse; los demás tipos nunca llegan a `RECIBIDO`, así que para ellos el comportamiento no cambió.
- **`src/inventory/controllers/inventory-movements.controller.ts`**: nueva ruta `PATCH /inventory/movements/:id/receive` — mismos roles que el resto del controller (`SUPER_ADMIN`, `FINANZAS`, `VENDEDOR`), la pertenencia a la tienda la valida el servicio.
- **`src/inventory/services/inventory.service.ts`** (`estimateQuantity`): ahora también SUMA las entradas `CONFIRMADAS` desde el último conteo (usa `receivedQuantity` cuando existe, y si no `quantity` — para una ENTRADA que Admin/Finanzas registró directo sin pasar por recepción). Es el único tipo de movimiento que suma en vez de restar.

## Flujo completo resultante

1. Vendedor registra una `ENTRADA` (producto + cantidad solicitada) → nace `PENDIENTE`, igual que merma/regalía/degustación.
2. Admin/Finanzas gestiona el envío fuera del sistema (comprar, empacar, mandar) — no hay un paso intermedio de "enviado" en el sistema, como pidió el diagrama solo marca el antes/después.
3. El producto llega a la tienda — el Vendedor llama a `/receive` con la cantidad real que llegó. El movimiento pasa a `RECIBIDO`. Si la cantidad real difiere de la solicitada, ambos números quedan guardados (`quantity` vs `receivedQuantity`) — no se pierde ese dato.
4. Admin/Finanzas revisa y confirma (`/confirm`) o rechaza (`/reject`) — al confirmar, `receivedQuantity` suma de inmediato a `estimatedQuantity` de esa tienda/producto.

Si en cambio Admin/Finanzas registra la ENTRADA directamente (sin que el Vendedor la haya solicitado — ej. un ajuste manual), nace `CONFIRMADO` de una vez, igual que los demás tipos, y usa `quantity` directo (no hay `receivedQuantity` porque no hubo paso de recepción).

## Razones del cambio

- **Por qué un estado `RECIBIDO` nuevo y no reusar `PENDIENTE`**: `PENDIENTE` ya significa "el Vendedor lo reportó, falta que Admin/Finanzas decida" para los otros tres tipos — llamar a eso mismo cuando en realidad ya se puede saber la cantidad real recibida perdería esa información intermedia. `RECIBIDO` deja claro, con una sola mirada al estado, que el envío ya llegó y solo falta el visto bueno de Admin/Finanzas sobre lo que de verdad pasó.
- **Por qué `receivedQuantity` es un campo separado y no se sobrescribe `quantity`**: `quantity` sigue siendo "lo que se pidió" — un registro honesto de la solicitud original. Si una tienda pide 50 y le llegan 42, perder el 50 original haría imposible después auditar cuántas veces un envío no llega completo.
- **Por qué `estimateQuantity` usa `receivedQuantity ?? quantity`**: para una ENTRADA que sí pasó por el flujo de recepción, lo que de verdad entró a la tienda es `receivedQuantity` (el dato real) — usar `quantity` (lo solicitado) inflaría el inventario estimado si no llegó completo. Para una ENTRADA que Admin/Finanzas registró directo, nunca hay `receivedQuantity` (no hubo recepción que confirmar), así que cae en `quantity` sin problema.

## Resultado final

`npx tsc --noEmit -p tsconfig.json`: sin errores nuevos (solo el error preexistente y no relacionado de `test/app.e2e-spec.ts`). `npx oxlint` sobre los 7 archivos nuevos/modificados: 0 advertencias, 0 errores.
