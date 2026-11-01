# Conector MCP: solo Super admin, herramientas directas y reconocimiento de Xoco

## Objetivo
Conector solo de lectura para Super admin y Finanzas, que el asistente use al mencionar Xoco o Xocolatísimo, más fácil de usar y con el ícono de Xocolatísimo.

## Cambios realizados
- `MCP_ALLOWED_ROLES`: Super admin y Finanzas (se probó dejar solo Super admin y se volvió a abrir a Finanzas a pedido del usuario).
- Servidor MCP: título "Xocolatísimo (Xoco)", ícono (`icons`) y `websiteUrl`; instrucciones con los nombres Xoco/Xocolatísimo, tiendas y la fecha de hoy en El Salvador.
- Herramientas directas: xoco_tiendas, xoco_ventas_por_dia, xoco_ventas_por_tienda, xoco_productos_mas_vendidos, xoco_metas_del_mes, xoco_inventario_tienda (compacto, con filtro), xoco_kardex.
- Página de inicio de sesión: texto solo Super admin y favicon.
- Pruebas actualizadas.

## Razones
Pedido del usuario. Las herramientas con nombre claro evitan que el asistente adivine rutas; la fecha de hoy resuelve "ayer" / "este mes".

## Resultado final
Todas las herramientas son de solo lectura (GET al panel y search_read/read_group/search_count/fields_get en Odoo).
