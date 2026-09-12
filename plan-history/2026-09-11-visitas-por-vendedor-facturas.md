# Visitas y venta del panel: se cuentan FACTURAS, no órdenes de caja

## Contexto

El usuario trasladó cómo saca el equipo las visitas, a mano:

> Fijate que lo que yo hago es que me voy directamente a contabilidad, el módulo, y ahí el número de facturas es las visitas. Y despliega la venta del período seleccionado; ahí en la misma barra de antes pongo otro filtro de agrupar por vendedor. Y ahí me despliega la venta sin impuestos, la venta con impuestos y las visitas que están a la par del nombre del vendedor.

Primero acotó el alcance a las visitas ("los montos ya estaban correctos"), pero al comparar la tabla de venta mensual resultó que los montos también salían de las facturas — ver "Los montos" más abajo.

El dato que permitió cerrarlo fue su comparación de julio 2026:

| Tienda (nombre del Excel) | Ellos | xoco-app |
|---|---|---|
| Centrika | 563 | 563 |
| Art Haus (= San Benito) | **964** | 963 |
| Ramblas | **581** | 580 |
| El Paseo (= Sucursal Escalón) | 567 | 567 |
| **Total Mensual** | **2,675** | 2,673 |

Dos visitas de diferencia, en dos tiendas puntuales. Con un delta tan chico se pudo identificar factura por factura contra Odoo real qué es lo que el panel no contaba.

## Qué explicaba la diferencia

**1. Las notas de crédito ("Anulación") cuentan como factura.** Las 2 visitas que faltaban son dos anulaciones de julio: `ANU-00179` de Ventas 2 (San Benito) y `ANU-00176` de Tienda Ramblas. En la lista de facturas de Odoo aparecen como un registro más, así que entran en el número que ve el equipo.

**2. El estado no se filtra.** También cuentan las anuladas y las borrador (1 o 2 por mes). Por ejemplo CENTRIKA en julio son 562 facturas emitidas + 1 anulada = 563.

Con esos dos criterios, el conteo de facturas cuadra **exacto** contra su Excel en las cuatro tiendas.

**3. Lo que NO explicaba nada: el canal de mayoreo.** Contar facturas agrega 114–189 facturas por mes de MAYOREO (Mario Segura, Celine), que facturan sin pasar por caja. El usuario decidió **no incluir mayoreo en Visitas**, porque las filas del panel son tiendas. Se devuelve aparte (`outsideStores`) para que el número no desaparezca sin explicación, y se ve por vendedor en `/sales/by-salesperson`.

Verificado además que la liga factura ↔ orden de caja es 1:1 (de las 2,745 facturas de agosto, 2,609 apuntan a exactamente una `pos.order`, ninguna a dos) y que `invoice_date` es un campo `date` sin hora — así que estos reportes **no** necesitan la conversión de zona horaria que sí necesitan las órdenes de POS (ver plan-history "fix-dia-local-ventas").

## Los montos

Después mandó su tabla de venta de julio y pasó lo mismo: los montos también son los de las facturas.

| Tienda | Ellos | Facturas (esta API) | Panel antes (POS) |
|---|---|---|---|
| Centrika | 15,706.07 | **15,706.07** ✓ | 15,723.48 |
| Art Haus | 17,643.47 | **17,643.47** ✓ | 17,741.97 |
| Ramblas | 7,887.60 | **7,887.60** ✓ | 7,916.78 |
| El Paseo | 8,094.81 | 8,100.03 | 8,260.76 |
| **Total** | **49,331.95** | 49,337.17 | 49,642.99 |

Tres de cuatro cuadran al centavo. El Paseo queda $5.22 arriba y son dos cosas:

- **$5.25** de la factura borrador sin vendedor (`FCF-ES-02344`) del diario de Escalón. Ellos la cuentan como visita (su El Paseo son 567 = 566 + 1) pero no la suman al monto; esta API la trata igual en los dos lados, porque el conteo y la suma salen del mismo conjunto de facturas. Si se decide excluir los borradores, hay que excluirlos también de las visitas (El Paseo pasaría a 566).
- **$0.03** que no existen en el dato: se revisaron las 566 facturas del vendedor de Escalón una por una y todas las variantes de campo monetario de Odoo (`amount_total_signed`, `amount_total_in_currency_signed`, `amount_total`) dan 8,094.78. No hay ninguna factura de $0.03 ni subconjunto que llegue a 8,094.81.

