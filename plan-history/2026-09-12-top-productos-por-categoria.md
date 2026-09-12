# Top productos por categoría (módulo nuevo)

## Objetivo

Feedback del negocio: "Y si se puede colocar el producto top 10 por
categoría" — con la observación de que debía ir en un módulo aparte,
porque `Productos` ya se estaba llenando (5 gráficos).

Ambigüedades resueltas con el usuario antes de implementar
(AskUserQuestion): el ranking dentro de cada categoría es **por ingresos
($)**, no por unidades — así conviven productos por pieza y a granel (ej.
"Crocks") sin tener que excluir/convertir nada, a diferencia del ranking
por unidades de `Productos`.

## Cambios realizados

- `product.product` (con `categ_id`) y `product.category` ya estaban
  plumbeados en `OdooRepository`/`OdooService` (`findProducts`,
  `findCategories`) mas sin usar — no hizo falta tocar la capa de Odoo.
- `sales.doc.ts`: `CategoryProductDoc { productId, productName, revenue }`,
  `CategoryTopProductsDoc { categoryId, categoryName, products }`.
- `dto/find-top-products-by-category-query.dto.ts` (NUEVO): mismo shape
  que `FindTopProductsQueryDto` (dateFrom/dateTo/posConfigId/limit/order),
  pero `limit` es "productos por categoría", no un total.
- `sales.service.ts` → `findTopProductsByCategory()`:
  1. Reusa `fetchOrdersAndLines` (mismo rango/tienda que el resto de
     `/sales`) y suma ingresos por `product_id` — sin excluir a granel.
  2. `pos.order.line` no trae categoría — solo hace falta un segundo
     viaje a `product.product` (`categ_id in [ids vendidos]`, nunca el
     catálogo completo) para resolver la categoría de esos productos.
  3. Agrupa por categoría, ordena las CATEGORÍAS por su venta total
     (mayor primero) y, dentro de cada una, sus productos por ingresos;
     recorta a `limit` por categoría.
  4. Un producto cuyo `product.product` no aparece en la búsqueda (ej.
     archivado) cae en un bucket "Sin categoría" en vez de perder su
     ingreso silenciosamente — mismo criterio que `UNKNOWN_REF` del resto
     del módulo.
- `sales.controller.ts`: `GET /sales/top-products-by-category`.
- `tests/mocks/odoo.service.mock.ts`: se agregó `findProducts` al mock
  (no se usaba antes en ningún test de `sales`).
- `sales.service.spec.ts`: 3 tests nuevos (agrupación + orden de
  categorías y productos, fallback "Sin categoría", recorte por `limit`
  sin afectar el orden de categorías).

## Razones del cambio

- Rankear por ingresos evita reabrir el problema de "Crocks" (peso vs.
  pieza) que ya se resolvió en `Productos`: en vez de excluir a granel
  otra vez, acá el ingreso es la unidad común y no hace falta excluir
  nada.
- Se reusó `fetchOrdersAndLines` y el patrón de filtros de fecha/tienda
  que ya usa el resto de `/sales`, en vez de crear un flujo de datos
  paralelo.
- No se creó un módulo de Nest nuevo: el dominio es el mismo (ventas por
  producto), así que se agregó al `SalesController`/`SalesService`
  existentes, junto a `top-products` y `top-products-by-weight`.

## Resultado final

`npx vitest run`: 43/43 tests OK (corrido en copia aislada del repo por
el mismo problema de binarios nativos de siempre entre el VM del puente y
el `node_modules` real de macOS — ver plan-history anteriores). `npx tsc
--noEmit` y `oxlint` sin errores. Endpoint nuevo documentado en Swagger
vía `@ApiOperation`.

El nombre de categoría que devuelve el endpoint es `product.category.name`
tal cual (no `complete_name`), así que una categoría con padre no muestra
la jerarquía completa (ej. "Bombones", no "Todos / Bombones") — avisar si
se prefiere `complete_name`.

Frontend: ver plan-history de `xoco-app` (mismo nombre de archivo) para el
módulo nuevo `/dashboard/categorias`.
