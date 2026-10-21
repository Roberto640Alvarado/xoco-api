# Comparación de productos entre dos períodos

## Objetivo

Sacar la comparación "mes en curso vs. mes anterior" de Mejores productos (donde convivía con los rankings sin compartir sus filtros) y darle su propia pantalla, con períodos libres: por defecto el mes actual contra el anterior, pero también dos meses cualquiera o dos rangos personalizados.

## Cambios realizados

- Nuevo `GET /sales/product-comparison` (`periodAFrom`, `periodATo`, `periodBFrom`, `periodBTo`, `posConfigId`), que reemplaza a `GET /sales/product-monthly-comparison`.
- `SalesService.findProductComparison`: pide cada período a Odoo por separado y en paralelo, suma unidades e ingreso por producto (excluye canceladas y productos a granel, igual que el ranking por unidades) y devuelve los totales de cada período más todos los productos vendidos en cualquiera de los dos.
- Validación: inicio <= fin y máximo 366 días por período (`BadRequestException` con mensaje en español).
- Nuevo moduleKey `dashboard.comparacion-productos` (techo: SUPER_ADMIN, FINANZAS, VENDEDOR), también en `prisma/backfill-role-module-access.mjs`.
- El Vendedor solo compara su tienda: `scopedPosConfigId` ignora el `posConfigId` que mande.
- Tests: suma por período, totales, exclusión de granel y las dos validaciones.

## Razones del cambio

Mejores productos mostraba demasiada información distinta junta y su filtro de fechas no aplicaba a la comparación. Un endpoint con dos períodos libres cubre el caso por defecto y los rangos personalizados sin endpoints extra.

## Resultado final

Endpoint documentado en Swagger, protegido por rol y por permiso propio, con 60 tests en verde.
