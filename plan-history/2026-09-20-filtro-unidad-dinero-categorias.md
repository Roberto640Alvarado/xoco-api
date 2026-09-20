# Filtro "Por unidad" / "Por dinero" en Top productos por categoría

## Objetivo

Feedback del negocio sobre `/dashboard/categorias`: la gráfica de "Top productos por categoría" solo ordenaba/mostraba por ingresos ($); también la quieren poder ver por unidad (cantidad vendida).

## Ambigüedad y cómo se resolvió

Al agregar este módulo (ver `plan-history/2026-09-12-top-productos-por-categoria.md`) se decidió deliberadamente rankear SOLO por ingresos porque dentro de una misma categoría pueden convivir productos por pieza y productos a granel (ej. "Crocks", vendidos por Kg) — sumar o comparar directamente "12 unidades" contra "0.5 Kg" no tiene sentido.

Para no reabrir ese problema:

- Cada producto ahora trae también `quantity` + `unit` (`"unidad"` o `"kg"`) — la cantidad vendida en la UoM propia de ESE producto (conversión a Kg ya hecha para los de peso, mismo criterio que `/sales/top-products-by-weight`).
- El nuevo query param `metric` (`"revenue"` default | `"quantity"`) decide con qué campo se ordenan y muestran los PRODUCTOS dentro de cada categoría.
- Las CATEGORÍAS siguen ordenándose siempre por ingresos totales, sin importar `metric` — sumar Kg de una categoría a granel con unidades de una por pieza tampoco daría un total con sentido, y el ingreso sigue siendo la única unidad común para saber qué categoría vende más.

## Cambios realizados (xoco-api)

- `sales.doc.ts`: `CategoryProductDoc` gana `quantity: number` y `unit: 'unidad' | 'kg'`.
- `find-top-products-by-category-query.dto.ts`: nuevo query param `metric?: 'revenue' | 'quantity'` (default `'revenue'`).
- `sales.service.ts` → `findTopProductsByCategory()`: agrega `pieceQty`/`weightKg` por producto (usando `weightKgFactor` sobre `product_uom_id`, igual que `findTopProductsByWeight`) además de `revenue`; el producto expone `quantity`+`unit` según cuál de las dos tenga valor. El sort de productos usa `a[metric] - b[metric]`; el de categorías sigue fijo por `totalRevenue`.
- `sales.controller.ts`: descripción de Swagger actualizada para mencionar `metric`.
- `sales.service.spec.ts`: se actualizaron las 2 aserciones `toEqual` exactas que ahora necesitan `quantity`/`unit`, y se agregó un test nuevo que verifica que con `metric: 'quantity'` el orden de productos dentro de una categoría se invierte respecto a `metric: 'revenue'`, sin afectar el orden de las categorías.

## Cambios realizados (xoco-app)

- `features/sales/types/sales.types.ts`: `CategoryProduct` gana `quantity`/`unit`; nuevo tipo `CategoryProductMetric`.
- `features/sales/api/sales.api.ts` y `features/sales/hooks/use-product-ranking-by-category.ts`: pasan `metric` a la API (incluido en la query key para que React Query cachee cada combinación por separado).
- `components/charts/category-top-products-chart.tsx`: nueva prop `metric` — la barra y su label muestran ingresos o cantidad (con su unidad, ej. "0.5 kg" / "12 u") según corresponda; el tooltip y "Ver tabla" siempre muestran ambas columnas (ingresos Y cantidad) para no perder información sin importar qué metric esté activo.
- `app/dashboard/categorias/page.tsx`: nuevo segmented control "Por dinero" / "Por unidad" (2 botones, sin instalar un componente shadcn nuevo) junto al input de "Mostrar N"; controla `metric` y se lo pasa al hook y a cada gráfica. El export a Excel ahora incluye columnas de Cantidad y Unidad además de Ingresos.

## Resultado final

`npx tsc --noEmit` sin errores en ambos repos. `npx eslint` (xoco-app) sin errores en los archivos tocados. En xoco-api no fue posible correr `vitest`/`oxlint` en esta sesión: el `node_modules` montado trae binarios nativos de macOS y el intento de reinstalar en una copia aislada del repo falló porque el proxy de red de esta sesión bloquea tanto `github.com` como `registry.npmjs.org` (mismo problema de bindings nativos que ya mencionan varios `plan-history` anteriores, pero esta vez sin poder aplicar el workaround habitual por falta de red). Se verificó la lógica a mano contra los casos de los tests actualizados; se recomienda correr `npm test` localmente antes de mergear.
