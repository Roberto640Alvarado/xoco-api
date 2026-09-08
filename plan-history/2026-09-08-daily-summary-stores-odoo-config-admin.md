# Ventas por día, tiendas y administración del API key de Odoo

## Contexto

Siguiente paso tras Auth: exponer lo que el dashboard de `xoco-app` necesita
para las gráficas ("ventas por día") y para que un `SUPER_ADMIN` pueda
gestionar el API key de Odoo (y su duración) desde el panel en vez de solo
por script (`prisma/seed.mjs`).

## Diseño

### `GET /sales/daily-summary`

- `SalesService.resolveSessions()` ahora también guarda la fecha (solo
  `YYYY-MM-DD`, truncada de `start_at`) de cada sesión resuelta.
- `findDailySummary(query)`: arma primero un `Map<fecha, {orderCount, totalRevenue}>`
  con **todas** las fechas del rango en cero (`enumerateDates`), luego trae
  las órdenes no canceladas de esas sesiones y las suma en el bucket de su
  día — así la gráfica nunca tiene huecos en días sin ventas.
- Mismo `@Roles(SUPER_ADMIN, FINANZAS)` heredado del controller.

### `GET /sales/stores`

- Wrapper delgado sobre `OdooService.findPosConfigs({ domain: [['active','=',true]] })`
  — para el selector de tienda del dashboard. Mismos roles que el resto de Sales.

### `GET/PUT /odoo/config` (nuevo, exclusivo `SUPER_ADMIN`)

- `OdooConfigRepository.rotate(data)`: si ya hay una config activa la
  actualiza (rota); si no, crea una — mismo comportamiento que ya tenía
  `prisma/seed.mjs`, ahora reutilizable desde HTTP.
- `OdooConfigService` (nuevo, separado de `OdooService`): `getCurrent()` y
  `rotate()`, ambos devuelven `OdooConfigResponseDoc` con el API key
  **enmascarado** (`maskApiKey`: primeros 4 + últimos 4 caracteres) — nunca
  se vuelve a exponer el key completo, ni siquiera al SUPER_ADMIN que lo
  consulta después de haberlo escrito.
- `OdooConfigController` — `@Roles(Role.SUPER_ADMIN)` a nivel de controller
  (más estricto que Sales, que también permite FINANZAS). Registrado en
  `OdooModule` (que hasta ahora no tenía controllers, solo exportaba
  `OdooService`).

## Verificación en vivo

Con el servidor real corriendo (Mongo Atlas + Odoo reales, dentro de una
sola invocación de shell):

- `GET /sales/stores` → las 4 tiendas reales (CENTRIKA, San Benito, Sucursal
  Escalón, Tienda Ramblas).
- `GET /sales/daily-summary?dateFrom=2026-08-29&dateTo=2026-09-02` → 5 puntos,
  uno por día, con órdenes/ingresos reales (ningún día en cero en este rango).
- `GET /odoo/config` → key enmascarada, `expiresAt` correcto.
- `PUT /odoo/config` con la misma key real (para no romper la config viva) →
  200, `expiresAt` recalculado.
- Confirmado que Odoo sigue respondiendo (`/sales/stores` de nuevo) después
  de rotar — la rotación no dejó la integración en un estado roto.

`npm run build` y `npm run lint` — 0 errores.

## Pendiente

- Sigue sin existir un usuario `FINANZAS` real para probar en vivo la
  diferencia de permisos entre `/sales/*` (ambos roles) y `/odoo/config`
  (solo SUPER_ADMIN se probó realmente — FINANZAS debería recibir 403 por
  `RolesGuard`, pero no hay cuenta para confirmarlo en vivo).
- No hay historial de keys viejas de Odoo (rotar sobrescribe el único
  documento) — sigue siendo el TODO ya anotado en `schema.prisma`.