Los montos van **con impuesto y netos de notas de crédito** (las variantes `_signed` de Odoo), que es lo que muestra su lista de facturas.

## El problema de fondo: una factura no tiene tienda

En Odoo la factura tiene **vendedor** y **diario contable**, no `pos.config`. Ninguna de las dos cosas alcanza por separado:

- El diario casi identifica la tienda (cada una tiene su propia serie fiscal: FCF, CCF, notas de crédito), pero **"Anulación" es el MISMO diario para las cuatro**, y el diario base de la compañía (`Factura Consumidor Final` / `Comprobante Crédito Fiscal`) es a la vez el de CENTRIKA **y** el que usa mayoreo para algunas facturas.
- El vendedor identifica bien la tienda, pero hay facturas sin vendedor asignado (en julio hay una: un borrador de $5.25 en el diario de Escalón — es justo la que hace que El Paseo sea 567 y no 566).

`StoreInvoiceTotalsService.resolveStore()` combina las dos señales, todas sacadas de datos de Odoo (ninguna convención hardcodeada):

1. **Mapa diario → tienda**, armado con los diarios configurados en cada `pos.config` (`invoice_journal_id`, `ccf_journal_id`, `nc_journal_id`, `anu_journal_id`, etc.). Los diarios que aparecen en más de una tienda se descartan del mapa por ambiguos — así cae "Anulación".
2. **Mapa vendedor → tienda**, armado agrupando las órdenes de caja del MISMO rango por vendedor y tienda (`read_group` de `pos.order`). Si un vendedor cubrió turnos en dos tiendas, gana la que más órdenes le cobró.
3. Por cada factura:
   - sin vendedor → manda el diario;
   - vendedor que no cobró en ninguna caja del rango → **mayoreo**, fuera del conteo (esto es lo que evita que las facturas de Celine en el diario base se le sumen a CENTRIKA);
   - factura de caja → la tienda de su serie fiscal;
   - facturación manual de un vendedor de tienda (un CCF que pidió el cliente, una anulación) → el diario si apunta a su misma tienda, y si el diario es compartido manda el vendedor.

El paso 2 usa el mismo rango a propósito, no una ventana más amplia: con un año de histórico, mayoreo aparece con alguna orden de caja vieja y dejaría de distinguirse (se probó, y metía sus ~180 facturas dentro de San Benito).

## Diseño

**`GET /sales/by-store?dateFrom=&dateTo=`** (nuevo) — visitas y venta por tienda, con `totals` y `outsideStores`. Es la fuente de "Visitas a la fecha" y de "Venta Mensual", y sirve para que el equipo cuadre un mes contra su Excel sin pedir nada a mano.

**`GET /sales/by-salesperson?dateFrom=&dateTo=`** (nuevo) — el mismo conteo pero agrupado por vendedor, con visitas, venta sin impuesto, impuesto y venta con impuesto, más totales. Aquí sí se ve mayoreo. Los montos son los `_signed` de Odoo, o sea **netos de notas de crédito**, igual que los suma su lista de facturas.

Ambos endpoints comparten el domain (`buildCustomerInvoiceDomain`) para que no puedan divergir en qué cuentan. Acceso `SUPER_ADMIN` y `FINANZAS`, como el resto de `/sales`.

**Los tres módulos del panel pasaron a esta fuente**, vía `StoreInvoiceTotalsService` en vez de `SalesService.findDailySummary()`:

- **Visitas** (`GoalsService`): `actualOrders` y `previousMonthActualOrders` = cantidad de facturas.
- **Venta Mensual** (`SalesGoalsService`): `actualRevenue` = suma facturada con impuesto.
- **Ticket Promedio** (`TicketGoalsService`): venta facturada / visitas. Se cambió junto con los otros dos a propósito: el ticket es la división de las dos métricas que ya muestran los otros módulos, y dejarlo en `pos.order` lo habría vuelto una mezcla de dos fuentes.

