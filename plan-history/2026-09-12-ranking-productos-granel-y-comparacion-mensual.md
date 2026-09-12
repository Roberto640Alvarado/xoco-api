# Ranking de productos a granel (Kg) y comparación mensual

## Objetivo

Dos problemas del análisis por producto que reportó el negocio:

1. Productos que se venden por peso (ej. "Crocks") salían como "más vendidos"
   en el ranking de unidades porque su `qty` en Odoo viene en gramos, no en
   piezas — 500 g de un solo tiquete "ganaba" a 50 piezas de otro producto.
2. Faltaba una forma de comparar, por producto, el mes en curso contra el mes
   anterior (para el gráfico de barras que pidió el negocio).

## Cambios realizados

- `product_uom_id` agregado a `pos.order.line` (tipo `OdooPosOrderLine` y
  `OdooRepository.findPosOrderLines`).
- Nuevo `src/sales/utils/product-uom.util.ts`: detecta si la UoM de una línea
  es de peso (g/kg/lb/oz y sinónimos) y da el factor de conversión a Kg.
- `SalesService.findTopProducts` ahora EXCLUYE las líneas a granel del
  ranking por unidades.
- Nuevo `SalesService.findTopProductsByWeight` /
  `GET /sales/top-products-by-weight`: mismo rango/filtros que
  `top-products`, pero agrega y ordena por Kg solo los productos a granel.
- Nuevo `SalesService.findProductMonthlyComparison` /
  `GET /sales/product-monthly-comparison`: para el Top N de productos por
  unidades del mes en curso (día 1 a hoy), agrega también su total del mes
  anterior COMPLETO — un solo viaje a Odoo, bucketing por día local de
  tienda. Excluye a granel igual que `findTopProducts`.
- Nuevos helpers de fecha en `store-date.util.ts`: `todayStoreDate`,
  `startOfMonth`, `endOfMonth`, `shiftMonthStart`.
- Tests nuevos en `sales.service.spec.ts` (exclusión por peso en ambos
  rankings, agregación/conversión a Kg, bucketing mes actual/anterior).

## Razones del cambio

- Mezclar gramos con piezas en el mismo ranking no es comparable — de ahí el
  ranking aparte por Kg (decisión confirmada con el usuario, en vez de solo
  convertir la cifra y dejarlo mezclado).
- La comparación mensual usa el mes anterior COMPLETO (no el mismo tramo de
  días que el mes en curso) — también confirmado con el usuario, prioriza ver
  el total real del mes pasado sobre una comparación día-a-día estrictamente
  pareja.
- La detección de UoM es por nombre (no por categoría de Odoo) porque
  `pos.order.line` ya trae `product_uom_id` sin llamada extra; el usuario
  confirmó que su Odoo usa "g"/"kg", y se dejó una lista más amplia de
  sinónimos por si algún producto queda configurado distinto.

## Resultado final

`npx tsc --noEmit`, `npx oxlint src/ test/` y `npx vitest run` (40/40 tests,
en una copia aislada instalada en un contenedor Linux separado — el shell del
dispositivo no pudo correr vitest por un binding nativo de `rolldown`
específico de esa VM, ajeno a este cambio) — todo en verde. Endpoints nuevos
documentados en Swagger vía `@ApiOperation`.
