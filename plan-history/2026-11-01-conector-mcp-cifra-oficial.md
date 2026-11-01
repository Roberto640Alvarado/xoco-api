# Conector MCP: una sola cifra oficial de ventas

## Objetivo
Que Claude y ChatGPT den las mismas cifras de venta al preguntar por Xoco (en el análisis de Centrika mayo–octubre uno dio −10.3% y el otro −13.8%).

## Cambios realizados
- Instrucciones del conector: la venta oficial es Venta Mensual / Visitas (facturas, `/sales/by-store`); la venta de caja (POS por día) es solo para tendencia diaria y ticket; no mezclar fuentes, citar el reporte, comparar con las demás tiendas y revisar productos reales antes de recomendar.
- Nueva herramienta `xoco_venta_mensual` (mes por mes con la cifra oficial, por tienda, total y mayoreo; máx. 24 meses).
- Descripciones de `xoco_ventas_por_dia` y `xoco_ventas_por_tienda` aclaran cuál es la oficial.

## Razones
El conector exponía las dos fuentes sin decir cuál es la oficial. ChatGPT tomó el resumen de facturas y la tabla mensual de caja. En mayo, Centrika tuvo 625 órdenes de caja por $17,014.04, frente a $16,204.24 y 629 visitas en facturas: la diferencia sale de cómo cada reporte asigna la tienda (diario y vendedor), de la fecha de factura y de las notas de crédito.

## Resultado final
Ambos asistentes usan la misma cifra oficial para meses, crecimiento y metas, y dicen de qué reporte sale.
