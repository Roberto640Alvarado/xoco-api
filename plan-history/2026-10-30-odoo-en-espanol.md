# Odoo en el idioma del usuario (nombres en español)

## Objetivo
"I LOVE YOU" y "LOVE" no aparecían en el panel. Diagnóstico (`scripts/inspect-odoo-product.mjs 316`): la API externa de Odoo responde en inglés si no se le pasa idioma, y esos productos se renombraron en español: en inglés seguían como "Tipo 1".

## Cambios realizados
- `OdooCredentials.lang`: `OdooService` lee una vez el idioma del usuario dueño del API key (`res.users.lang`, ej. es_MX; caché 1 h, sin tumbar la consulta si falla) y `OdooRepository.executeKw` lo manda en el `context` de TODAS las llamadas (respetando el contexto propio de quien llama, ej. active_test).
- `scripts/inspect-odoo-product.mjs`: diagnóstico por nombre o por id (compañía, archivado, nombre en inglés vs. idioma del usuario).

## Razones del cambio
Que productos y categorías salgan en el panel con el mismo nombre que ven en Odoo. Lo que depende de nombres ya aceptaba español (unidades kg/gramos/libras, raíz "All"/"Todos" de categorías); los métodos de pago se separan por `type`, no por nombre.

## Resultado final
`tsc` y oxlint sin errores, 126 tests en verde. Los nombres guardados como foto en solicitudes y recetas ya creadas no cambian.
