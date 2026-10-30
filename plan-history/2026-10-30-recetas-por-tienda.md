# Recetas por tienda

## Objetivo
Productos que se venden pero no se guardan en bodega (ej. bebidas: Americano, Capuchino, Latte, Espresso) deben descontar sus ingredientes (ej. cápsula Pacamara) en vez de ellos mismos. Cada tienda prepara distinto, así que las recetas son por tienda y solo las configura SUPER_ADMIN.

## Cambios realizados
- Modelo `StoreRecipe` (+ tipo `RecipeComponent`), único por (posConfigId, productId), con nombres/unidad como foto del momento.
- Módulo `recipes`: `GET /inventory/recipes/catalog`, `GET /inventory/recipes?posConfigId`, `PUT /inventory/recipes/:posConfigId/:productId`, `DELETE ...`, `POST /inventory/recipes/:posConfigId/copy-from/:source`. Validaciones: tienda real, productos del catálogo, sin repetidos, no ser ingrediente de sí mismo, un solo nivel (un ingrediente no puede tener receta).
- `utils/expand-recipes.util.ts` (puro): `expandSale`, `soldProductsAffecting`, `viaLabel`.
- Inventario usa las recetas: existencia estimada del Conteo (`InventoryService.findUnitsSoldSince`), Registro (`InventoryLedgerService.findSales`, con "Americano ×2 · ticket" y filtro por ingrediente) y Kardex (los productos con receta no aparecen como stock). `InventoryItemDoc.recipe` marca los productos por receta (sin existencia).
- Tests del cálculo y del servicio.

## Razones del cambio
El POS vende la bebida; lo que se gasta en bodega es la cápsula. Sin recetas, la cápsula nunca bajaba y la bebida quedaba en 0 o negativa.

## Resultado final
`tsc` y oxlint sin errores, 121 tests en verde. Las recetas aplican a todo el cálculo desde el último conteo (también a ventas anteriores a crear la receta).