Los nombres de los campos de los docs no cambiaron (`actualOrders`, `missingOrders`, …) para no romper el contrato con xoco-app. De paso, cada módulo resuelve su mes en UNA llamada para las cuatro tiendas (la atribución de facturas es global, no por tienda) en vez de una por tienda, así que los cachés de `getSummary()` pasaron a estar llaveados por rango.

Piezas nuevas en el módulo Odoo: `findAccountMoves`, `readGroupAccountMoves` y `readGroupPosOrders` en el repositorio (primer uso de `read_group` en el proyecto: Odoo agrupa y suma del lado del servidor, igual que su interfaz, así que el reporte por vendedor es una sola llamada en vez de paginar miles de facturas), los campos de diarios en `findPosConfigs`, y los enums `OdooMoveType` / `OdooMoveState` / `OdooPosOrderState`. La paginación con offset que vivía privada en `SalesService` se movió a `common/utils/odoo-pagination.util.ts` porque ahora la usan dos servicios.

## Verificación

**Contra Odoo real** (se levantó un `NestFactory.createApplicationContext()` temporal y se llamaron los servicios de verdad; script borrado después):

| Visitas, julio | CENTRIKA | San Benito | Ramblas | Escalón | Total |
|---|---|---|---|---|---|
| **`/sales/by-store`** | 563 | 964 | 581 | 567 | **2,675** |
| Excel del equipo | 563 | 964 | 581 | 567 | **2,675** |
| Panel antes del cambio | 563 | 963 | 580 | 567 | 2,673 |

`GET /goals/summary`, `/sales-goals/summary` y `/ticket-goals/summary` de julio devuelven ya esos números (visitas 2,675 y venta $49,337.17, con El Paseo $5.22 arriba por el borrador — ver "Los montos"). La regla se probó también en mayo (2,937), junio (2,727) y agosto (2,613), y se comprobó que da lo mismo que una versión más caruda que atribuye leyendo cada factura y su orden de caja. Dato suelto que se cierra con esto: junio para San Benito da **1,014**, que es exactamente lo que decía el Excel y quedó sin explicación en plan-history "reconciliacion-visitas".

**Tests** (`npm test`: 37 pasando, 18 nuevos): `store-invoice-totals.service.spec.ts` cubre un caso por cada regla de atribución (factura de caja, CCF manual, anulación en diario compartido, factura sin vendedor, mayoreo en el diario base de CENTRIKA, mayoreo en su propio diario, vendedor que cubre dos tiendas, tienda sin facturas, rango de un día). `salesperson-sales.service.spec.ts` usa los datos reales de julio por vendedor. Los mocks (`mocks/account-moves.mock.ts`, `mocks/pos-configs.mock.ts`) llevan los ids y diarios reales de Odoo.

## Pendiente

- **Falta decidir qué hacer con las facturas BORRADOR** (1 o 2 por mes). Hoy cuentan como visita y suman al monto; el equipo las cuenta como visita pero no al monto. Es la única diferencia que queda (los $5.25 de El Paseo en julio).
- La **gráfica de tendencia diaria** (`/sales/daily-summary`) y el **ranking de productos** siguen saliendo de `pos.order`: son por día y por producto, y la factura no trae ese detalle sin cruzar sus líneas. Por eso el total del mes de esa gráfica no va a cuadrar exacto con el de Venta Mensual (~$300 en julio, o sea 0.6%).
- Si algún día quieren **meta de mayoreo**, primero hay que decidir cómo llavear la meta de un canal que no es tienda: hoy `StoreGoal`/`StoreSalesGoal`/`StoreTicketGoal` tienen índice único por `posConfigId + year + month`.
- Los campos de diarios de `pos.config` (`ccf_journal_id`, `anu_journal_id`, …) los agrega la localización fiscal de El Salvador, no Odoo estándar: si algún día se apunta a otra instancia sin esa localización, `findPosConfigs` empezaría a fallar.
- Sin UI en xoco-app para `/sales/by-salesperson` ni `/sales/visits-by-store` (el número de visitas por tienda sí llega ya al panel por `/goals/summary`).
