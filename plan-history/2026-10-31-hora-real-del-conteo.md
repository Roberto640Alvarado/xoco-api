# Hora real del conteo físico

## Objetivo
En Centrika algunas ventas no se restaban de la existencia estimada y otras sí. Causa: el estimado restaba las ventas desde la hora en que se GUARDÓ el conteo, no desde que se CONTÓ. Si se contó antes de abrir y se capturó más tarde, las ventas de en medio se perdían (ej. Maracuyá: 13 vendidas, solo 2 después de guardar).

## Cambios realizados
- `StoreInventoryItem.countedAt` (null en los viejos: se usa updatedAt) y `countedAtOf()`. El estimado del Conteo y el Kardex parten de esa hora.
- `PUT /inventory/stores/:id/items` acepta `countedAt` (ISO; ni futuro ni de hace más de 7 días). También se guarda en el historial de conteos.
- Panel: la confirmación de guardado pregunta "¿Cuándo se contó?" (Ahora mismo / Antes, a otra hora con fecha y hora).
- `prisma/set-count-time.mjs`: corrige la hora de conteos ya guardados de una tienda en un día (simulación por defecto, `--apply` para guardar).

## Razones del cambio
El conteo físico y su captura no ocurren al mismo tiempo; el saldo debe partir del momento real del conteo.

## Resultado final
`tsc` y lint sin errores, tests en verde.
