# Schema inicial (User/OdooConfig), fix de Prisma+Mongo, y seed de SUPER_ADMIN + config de Odoo

## Objetivo

Dejar el proyecto verificado de punta a punta (build/lint/test + conexión
real a Mongo) y crear los dos registros iniciales que pidió el usuario:
el usuario SUPER_ADMIN y el documento de configuración del API key de Odoo
(con 30 días de duración).

## Cambios realizados

- **Fix crítico de Prisma**: el scaffold de `nest new` había quedado en
  Prisma 7 (`prisma@8.0.0-rc.13` + `@prisma/client@7.10.0`, ya alineados a
  7.10.0 en la ronda anterior). Al intentar conectar, Prisma 7 exige un
  "driver adapter" obligatorio, y el adapter de MongoDB
  (`@prisma/orm-mongo`) solo existe en release candidate de Prisma 8 — no
  hay ninguna versión estable de Prisma 7/8 que soporte Mongo sin RC. Se
  bajó todo a `prisma@6.19.3` / `@prisma/client@6.19.3` (última estable de
  la serie 6, que sigue soportando Mongo con el motor clásico, igual que
  `ecoguide-api`). Se restauró `url = env("DATABASE_URL")` directo en
  `schema.prisma` y se eliminó `prisma7.config.ts` (ya no aplica).
- Se agregaron los modelos `User` (email único, password hasheado, role
  `SUPER_ADMIN`/`FINANZAS`, isActive) y `OdooConfig` (apiKey, uid,
  durationDays, expiresAt, isActive) al `schema.prisma`.
- `npx prisma db push` — se crearon las colecciones `users` y
  `odoo_config` (+ índice único de email) en el cluster real de Atlas.
- Variables de entorno: `PORT` a `4005` (para correr junto a
  `ecoguide-api` sin chocar en el 3000), se agregó `ODOO_BASE_URL`
  (`https://xocolatisimo.odoo.com/jsonrpc`) y `ODOO_UID` (`7` — lo exige
  `execute_kw` junto con el API key). `API_KEY_ODOO` se dejó como variable
  transitoria: el seed la lee una sola vez para crear el documento en
  Mongo; después de correrlo se puede borrar de `.env`.
- Nuevo `prisma/seed.mjs`, ejecutable con `npm run db:seed`:
  - Crea (o rota, si ya existe) el `odoo_config` con el API key, `uid` y
    duración de 30 días, calculando `expiresAt`.
  - Crea el usuario `SUPER_ADMIN` (`xocoprojectsv@gmail.com`) con una
    contraseña generada al azar (o la que se pase por
    `SEED_SUPERADMIN_PASSWORD`), hasheada con bcrypt, impresa una sola vez
    en consola. Es idempotente: si el usuario ya existe no le toca la
    contraseña.
- `.npmrc` con `legacy-peer-deps=true` (ya existía de la ronda anterior,
  se mantiene).

## Verificación

- Conexión real a MongoDB Atlas probada con `$runCommandRaw({ ping: 1 })`
  antes de crear el schema — `{"ok":1}`.
- `npm run db:seed` corrido contra la base real: `odoo_config` y el
  usuario `SUPER_ADMIN` confirmados con una consulta de verificación
  aparte.
- `npm run build`, `npm run lint` (oxlint) y `npm run test` (vitest): los
  tres en verde, 0 errores.

## Resultado final

Proyecto conectado de verdad a Mongo Atlas, con el usuario SUPER_ADMIN y
la config de Odoo ya sembrados en la base. Pendiente: estructura final de
`OdooConfig` sujeta a cambio (el usuario indicó que definirá el resto de
la integración con Odoo más adelante), y construir el módulo `Auth`
(login/JWT) que hoy en día no existe todavía como código — solo el
usuario en base.
