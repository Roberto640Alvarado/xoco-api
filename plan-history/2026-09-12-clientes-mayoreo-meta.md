# Ventas Mayoreo: resumen por cliente (Selectos / Operadora del Sur) con Meta y desglose por comprador

## Objetivo

Feedback del negocio: "¿y si se puede hacer un resumen donde se vea lo
facturado con Selectos y Operadora del Sur colocando Meta? ¿Y si también
puedo ver por sus clientes o los compradores?" — con la observación de
que debía ir en un módulo nuevo.

Antes de implementar se investigó DIRECTO contra Odoo (script de solo
lectura, sin modificar nada — ver Investigación abajo) en vez de adivinar
la estructura, porque "revisa dónde pudiera estar esto" pedía
explícitamente comprobarlo.

## Investigación (Odoo, solo lectura)

- **Selectos** no existe como partner con ese nombre — la cadena de
  supermercados factura bajo la razón social **"Calleja S.A. de C.V."**
  (`commercial_partner_id` = 2306 en este Odoo). Sus facturas van a
  distintos `partner_id` HIJOS de esa razón social, uno por
  sucursal/comprador (ej. "Calleja S.A. de C.V., Super Selectos Valle
  Dulce El Encuentro - 251") — **40 sucursales distintas** encontradas.
- **Operadora del Sur, S.A. de C.V.** (`commercial_partner_id` = 2366)
  factura directo a su propia razón social, SIN sub-contactos — un solo
  `partner_id`.
- Esto confirma que `commercial_partner_id` es el campo correcto para
  identificar "el cliente" y `partner_id` el correcto para "el comprador
  puntual" que pidió el negocio — no hay forma de resolver esto por
  nombre (la razón social de Selectos no contiene la palabra "Selectos").

## Cambios realizados

- `prisma/schema.prisma`: nuevo modelo `WholesaleClientGoal` (`clientKey`
  + `year` + `month` + `growthPercent`, índice único compuesto) — mismo
  mecanismo que `StoreSalesGoal` pero por cliente de mayoreo en vez de
  tienda. Aplicado con `npx prisma db push` (aditivo: solo crea la
  colección `wholesale_client_goals` y su índice, no toca nada existente).
- `src/sales/constants/wholesale-clients.const.ts` (NUEVO): lista FIJA y
  curada de los 2 clientes (`key`, `label`, `commercialPartnerId`), con
  los ids resueltos arriba documentados en el comentario — si Odoo
  recrea alguno de estos partners hay que actualizar el id acá.
- `OdooAccountMove`/`OdooAccountMoveGroup` (tipos) y
  `OdooRepository.findAccountMoves`: se agregó `partner_id` y
  `commercial_partner_id` a los campos consultados.
- `src/sales/services/wholesale-client-totals.service.ts` (NUEVO):
  `findTotalsByClient()` — un solo `read_group` de `account.move`
  agrupado por (`commercial_partner_id`, `partner_id`), filtrado a los
  2 clientes configurados. Mucho más simple que
  `StoreInvoiceTotalsService`: acá no hace falta resolver diario/vendedor
  porque `commercial_partner_id` YA identifica al cliente directo en la
  factura. Todos los clientes configurados aparecen, en cero si no
  facturaron; cada uno trae su `buyers[]` (compradores) ordenado por
  venta descendente.
- `sales.controller.ts`: `GET /sales/by-wholesale-client` (mismo domain
  de facturas que `/sales/by-store` y `/sales/by-salesperson` —
  `buildCustomerInvoiceDomain`).
- Módulo nuevo `src/wholesale-goals/` (mismo diseño que `src/sales-goals/`
  — "Venta Mensual" — pero `clientKey` en vez de `posConfigId`):
  - `WholesaleGoalsRepository` (Prisma, colección `wholesale_client_goals`).
  - `WholesaleGoalsService.getSummary()`: mismo mecanismo de "Meta"
    encadenada mes a mes (`meta(mes N) = meta(mes N-1) * (1 + %)`,
    `MAX_CHAIN_DEPTH = 24`, "hasta ayer" en el mes en curso) que
    `SalesGoalsService`, pero la venta real sale de
    `WholesaleClientTotalsService` en vez de `StoreInvoiceTotalsService`.
  - `GET /wholesale-goals/clients` (lista para el frontend),
    `GET /wholesale-goals/summary?year=&month=`,
    `PUT /wholesale-goals` (lote, mismo shape que `PUT /sales-goals`).
  - Roles `SUPER_ADMIN`/`FINANZAS` — mismo criterio que `Sales`/`SalesGoals`.
- Tests nuevos: `wholesale-client-totals.service.spec.ts` (agrupación por
  comprador, clientes en cero sin facturas, domain correcto). 46/46 tests
  pasan. `WholesaleGoalsService` (la cadena de metas) queda sin tests
  propios — mismo criterio que `GoalsService`/`SalesGoalsService`/
  `TicketGoalsService`, ninguno de los 3 tiene tests de la cadena en este
  repo.

## Razones del cambio

- Módulo separado (no otro reporte dentro de Ventas/Productos) porque el
  negocio lo pidió explícitamente y porque el mecanismo de "Meta" es
  conceptualmente el mismo que Venta Mensual pero sobre una dimensión
  distinta (cliente de mayoreo, no tienda) — separarlo evita mezclar dos
  cosas que se leen distinto (una tienda no tiene "compradores").
- Se reusó al 100% el mecanismo de metas encadenadas de `SalesGoalsService`
  en vez de inventar uno nuevo — es exactamente el mismo problema
  (¿cuánto vale la meta de este mes si no se configuró un % para él?)
  resuelto ya para tiendas.
- La lista de clientes es FIJA (no "todos los partners de Odoo") porque
  el negocio nombró estos dos puntualmente — agregar un tercero más
  adelante es una línea en `WHOLESALE_CLIENTS`, no un rediseño.

## Resultado final

`npx vitest run`: 46/46 OK (corrido en copia aislada del repo — mismo
motivo de siempre con los bindings nativos del VM del puente).
`npx tsc --noEmit` y `oxlint` sin errores. `npx prisma db push` aplicado
contra la base real (aditivo únicamente). Endpoints nuevos documentados
en Swagger vía `@ApiOperation`.

Frontend: ver plan-history de `xoco-app` (mismo nombre de archivo) para
el módulo nuevo `/dashboard/ventas-mayoreo`.
