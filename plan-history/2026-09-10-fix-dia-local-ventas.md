# Fix: las ventas se agrupan por día local de la tienda, no por fecha de sesión

## Contexto

El usuario reportó que `Tienda Ramblas` salía en CERO el domingo 7 de septiembre de 2026, mientras que el PDF "Detalles de ventas" que genera Odoo para esa tienda y ese día sí reportaba ventas ($200.21, 49 unidades).

Consultando Odoo real se encontraron **dos problemas que se sumaban**:

1. **Sesiones que no cierran cada noche.** La sesión `POS/01268` de Ramblas abrió el `2026-09-06 23:21:20` (UTC) y no cerró hasta el `2026-09-08 15:10:29` — ~40 horas, cubriendo el domingo 7 completo. Como `resolveSessions()` buscaba sesiones con `start_at` dentro del día pedido y de ahí sacaba las órdenes, el 7 de septiembre no encontraba NINGUNA sesión y devolvía la lista vacía antes siquiera de consultar `pos.order`. Las 13 ventas reales del día quedaron contadas dentro del 6 de septiembre. Las otras 3 tiendas sí cerraban caja a diario, por eso solo Ramblas salía en cero.

2. **Nunca se convertía la zona horaria.** Odoo guarda y devuelve los datetimes en UTC (naive: `"2026-09-08 01:04:31"`) y los presenta en la zona del usuario. La app cortaba el string UTC tal cual (`toDateOnly()`), así que con El Salvador en UTC-6 todo lo vendido entre las 18:00 y la medianoche local se contabilizaba al día siguiente.

Comprobación contra el PDF (Ramblas, 07/09/2026):

| Método | Órdenes | Total |
|---|---|---|
| Fecha de sesión, UTC (el anterior) | 0 | $0.00 |
| `date_order` cortado en UTC | 12 | $158.21 |
| **Día local de `date_order` (UTC-6)** | **13** | **$200.21** ✅ |

La orden que hace la diferencia es `Ramblas/5735`, con `date_order` = `2026-09-08 01:04:31` UTC = **19:04 del día 7** en hora local. El PDF la incluye.

## Diseño

**Nuevo criterio, uniforme en todo el módulo**: una orden pertenece al día en que se cobró **en hora local de la tienda**, que es exactamente lo que hacen los reportes propios de Odoo. Ya no se usan las sesiones POS para decidir a qué día pertenece una venta.

**`src/common/utils/store-date.util.ts`** (nuevo): concentra la conversión.

- `toStoreDate(utc)`: `"2026-09-08 01:04:31"` → `"2026-09-07"`.
- `storeDayRangeToUtc(from, to)`: rango de días locales → la ventana UTC que los cubre completos. El `2026-09-07` local va de `"2026-09-07 06:00:00"` a `"2026-09-08 05:59:59"` UTC.
- `shiftDate()` / `enumerateDates()`: se movieron aquí desde `sales.service.ts`.

El offset es una constante fija de **UTC-6**, no una zona IANA: El Salvador no aplica horario de verano desde 1983, así que un offset fijo es correcto y no depende de la tabla de zonas del runtime. Queda anotado en el archivo que si algún día la operación se extiende a un país con DST, esto tiene que pasar a `Intl` con `timeZone`, no a otro offset fijo. Tampoco se puso en una variable de entorno a propósito: un valor mal configurado correría silenciosamente TODOS los reportes.

**`SalesService`**: se eliminó `resolveSessions()` del camino principal y se reemplazó por `buildOrdersDomain(dateFrom, dateTo, posConfigId?, { excludeCancelled? })`, que arma un domain de `pos.order` directo sobre `date_order` + `config_id`. Efectos:

- `findOrders`, `findTopProducts` y `findDailySummary` pasaron de 2 pasos (resolver sesiones → traer órdenes de esas sesiones) a 1 solo. Menos llamadas a Odoo y menos código.
- La tienda y la sesión de cada orden ahora salen de los propios many2one de la orden (`config_id`, `session_id`), sin tener que cruzar contra un mapa de sesiones.
- `SalesOrderDoc` gana el campo **`date`** (YYYY-MM-DD, día local al que pertenece la venta). `dateOrder` se mantiene igual que antes: el valor crudo de Odoo, en UTC. Es aditivo, no rompe al frontend.

