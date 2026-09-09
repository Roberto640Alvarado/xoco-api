# Endpoint de diagnóstico: `GET /sales/reconciliation`

## Contexto

El usuario comparó "Tráfico de tiendas" (Visitas a la fecha) contra su Excel histórico, mes por mes. Investigando a mano (con scripts temporales contra Odoo real) se descartaron dos teorías:

- Que la app y el Excel contaran un `state` de `pos.order` distinto — descartado: para las tiendas/meses que sí cuadran exacto (Sucursal Escalon y Tienda Ramblas en los 3 meses revisados), el método (`state != 'cancel'`) es el mismo que ya usa la app.
- Que las órdenes se hubieran cancelado DESPUÉS de llenar el Excel — descartado con evidencia real: se revisó `write_date` de las 63 órdenes canceladas de San Benito en junio y el hueco entre `date_order` y `write_date` es de minutos/horas en todos los casos, nunca semanas. Se cancelan casi al momento, no después.

Lo que sí se confirmó con datos reales: las tiendas que cierran después de medianoche (San Benito, Tienda Ramblas) tienen órdenes cuyo `date_order` (fecha/hora de la orden individual) cae al día siguiente aunque la sesión POS a la que pertenecen haya empezado el día anterior. La app agrupa por fecha de SESIÓN (decisión ya tomada desde el inicio del proyecto, ver CLAUDE.md — es la correcta para el negocio), pero un conteo manual que no haya distinguido esto puede terminar corriendo esas órdenes de un mes a otro. Esto explicó EXACTO el hueco de San Benito/junio (1012 por sesión vs. 1014 por `date_order`, y el Excel decía 1014) — pero no explicó todos los huecos (San Benito/julio y CENTRIKA/mayo, por ejemplo, no cuadraron con ninguno de los 2 métodos).

Como esto claramente puede volver a pasar (nuevos meses, otras tiendas), en vez de seguir escribiendo un script temporal cada vez, se pidió agregar esta comparación como un endpoint permanente que el equipo pueda correr ellos mismos (ej. desde Postman).

## Diseño

**`GET /sales/reconciliation?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&posConfigId=<opcional>`** (mismo acceso que el resto de `/sales`: `SUPER_ADMIN` y `FINANZAS`).

Para cada tienda en el rango (o solo la pedida, si hay `posConfigId`), devuelve:

- `bySessionMethod` / `byOrderDateMethod`: `{ orderCount, totalRevenue }` — el total según cada uno de los 2 métodos de agrupar por día. `bySessionMethod` es el que usa hoy el resto de la app (`/sales/daily-summary`, Goals, etc.) — este endpoint NO cambia eso, es solo un reporte de diagnóstico.
- `orderCountDifference` = `bySessionMethod.orderCount - byOrderDateMethod.orderCount`.
- `stateBreakdown`: conteo por `state` (incluye `cancel`) de todas las órdenes tocadas por el rango bajo cualquiera de los 2 métodos.
- `boundaryOrders`: la lista concreta de órdenes donde los 2 métodos NO coinciden (las que cruzan medianoche justo en el borde del rango pedido) — con `id`, `state`, `dateOrder`, `sessionDate` y cuál de los 2 métodos las cuenta, para poder ir a revisarlas una por una en Odoo si hace falta.

**`SalesService.getReconciliation()`**: reutiliza `resolveSessions()`/`fetchAllPages()` ya existentes. Trae las sesiones con 1 día de margen a cada lado del rango pedido (`shiftDate()`, nuevo helper) — necesario porque una orden puede quedar dentro del rango por `date_order` aunque su sesión haya empezado el día anterior (o viceversa), que es justo lo que hay que detectar. Por cada orden calcula si cae dentro del rango por sesión y por `date_order` por separado; si ambos coinciden se cuenta normal, si no coinciden se agrega a `boundaryOrders`.

**Verificación funcional**: se levantó un `NestFactory.createApplicationContext()` temporal y se llamó `SalesService.getReconciliation()` de verdad (no una simulación) contra San Benito/junio y CENTRIKA/mayo — los números salieron IDÉNTICOS a los que se habían sacado a mano con el script de investigación (1012/1014 y 625/626 respectivamente, incluyendo la misma orden puntual de borde en CENTRIKA). Script de verificación borrado después de confirmar.

## Pendiente

- Julio (San Benito y Tienda Ramblas) sigue sin explicación completa — ni el método de sesión ni el de `date_order` cuadran contra el Excel de julio. El usuario decidió no seguir investigando eso por ahora y en su lugar tener esta herramienta para futuras diferencias.
- No hay UI en xoco-app para este endpoint — es una herramienta de diagnóstico para consultar directo (Postman/curl), no un módulo del dashboard. Si el usuario lo quiere en el panel más adelante, habría que decidir cómo mostrar `boundaryOrders` (es una lista variable, no una tabla fija).
