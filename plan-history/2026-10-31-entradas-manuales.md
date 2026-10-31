# Entradas manuales de producto en Movimientos

## Objetivo
Que las tiendas (Vendedores) puedan registrar producto que llega sin pasar por una Solicitud (ej. bombones que trae planta a mano mientras su módulo no se usa), sin tener que meterlo en Conteo.

## Cambios realizados
- API: `ENTRADA` vuelve a ser un tipo manual en `CreateInventoryMovementDto` (junto a MERMA/REGALIA/DEGUSTACION).
- API: la bandeja, el contador de pendientes y las novedades del Vendedor incluyen la ENTRADA manual (sin `stockRequestId`); las ENTRADA de solicitudes y los TRASLADO siguen fuera.
- API: `assertNotEntry` solo bloquea TRASLADO y ENTRADA ligada a una solicitud; la ENTRADA manual se confirma/rechaza como una merma.
- Panel: botón verde "Registrar entrada" en Inventario → Movimientos; el formulario usa botones grandes "¿Qué pasó?" (Entrada / Merma / Regalía / Degustación) con textos según el tipo ("¿Cuánto llegó?").
- Panel: la tabla muestra la cantidad con signo (+ verde para entrada, − para salidas).
- Guía de Inventario y tours actualizados.

## Razones
Cuando el producto llegaba a mano se capturaba en Conteo, lo que reemplazaba la cantidad y hacía perder las ventas desde el conteo anterior. La entrada suma al estimado sin reiniciar el conteo.

## Resultado final
Vendedor: la entrada queda pendiente hasta que Admin o Finanzas la confirme. Admin/Finanzas: queda confirmada de una vez. Al confirmarse suma al inventario estimado, aparece en Registro y Kardex como entrada.
