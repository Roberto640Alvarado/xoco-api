# IVA en el resumen diario + orden asc/desc en el ranking de productos

## Contexto

El dashboard de `xoco-app` se reorganiza en tres secciones (Ventas, Visitas,
Productos — ver plan-history de `xoco-app`). Para eso el backend necesita
dos cosas nuevas: el monto de IVA por día (para mostrarlo separado del
ingreso bruto en Ventas) y poder pedir el ranking de productos en ambos
sentidos (los más vendidos y los menos vendidos, no solo el top).

## Diseño

### `GET /sales/daily-summary` — campo `totalTax`

- `DailySalesDoc` gana `totalTax: number` junto a `orderCount`/`totalRevenue`.
- `SalesService.findDailySummary()`: el bucket por fecha ahora también suma
  `amount_tax` de cada orden no cancelada (mismo agrupamiento por fecha de
  sesión de POS ya establecido — nunca por `date_order`). Días sin ventas
  siguen en cero para las tres métricas (no hay huecos en la serie).

### `GET /sales/top-products` — parámetro `order`

- `FindTopProductsQueryDto` gana `order?: 'desc' | 'asc' = 'desc'` (además del
  `limit` que ya existía y ahora también es controlable desde el frontend).
- `SalesService.findTopProducts()`: el sort final por `totalQuantity` respeta
  `order` — `desc` para "más vendidos", `asc` para "menos vendidos". Sin
  cambios en cómo se agregan las cantidades, solo en el sentido del sort
  final antes de aplicar `limit`.

Ninguno de los dos cambios toca el agrupamiento por sesión de POS ni los
roles (`SUPER_ADMIN`, `FINANZAS`) ya establecidos en `SalesController`.

## Verificación

- `npm run build` (`nest build`) y `npm run lint` (`oxlint`) — 0 errores.
- Verificación en vivo completa (login real + `/sales/daily-summary` con
  `totalTax` real + `/sales/top-products?order=asc`) quedó pendiente: hubo
  una falla de conectividad TLS hacia MongoDB Atlas durante buena parte de
  esta sesión (ver plan-history previo), y aunque la conexión ya se
  recupero luego (confirmado con un intento de login real que llegó hasta
  la base de datos, `401 Credenciales inválidas` en vez de un `500`), no se
  contaba con la contraseña del `SUPER_ADMIN` sembrado para completar un
  login exitoso y ver los datos reales.

## Pendiente

- Confirmar visualmente con datos reales (login del usuario) que
  `totalTax` refleja el IVA esperado y que `order=asc` realmente devuelve
  los productos menos vendidos primero.
