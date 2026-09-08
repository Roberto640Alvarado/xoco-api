# Módulo Odoo: cliente JSON-RPC + entidades de POS

## Objetivo

Construir la integración real con Odoo (JSON-RPC vía `execute_kw`) para
las entidades que el usuario compartió con ejemplos reales de Postman:
producto, categoría, tiendas (pos.config), sesión POS, orden POS, línea de
orden y catálogo de métodos de pago.

## Cambios realizados

- `src/prisma/prisma.service.ts` + `prisma.module.ts` (nuevo): wrapper
  estándar de Nest sobre `PrismaClient` (conecta en `onModuleInit`,
  desconecta en `onModuleDestroy`), `@Global()` para no reimportarlo en
  cada módulo. No existía todavía — hasta ahora solo se usaba el cliente
  crudo en `prisma/seed.mjs`, fuera de la inyección de dependencias de
  Nest.
- `src/odoo/types/odoo-common.types.ts`: `OdooMany2One` (`[id, nombre] |
  false`, el patrón real que devuelve Odoo en todos los campos
  many2one), `OdooCredentials`, `OdooSearchReadOptions`, tipos del sobre
  JSON-RPC (éxito/error).
- `src/odoo/types/odoo-entities.types.ts`: interfaces `OdooProduct`,
  `OdooProductCategory`, `OdooPosConfig`, `OdooPosSession`, `OdooPosOrder`,
  `OdooPosOrderLine`, `OdooPosPaymentMethod` — campos exactamente los que
  el usuario está consultando hoy (no se inventó ningún campo extra).
- `src/odoo/repositories/odoo-config.repository.ts`: único acceso a la
  colección `odoo_config` de Mongo (`findActive()`).
- `src/odoo/repositories/odoo.repository.ts`: único punto que le habla a
  Odoo por HTTP. `executeKw` genérico (arma el sobre JSON-RPC, maneja
  error de red y error de Odoo con `OdooRequestError`) + un método
  `find*` por entidad, cada uno con la lista de `fields` real que se
  compartió.
- `src/odoo/services/odoo.service.ts`: única puerta de entrada al módulo
  para el resto de la app. Resuelve credenciales en cada llamada
  (`ODOO_BASE_URL`/`ODOO_DB` de env, `uid`/`apiKey` de Mongo vía
  `OdooConfigRepository`), valida que el key no esté vencido
  (`ServiceUnavailableException` si falta o venció), traduce
  `OdooRequestError` a `BadGatewayException`.
- `src/odoo/odoo.module.ts`, registrado en `app.module.ts` junto con
  `PrismaModule` (sin tocar `ObserveModule`, que se dejó sin configurar
  por decisión explícita del usuario).
- Fix aparte: `nest-cli.json` no copiaba los archivos generados por
  Prisma (binarios `.node`, `schema.prisma`, runtime) a `dist/` —
  `npm run start:prod` se habría roto en producción. Se agregó `assets`
  en `compilerOptions` para copiar `generated/prisma/**/*` (menos los
  `.ts`) a `dist/generated/prisma`.
- `tsx` agregado como devDependency (para poder correr scripts
  TypeScript sueltos de verificación).

## Verificación

- `npm run build`, `npm run lint` (oxlint) y `npm run test` (vitest): los
  tres en verde.
- Prueba en vivo (bootstrapeando el `AppModule` completo, contra Odoo y
  Mongo reales): `findProducts`, `findPosSessions` y `findPosOrders` con
  filtro `domain: [['session_id', '=', <id>]]` — las tres funcionaron.
  0 órdenes para la sesión más nueva (`CENTRIKA/00000`) es correcto: esa
  sesión está en `opening_control`, todavía no arranca.

## Pendiente

- `pos.payment` (pagos individuales por orden) — el usuario mandó
  `pos.payment.method` (catálogo de métodos) en su lugar; falta
  confirmar si también quiere el modelo de pagos reales.
- No se construyó ningún controller/endpoint HTTP todavía — el módulo
  `Odoo` queda listo para que un futuro módulo `Sales`/`Dashboard` lo
  consuma según se definan los endpoints reales que necesita el
  frontend.
- El proceso de Node no cierra limpio después de un `app.close()` — se
  sospecha de `@nestjs/observe` (retiene una conexión abierta). No se
  investigó a fondo porque el usuario decidió dejar ese módulo sin
  configurar por ahora.