**`OdooRepository.findPosOrders`**: se agregó `config_id` a los `fields` de `pos.order` (es un related de `session_id.config_id`, pero se consulta directo para poder filtrar y agrupar por tienda sin resolver sesiones). Se reflejó en `OdooPosOrder`.

**`GET /sales/reconciliation`**: sigue existiendo, pero ahora compara el método NUEVO contra el ANTERIOR (antes comparaba fecha de sesión vs. `date_order` en UTC). Renombres en la respuesta: `byOrderDateMethod` → `byStoreDayMethod` (el oficial ahora), `includedByOrderDateMethod` → `includedByStoreDayMethod`, y `ReconciliationOrderDoc` gana `storeDate`; `sessionDate` pasa a ser nullable (la sesión pudo abrir fuera de la ventana revisada). `orderCountDifference` ahora es `byStoreDayMethod - bySessionMethod`. Se renombró sin ceremonia porque este endpoint es una herramienta de Postman, no tiene UI en xoco-app. El margen de la ventana ampliada subió de 1 a 2 días, justamente porque una sesión puede quedarse abierta más de 24 horas.

**Módulos que heredan el fix sin tocarse**: `Goals`, `SalesGoals` y `TicketGoals` consumen `SalesService.findDailySummary()`, así que sus metas y porcentajes pasan a usar el mismo criterio automáticamente.

## Verificación

**Tests nuevos** (`npm test`: 19 pasando):

- `src/common/tests/store-date.util.spec.ts` — conversión en ambos sentidos, incluidos los bordes exactos del día local (`05:59:59` vs `06:00:00`) y cruces de mes/año.
- `src/sales/tests/sales.service.spec.ts` — con mocks de `OdooService` (`src/sales/tests/mocks/`) cargados con los datos REALES de Ramblas del 7 de septiembre. Cubre: el día cuadra en 13/$200.21, el domain que se le manda a Odoo es la ventana UTC correcta, las órdenes de días vecinos no se cuelan, ya no se consultan sesiones, la paginación, y la comparación de reconciliation.

**Contra Odoo real**: se levantó un `NestFactory.createApplicationContext()` temporal y se llamaron los métodos de verdad (script borrado después). Resultados del 07/09/2026:

| Tienda | Órdenes | Venta |
|---|---|---|
| CENTRIKA | 15 | $478.29 |
| San Benito | 28 | $464.52 |
| Sucursal Escalon | 7 | $76.00 |
| **Tienda Ramblas** | **13** | **$200.21** |

Ramblas cuadra al centavo con el PDF. Las otras tres dan exactamente lo mismo que daba el método anterior — o sea, el cambio arregla los días rotos sin mover los que ya estaban bien. El resumen del 01 al 09 de septiembre no tiene ningún día en cero.

## Notas

- El IVA agregado del día da $23.03 y el PDF dice $23.06 (3 centavos). Es redondeo del propio reporte de Odoo, que suma impuestos por categoría de producto; los totales de venta sí cuadran exactos.
- `GET /sales/orders` sigue incluyendo las órdenes canceladas en la lista (el 7 de septiembre devuelve `total: 15` = 13 ventas + 2 canceladas), igual que antes del cambio. Los agregados (`daily-summary`, `top-products`) sí las excluyen. Si se quiere que la lista también las filtre, es otra decisión.
- Los montos de `top-products` van CON IVA (`price_subtotal_incl`), mientras el PDF de Odoo los lista sin IVA — diferencia previa y ya decidida, ver plan-history "iva-de-ventas-y-orden-ranking-productos". Las cantidades en unidades sí coinciden exacto con el PDF.
- Los huecos de julio contra el Excel que quedaron sin explicar en plan-history "reconciliacion-visitas" podrían deberse a esto mismo (el Excel se llenó con fechas locales). Vale la pena volver a correr esa comparación ahora.
