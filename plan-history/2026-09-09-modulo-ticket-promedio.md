# Nuevo módulo "Ticket Promedio": meta de ticket promedio ($) por tienda

## Contexto

El usuario mandó una captura de la hoja "Ticket Promedio" del Excel original (columnas: Tienda / [Mes] / Meta / Diferencia, con fila "Promedio" al final — sin columna de Alcance %, y "Diferencia" en rojo con signo "-$" cuando el real queda por debajo de la meta) y pidió replicarlo, similar a Tráfico de tiendas y Venta Mensual: tabla, tarjeta y gráfica.

Confirmado por `AskUserQuestion`: el % de crecimiento es PROPIO de este módulo (mismo criterio que Venta Mensual frente a Tráfico de tiendas) — no se deriva matemáticamente de Meta Venta ÷ Meta Tráfico, aunque esa relación exista; el usuario prefirió mantener el mismo patrón de % independiente configurable por separado en los 3 módulos.

## Diseño

Réplica del patrón de `src/sales-goals/`, pero la métrica es el TICKET PROMEDIO (venta real / cantidad de órdenes reales, ambas de `SalesService.findDailySummary`) en vez de la venta sola:

- Modelo propio `StoreTicketGoal` (colección `store_ticket_goals`, mismo shape que los otros dos: `posConfigId, year, month, growthPercent`).
- `TicketGoalsService.getActualAverageTicketForMonth()`: suma órdenes y venta del mes, divide (revenue/orders), 0 si no hubo órdenes (evita dividir entre cero).
- `TicketGoalsService.resolveTargetAverageTicket()`: mismo encadenado que los otros dos módulos (meta del mes N = meta del mes N-1 * (1+%), ancla en lo real cuando la cadena no tiene % configurado, tope de seguridad de 24 meses).
- `TicketGoalSummaryItemDoc`: sin las columnas de proyección/diarias-necesarias (no se pidieron); expone `difference` (= actualAverageTicket - targetAverageTicket, puede ser negativo — la "Diferencia" del Excel) y `reachPercent` (no está en la tabla del Excel, pero se expone igual para la tarjeta "Cumplimiento hasta la fecha", mismo patrón que los otros 2 módulos).
- Nuevo módulo `src/ticket-goals/` (`TicketGoalsModule`, importa `SalesModule`) registrado en `AppModule`. Rutas `GET /ticket-goals/summary`, `PUT /ticket-goals` (bulk), mismos roles `SUPER_ADMIN`/`FINANZAS`.

## Verificación

- `npm run build` y `npm run lint`: limpios.
- Verificación funcional directa contra Mongo/Odoo reales: julio sin % → `targetAverageTicket: null` para las 4 tiendas (Sucursal Escalon con ticket real $14.57, por ejemplo). Con 3% de prueba en julio → `targetAverageTicket: 14.278860...` (ticket real de junio × 1.03 — ancla, junio sin % configurado). Encadenando agosto con 2% → `targetAverageTicket: 14.564437...`, exactamente `14.278860... × 1.02` (meta de julio, NO el ticket real de julio) — confirma el mismo encadenado meta-sobre-meta que los otros 2 módulos. Datos de prueba eliminados de Mongo al terminar.

## Pendiente

- Falta el lado de `xoco-app`: tabla (Tienda/[Mes]/Meta/Diferencia + fila "Promedio"), tarjeta de cumplimiento, gráfica y modal de % — ver su propio plan-history.
