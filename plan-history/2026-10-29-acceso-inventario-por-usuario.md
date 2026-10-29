# Acceso a Inventario por usuario (Vendedor)

## Objetivo
Que, por ahora, solo un Vendedor específico (prueba@xocolatisimo.com.sv) pueda entrar a Inventario; el resto de Vendedores queda bloqueado aunque su tienda esté habilitada.

## Cambios realizados
- `prisma/schema.prisma`: nuevo campo opcional `User.inventoryEnabled Boolean?` (ausente/null = sin acceso; opcional porque los documentos existentes de Mongo no lo traen).
- `AuthenticatedUser` incluye `inventoryEnabled` (lo llena `JwtStrategy` desde la base en cada request, sin tocar el JWT).
- `InventoryAccessService.isEnabledFor`: un Vendedor necesita `inventoryEnabled` **y** su tienda habilitada (`StoreInventoryAccess`). Mensaje 403 propio: "Todavía no tienes acceso a Inventario.". Cubre inventario, registro, movimientos y solicitudes de stock (todos pasan por este servicio).
- `UpdateUserDto`: `inventoryEnabled?` opcional (`PATCH /users/:id`). `UsersService.updateUser` lo guarda solo para VENDEDOR (otros roles quedan en false; si se omite, se conserva el valor actual).
- `UserResponseDoc` (y por herencia `GET /auth/me`): expone `inventoryEnabled` (null → false).

## Razones del cambio
La habilitación por tienda abría Inventario a todos los Vendedores de esa tienda. Se necesitaba un piloto por persona sin perder el control por tienda (que indica que el stock ya fue cargado).

## Resultado final
Todos los Vendedores quedan sin acceso por defecto. Super admin activa el acceso individual en Usuarios → Editar. `nest build` y 102 tests en verde.
