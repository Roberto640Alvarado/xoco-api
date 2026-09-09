# Goals: la meta se deriva de un % de crecimiento, no de un número fijo

## Contexto

El usuario mandó una captura de la hoja "Trafico de tiendas " del Excel original y pidió corregir el módulo Goals para que replique esa tabla exactamente (mismos encabezados: "Visitas a la fecha", "Meta del mes", "Alcance", "Visitas faltantes a la fecha", "Visitas Diarias Necesarias", "Proyección cierre de mes", "%"), y aclaró la fórmula real de "Meta del mes": `(Total del mes anterior * meta%) + Total del mes anterior` — es decir, la meta ya NO se captura como un número absoluto (como se había implementado en `2026-09-09-modulo-goals-metas-por-tienda.md`), sino que se deriva cada mes del total REAL de órdenes del mes anterior más un % de crecimiento que el usuario captura.

También aclaró que quiere poder elegir, mes a mes, si aplica el mismo % a todas las tiendas o uno distinto por tienda (eso se resuelve en la UI de xoco-app, ver su propio plan-history) — y que "Visitas Diarias Necesarias" es, tal como está en el Excel, el mismo valor que "Visitas faltantes a la fecha" (no una división por días restantes).

## Diseño

- `StoreGoal.targetOrders` (Int) se reemplaza por `StoreGoal.growthPercent` (Float, fracción — `0.08` = 8%). Mismo índice único `posConfigId+year+month`. Se sigue guardando SOLO el %, nunca la meta calculada — "Meta del mes" se deriva siempre al vuelo.
- `PUT /goals` cambia de "una tienda a la vez" a un lote (`UpsertGoalsBulkDto`: `year`, `month`, `entries: [{posConfigId, growthPercent}]`) — así el modal de la UI puede mandar de una vez tanto "mismo % para todas" (una entrada por tienda, todas con el mismo valor) como "% distinto por tienda" (cada una con su propio valor), sin necesitar dos endpoints distintos.
- `GoalsService.getSummary` ahora pide a `SalesService.findDailySummary` DOS rangos por tienda (en paralelo): el mes actual (con el mismo recorte "hasta ayer" de siempre) y el mes ANTERIOR completo. `targetOrders = round(previousMonthActualOrders * (1 + growthPercent))`, `null` si la tienda no tiene % guardado ese mes. El resto de las columnas se derivan de ahí: `reachPercent` (Alcance), `missingOrders` (Visitas faltantes a la fecha = meta - real), `dailyNeededOrders` (mismo valor que `missingOrders`, por instrucción explícita del usuario), `projectedOrders`/`projectedReachPercent` (proyección por ritmo diario, sin cambios respecto a la versión anterior).
- `GoalsController`: se quita `UpsertGoalDto` (single), se agrega `UpsertGoalsBulkDto`. Mismos roles (`SUPER_ADMIN`, `FINANZAS`) en ambos endpoints.

## Verificación

- `npm run build` y `npm run lint`: limpios.
- Verificación funcional real (usuario de prueba temporal, borrado al terminar): `PUT /goals` con 8% para 3 tiendas y 5% para una, mes en curso → `GET /goals/summary` devolvió, por ejemplo, CENTRIKA con `previousMonthActualOrders: 487` (agosto real) → `targetOrders: 526` (487*1.08 redondeado) → `missingOrders`/`dailyNeededOrders: 386` (526-140) → `projectedOrders: 525` (140/8*30) — todo cuadra con la fórmula pedida. Tienda Ramblas con 5% dio `targetOrders: 615` (586*1.05 redondeado), confirmando que el % se aplica por tienda correctamente cuando es distinto.
- Meta y usuario de prueba borrados de Mongo al terminar.

## Pendiente

- Nada pendiente del lado del backend. La UI (nuevo módulo "Tráfico de tiendas", modal de configuración de %, tabla con los encabezados exactos del Excel) se hizo en `xoco-app` — ver su propio plan-history.
