# Goals: "Meta del mes" se encadena sobre la meta del mes anterior, no sobre lo real

## Contexto

El usuario corrigió la fórmula de "Meta del mes" implementada en `2026-09-09-goals-meta-derivada-de-porcentaje-crecimiento.md`. Ahí se calculaba `targetOrders(mes N) = previousMonthActualOrders(N-1) * (1 + growthPercent(N))` — es decir, sobre el total REAL de órdenes del mes anterior.

El usuario aclaró que la fórmula correcta es otra: `Meta del mes = (Total META del mes anterior * meta%) + Total META del mes anterior`, o sea `targetOrders(N) = targetOrders(N-1) * (1 + growthPercent(N))` — encadenada sobre la META del mes anterior, no sobre lo real. Palabras del usuario: "por eso que siempre se pedirá que el anterior mes esté configurado creo", reconociendo que esto crea una dependencia en cadena hacia atrás.

## Diseño

- `GoalsRepository.findManyForStores(posConfigIds)` (nuevo): trae el historial COMPLETO de `StoreGoal` de las tiendas dadas (todos los años/meses guardados), no solo el mes pedido — la cadena puede necesitar mirar varios meses hacia atrás.
- `GoalsService.resolveTargetOrders(posConfigId, year, month, ...)` (nuevo, recursivo y memoizado con un `Map` por llamada a `getSummary`): para calcular la meta de un mes, primero resuelve la meta del mes anterior (recursión), y la usa como base: `round(metaMesAnterior * (1 + %crecimiento del mes))`.
  - Si el mes pedido no tiene `growthPercent` guardado, `targetOrders` es `null` (igual que antes — sin % configurado no hay meta).
  - Si la cadena hacia atrás llega a un mes sin % configurado (la meta de ese mes es `null`), se usa como base el total REAL de órdenes de ese mes (vía `SalesService.findDailySummary`) — mismo mecanismo de "ancla" que tenía el Excel original con su celda de meta base fija. Esto evita que la cadena quede permanentemente rota por no tener un mes semilla.
  - Tope de seguridad de 24 meses de recursión hacia atrás (`MAX_CHAIN_DEPTH`) por si hay un bug de datos — no es un límite funcional esperado, solo evita una recursión larga; si se llega a topar, corta usando lo real del mes anterior como base y deja un `logger.warn`.
- `getActualOrdersForMonth()` (nuevo, cacheado por `(tienda, año, mes)` dentro de una sola llamada a `getSummary`): reemplaza el cálculo directo de `previousMonthActualOrders` y sirve también como fallback de la cadena, evitando pedirle a Odoo el mismo mes dos veces.
- `previousMonthActualOrders` se mantiene en la respuesta (informativo, ya no se usa para calcular `targetOrders`).
- Nada cambia en `xoco-app`: `targetOrders` sigue siendo el mismo campo/forma en `GoalSummaryItemDoc`, solo cambia su cálculo del lado del servidor.

## Verificación

- `npm run build` y `npm run lint`: limpios.
- Verificación funcional directa contra Mongo/Odoo reales (instanciando `AppModule` con `NestFactory.createApplicationContext`, sin pasar por HTTP/auth):
  - Con julio 2026 configurado al 8% para las 4 tiendas y agosto/septiembre sin configurar: julio se resolvió correctamente contra lo real de junio (ancla, ya que junio no tiene % guardado) — ej. Sucursal Escalon: `targetOrders julio = 636` (589 real de junio * 1.08 redondeado).
  - Prueba del encadenado real: se insertó temporalmente un 5% para agosto en Sucursal Escalon (`posConfigId=4`) y se pidió `getSummary(2026, 8)`. Resultado: `targetOrders = 668`, que es exactamente `round(636 * 1.05)` — la meta de julio (636), NO lo real de julio (567, que habría dado 595 con la fórmula vieja). Confirma que ahora se encadena sobre la meta anterior y no sobre lo real. Dato de prueba borrado de Mongo al terminar.

## Pendiente

- Nada pendiente del lado del backend. Sigue abierto (no relacionado a este fix) el tema de deploy en Render reportado antes (`GET /goals/summary` y `PUT /goals` devolviendo 404 en producción) — el usuario no ha confirmado si ya lo resolvió.
