# Inventario: se quita el índice de existencia de Odoo

## Objetivo

El usuario vio que "Índice inicial (Odoo)" salía negativo en casi todos los productos y decidió que el inventario se capture solo a mano.

## Causa de los negativos

`stock.quant` es lo que Odoo mismo tiene por ubicación. Odoo solo recibe las ventas del punto de venta (descuentan solas); las entradas, los envíos planta→tienda y los ajustes por conteo nunca se registraron ahí. Parte de cero y solo resta, así que los productos que más rotan quedan más negativos. No era un error de la consulta (la ubicación se verificó en vivo el 2026-09-28).

## Cambios realizados

- `inventory.service.ts`: se eliminan `findStockLocationId` y `findOdooQuantitiesByProduct`; `findItemsForStore` ya no consulta pos.config, picking types ni stock.quant (menos llamadas a Odoo, carga más rápida).
- `inventory.doc.ts` / `inventory.controller.ts`: se quita `odooQuantity` del contrato y de la descripción de Swagger.
- `odoo.repository.ts`, `odoo.service.ts`, `odoo-entities.types.ts`: se eliminan `findPickingTypes`, `findStockQuants`, `OdooPickingType` y `OdooStockQuant`, que solo usaba Inventario.

## Razones

La fuente de verdad ya era el conteo físico más ventas y movimientos; el índice de Odoo solo confundía. `OdooPosConfig.picking_type_id` se deja (inofensivo, y los mocks lo incluyen).

## Resultado

`npx tsc --noEmit`: solo el error preexistente de `supertest/types`.
