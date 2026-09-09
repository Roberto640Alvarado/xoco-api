# Nuevo módulo "Venta Mensual": meta de venta ($) por tienda

## Contexto

El usuario mandó una captura de la hoja de venta mensual del Excel original (columnas: [Mes] con el monto real, Meta, Alcance, Valor Pendiente — Total Mensual al final) y pidió un módulo nuevo, "Venta Mensual", con esa misma tabla/columnas pero en dólares: monto real del mes, Meta, Alcance (%) y Valor Pendiente = Meta - real. Una tabla + tarjeta de "Cumplimiento hasta la fecha" + gráfica, con el mismo patrón que "Tráfico de tiendas".

Aclarado por `AskUserQuestion` antes de construir: el % de crecimiento para la Meta de este módulo es PROPIO e independiente del que ya se configura en Tráfico de tiendas (crecer en ventas $ y crecer en visitas/órdenes son metas distintas — se puede subir precios sin más visitas). Así que necesita su propio modelo, su propio modal de configuración y su propia cadena de metas.

## Diseño (xoco-api)

Réplica casi exacta de `src/goals/` (ver `2026-09-09-goals-meta-encadenada-mes-anterior.md`), pero:
- Métrica: `totalRevenue` (de `SalesService.findDailySummary`) en vez de `orderCount`.
- Modelo propio `StoreSalesGoal` (colección `store_sales_goals`, mismo shape que `StoreGoal`: `posConfigId, year, month, growthPercent`, índice único `posConfigId+year+month`) — NO reutiliza `StoreGoal`.
- Tabla más simple que Goals: sin proyección de cierre ni "diarias necesarias" (no se pidieron para este módulo). Solo 4 columnas de datos: monto real (hasta ayer si es el mes en curso), Meta, Alcance, Valor Pendiente.
- `SalesGoalsService.resolveTargetRevenue()`: mismo diseño encadenado que `GoalsService.resolveTargetOrders()` (meta del mes N = meta del mes N-1 * (1+%), con ancla en lo real del mes cuando la cadena no tiene % configurado, tope de seguridad de 24 meses) — aplicado a `totalRevenue`.
- Nuevo módulo `src/sales-goals/` (`SalesGoalsModule`, importa `SalesModule`) registrado en `AppModule`. Rutas `GET /sales-goals/summary`, `PUT /sales-goals` (bulk), mismos roles `SUPER_ADMIN`/`FINANZAS`.

## Verificación

- `npm run build` y `npm run lint`: limpios.
- Verificación funcional directa contra Mongo/Odoo reales (`NestFactory.createApplicationContext`, sin HTTP): julio sin % configurado → `targetRevenue: null` para las 4 tiendas. Con 10% de prueba en julio (Sucursal Escalon, `posConfigId=4`) → `targetRevenue: 8981.819` (real de junio $8165.29 × 1.10 — ancla, junio sin % configurado). Encadenando agosto con 5% → `targetRevenue: 9430.90995`, exactamente `8981.819 × 1.05` (meta de julio, NO lo real de julio) — confirma el mismo encadenado meta-sobre-meta ya corregido en Goals, ahora aplicado a $. Datos de prueba eliminados de Mongo al terminar.

## Pendiente

- Falta el lado de `xoco-app`: tabla, tarjeta de cumplimiento, gráfica y modal de configuración de % — ver su propio plan-history.
