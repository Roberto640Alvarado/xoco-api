# Fix: los agregados internos de Sales se truncaban en rangos con muchos datos

## Contexto

El usuario reportó que en "Visitas" el filtro de "90 días" solo mostraba datos reales desde el ~15-16 de agosto en adelante — todo el rango de mediados de junio a mediados de agosto aparecía en cero, con la duda de si era un bug del filtro o si Odoo estaba borrando/no reteniendo datos viejos.

## Diagnóstico

Se investigó directo contra Odoo (vía un script puntual, sin tocar la app) para descartar de entrada el lado de los datos: `pos.session` tiene sesiones desde julio 2025 (mucho antes del rango en cuestión) y, solo en la ventana junio-agosto 2026, hay 326 sesiones y ~7,700 `pos.order`. Los datos existen en Odoo — Odoo no está purgando ni reteniendo menos de lo esperado.

El bug estaba en `SalesService`: `findDailySummary` y `findTopProducts` traían las órdenes/líneas de las sesiones resueltas con un solo `search_read` de límite fijo (`INTERNAL_FETCH_CAP = 2000`, sin `offset`), asumiendo (comentario original) que "con 4 tiendas y rangos de fecha razonables no debería acercarse a este número". Con 4 tiendas activas y un rango de 90 días, el total de órdenes ya pasa los 7,000 — muy por encima del límite de 2,000. Como la llamada no pasaba un `order` explícito, Odoo devolvía sus resultados en el orden por defecto del modelo `pos.order` (más reciente primero), así que los primeros 2,000 registros devueltos eran justo los de los últimos ~24 días del rango — y el resto (los días más viejos) se descartaba en silencio. Por eso la gráfica mostraba ceros exactamente en la parte vieja del rango y datos reales solo desde donde el corte de 2,000 empezaba a alcanzar.

Se confirmó reproduciendo la misma consulta que hace `findDailySummary` (mismo domain, mismo límite, sin `order`): el batch devuelto cubría únicamente `2026-08-16` a `2026-09-09`, calzando con lo que el usuario vio en pantalla.

## Fix

Se reemplazó todo fetch interno de "traer todo lo que matchea" (sesiones del rango, órdenes de esas sesiones, líneas de esas órdenes) por un helper privado `fetchAllPages()` que pagina de verdad con `offset`, en páginas de 1,000, hasta que Odoo devuelve menos de una página completa. Se mantiene un tope de seguridad (`INTERNAL_FETCH_HARD_CAP = 50,000`) solo para evitar un loop infinito o un volumen absurdo, no como límite funcional — si algún día se topa, hay que investigar el volumen de datos, no solo subir el número.

Aplicado en los tres lugares que antes usaban el límite fijo de 2,000:
- `resolveSessions` (sesiones del rango).
- `findTopProducts` (órdenes no canceladas + líneas de esas órdenes).
- `findDailySummary` (órdenes no canceladas del rango).

`findOrders` (el listado paginado que ve el frontend) no se tocó — ya usaba paginación real (`page`/`limit`/`offset` + `countPosOrders` para el total), no es un "traer todo" interno.

## Verificación

- `npm run build` y `npm run lint` (oxlint): limpios, 0 errores/warnings.
- Reproducción funcional directa contra Odoo replicando la lógica corregida (paginando con `offset` en vez de un solo fetch): para el rango real de 90 días (2026-06-12 a 2026-09-09) ahora se traen las 7,698 órdenes completas (antes se cortaba en 2,000), con datos en 89 de los 90 días del rango — incluyendo `2026-06-15` (76 órdenes) y `2026-07-15` (84 órdenes), que antes del fix aparecían en cero.

## Pendiente

- Nada pendiente de este fix puntual. Cambio no commiteado a git todavía — falta que el usuario confirme si lo subo yo (con `git add`/`commit`, él hace el `push`) o lo hace todo él mismo, como se dejó pendiente también con el cambio de login/eye-toggle de la sesión anterior.
