# Blindaje de permisos por rol

## Objetivo
Que todo acceso de Finanzas y Vendedor dependa del panel de Permisos y no haya endpoints que lo esquiven.

## Hallazgos y cambios
- Tráfico de tiendas, Venta mensual y Ticket promedio son pantallas solo de Admin y Finanzas, pero su techo incluía al Vendedor: el panel ofrecía interruptores que no hacían nada y, como el guard daba por habilitado un módulo sin fila, un Vendedor podía entrar al summary de metas por esas llaves aunque tuviera apagada su pantalla diaria. Se quitó VENDEDOR de esos 3 techos (y del script de backfill) y `isEnabledForRole` devuelve false para lo que está fuera del techo del rol. Test nuevo en `src/permissions/tests`.
- `GET /sales/orders` y `GET /sales/reconciliation` ya no admiten al Vendedor y ahora exigen un módulo de ventas habilitado. `GET /sales/by-store` y `GET /sales/by-salesperson` también exigen módulo.
- `GET /inventory/stores/:id/items` acepta Conteo y Registro o Solicitudes y Movimientos, porque las pantallas de Solicitudes y Movimientos eligen el producto de esa lista.

## Resultado final
`tsc` sin errores nuevos y los tests de permisos pasan.
