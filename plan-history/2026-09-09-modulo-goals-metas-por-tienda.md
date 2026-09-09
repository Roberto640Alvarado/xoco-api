# Módulo Goals: metas mensuales de visitas por tienda

## Contexto

A partir de "Dashboard Mercadeo.xlsx" (hoja "Trafico de tiendas "), el usuario pidió llevar a la web la mecánica de metas de crecimiento mensual que hoy se lleva a mano en Excel, integrada a "Visitas" (que ya se mide como cantidad de órdenes — ver `2026-09-08-secciones-visitas-y-productos.md` de xoco-app y la confirmación del usuario: "Visitas = Ordenes = Trafico").

Del Excel se reconstruyeron las fórmulas reales: `Meta(mes N) = Meta(mes N-1) × 1.08` (una excepción histórica usó ×1.10) y `Alcance = Real / Meta` — igual en "Trafico de tiendas " y en "Venta Mensual", confirmando que el 8% es una convención de crecimiento mensual del negocio, no algo exclusivo de tráfico. La hoja "Trafico Diario" resultó ser simplemente el mismo conteo de órdenes por tienda que ya trae Odoo (tecleado a mano hoy), no un contador de personas separado — así que no hace falta ninguna fuente de datos nueva para el conteo, solo para la meta.

Reglas confirmadas con el usuario (`AskUserQuestion`, 4 preguntas):
1. La meta se sigue capturando manualmente cada mes (no se automatiza el ×1.08 — el usuario decide la meta de cada mes).
2. Se quiere una proyección de cierre de mes real por ritmo diario (el Excel original tenía una fórmula de "proyección" que en realidad no proyectaba nada — `=(O11/31)*31` se simplifica al mismo valor).
3. Tanto SUPER_ADMIN como FINANZAS pueden ver y editar metas (mismo criterio que Sales).
4. La sección sigue llamándose "Visitas" en el panel (no "Tráfico de Tiendas").

## Diseño

Nuevo modelo `StoreGoal` en `prisma/schema.prisma`: un documento por `posConfigId` + `year` + `month` (índice único compuesto — `db push` lo aplicó como índice real en Mongo), con `targetOrders`. No se guarda nada calculado (Alcance, proyección) — todo eso se calcula al vuelo contra Odoo en cada request a `/goals/summary`, igual que hace `SalesService` para el resto del dashboard.

Nuevo módulo `Goals` (mismo patrón repository/service/controller/dto/doc que `Odoo`/`Sales`):
- `GoalsRepository`: `findManyForMonth(year, month)` y `upsert()` (usa el índice único compuesto — `prisma.storeGoal.upsert` nativo, no un findFirst+create/update manual).
- `GoalsService.upsert(dto)`: `PUT /goals`, registra o sobreescribe la meta de una tienda/mes.
- `GoalsService.getSummary({year, month})`: `GET /goals/summary` — trae las tiendas activas (`SalesService.findStores`, reexportado desde `SalesModule` para poder inyectarlo aquí) y las metas guardadas de ese mes, y para cada tienda:
  - `actualOrders`: suma de `orderCount` de `SalesService.findDailySummary({dateFrom: día 1, dateTo, posConfigId})` — mismo agregado que usa Visitas (y que se acaba de corregir en el fix de paginación de la sesión, `2026-09-09-fix-truncacion-agregados-internos-sales.md`), así que hereda ese fix automáticamente.
  - En el **mes en curso**, `dateTo` es **ayer** (mismo criterio que "Fecha actualización" = `TODAY()-1` del Excel — hoy no ha cerrado). Si hoy es día 1 del mes, no hay ningún día transcurrido todavía (`daysElapsed = 0`, `actualOrders = 0`, sin llamar a Odoo).
  - En un **mes ya cerrado**, `dateTo` es el último día de ese mes (mes completo).
  - `reachPercent = actualOrders / targetOrders` (Alcance, igual que el Excel) — `null` si la tienda no tiene meta guardada ese mes.
  - `projectedOrders`: en el mes en curso, `(actualOrders / daysElapsed) * daysInMonth` redondeado (proyección real por ritmo diario, a diferencia de la fórmula del Excel que no proyectaba nada); en un mes cerrado, es simplemente `actualOrders` (no hay nada que extrapolar).
  - `projectedReachPercent = projectedOrders / targetOrders`.
- `GoalsController`: `@Roles(SUPER_ADMIN, FINANZAS)` en ambos endpoints (`GET /goals/summary?year=&month=`, `PUT /goals`), igual que `SalesController`.
- `SalesModule` ahora exporta `SalesService` (antes solo lo usaba internamente) para que `GoalsModule` pueda inyectarlo.

## Verificación

- `npm run build` y `npm run lint` (oxlint): limpios, 0 errores/warnings.
- Verificación funcional real: se creó un usuario de prueba temporal (borrado al terminar), se levantó `dist/main.js` contra Mongo/Odoo reales dentro de una sola invocación de shell, y se probaron ambos endpoints con curl:
  - `PUT /goals` con `posConfigId=1` (CENTRIKA), mes en curso, `targetOrders=2000` → 200, documento creado correctamente.
  - `GET /goals/summary` del mes en curso → Alcance y proyección calculados correctamente para las 4 tiendas (ej. CENTRIKA: 140 órdenes reales en 8 días transcurridos → proyección de 525 para el mes completo de 30 días).
  - `GET /goals/summary` de un mes ya cerrado (agosto 2026) → `actualOrders` = total real del mes completo, `projectedOrders` igual a `actualOrders` (sin extrapolar), `isCurrentMonth: false`.
- La meta y el usuario de prueba se borraron de Mongo al terminar (no queda ningún dato de prueba en la base real).

## Pendiente

- Nada pendiente del alcance aprobado. La UI correspondiente se agregó en `xoco-app` (ver su propio plan-history) en la página de Visitas.
