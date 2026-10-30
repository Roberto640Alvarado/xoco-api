# Solicitudes: sustitutos de planta y Planta ve el inventario

## Objetivo
Pedido de Don Mario: que Despacho (Planta) vea el inventario de cada tienda, pueda agregar otros productos y, cuando no hay lo pedido, mandar otro en su lugar (ej. tiramisú → brownie) con un comentario a la par ("no hay", "no sé", etc.).

## Cambios realizados
- `StockRequestLine.replacesProductId Int?`: en una línea agregada por planta, el producto PEDIDO al que sustituye.
- `PlantLineInputDto.replacesProductId` (opcional). `StockRequestsService` lo guarda solo en líneas agregadas y valida que apunte a un producto que la tienda pidió en esa solicitud (`assertReplacements`). `StockRequestLineDoc` lo expone.
- Planta lee el stock: `GET /inventory/stores/:id/items` acepta `PLANTA` (método), `GET /sales/stores` también. El Registro (`/ledger`) y el Conteo (`PUT`) siguen sin Planta.
- `MODULE_KEY_CEILING['dashboard.inventario']` (y `backfill-role-module-access.mjs`) incluye `PLANTA`.
- Tests: sustituto válido y rechazos (apunta a algo no pedido / línea pedida con replaces). Mocks de Vendedor con `inventoryEnabled`.

## Razones del cambio
El comentario por línea y los agregados ya existían; faltaba ligar el sustituto al original para que la tienda, el PDF y el seguimiento digan "en lugar de", y darle a Planta visibilidad del stock para decidir qué mandar.

## Resultado final
`tsc` y oxlint sin errores, 104 tests en verde.

## Ajuste: el Admin también pide stock
- `POST /inventory/requests` y `GET .../catalog` aceptan SUPER_ADMIN. `CreateStockRequestDto.posConfigId` (obligatorio para el Admin, validado contra las tiendas activas de Odoo; para el Vendedor se ignora y se usa su tienda). Tests nuevos.

## Ajuste: solicitudes entre tiendas
- `StoreStockRequest.sourcePosConfigId` (null = planta). `CreateStockRequestDto.sourcePosConfigId`: otra tienda real, distinta de la que pide y con Inventario habilitado. `GET /inventory/requests/sources`.
- Quien surte (`isSupplier`): planta en las de planta; los Vendedores de la tienda origen en las de entre tiendas (start/response/dispatch aceptan VENDEDOR). Planta no ve las de entre tiendas; el Vendedor ve las que pide y las que le piden; avisos = por confirmar + por responder.
- Al despachar entre tiendas se crean movimientos `TRASLADO` CONFIRMADOS en la tienda origen (nuevo tipo en `InventoryMovementType` y en el Registro/Kardex). La recepción sigue creando la ENTRADA en la que pide. Una despachada entre tiendas no se puede cancelar.
- Las listas/bandeja de movimientos manuales filtran MERMA/REGALIA/DEGUSTACION (ya no "todo menos ENTRADA"). Tests nuevos.
