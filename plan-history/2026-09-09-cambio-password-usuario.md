# PATCH /users/:id/password: restablecer contraseña de un usuario

## Contexto

Ver plan-history de xoco-app ("guardia-admin-cambio-password-rediseno") para el pedido completo (guarda de ruta + esto + rediseño). Este archivo cubre solo el endpoint nuevo.

## Diseño

Mismo patrón que `POST /users` (`UsersController.create` / `UsersService.createUser`):

- **`SetUserPasswordDto`** (`src/users/dto/set-user-password.dto.ts`): `password` + `confirmPassword`, ambos `@IsString() @MinLength(8)`.
- **`UsersService.setPassword(targetUserId, dto)`**: `password !== confirmPassword` → `BadRequestException`; usuario no encontrado → `NotFoundException`; si pasa, `bcrypt.hash(dto.password, BCRYPT_COST)` (mismo costo 12 que `createUser`) y `usersRepository.setPassword(...)`.
- **`UsersRepository.setPassword(id, hashedPassword)`**: `prisma.user.update({ where: { id }, data: { password: hashedPassword } })`.
- **`UsersController`**: `PATCH /users/:id/password`, mismo `@Roles(Role.SUPER_ADMIN)` de clase que el resto del controller (no hay override de método) — no accesible para FINANZAS. Responde `UserResponseDoc` (nunca expone el hash).

No se restringió que un SUPER_ADMIN cambie su propia contraseña por esta vía (a diferencia de `setActive`, que sí bloquea la auto-desactivación) — no se pidió esa restricción y no hay riesgo de dejar a nadie sin acceso al hacerlo.

## Verificación

`npm run build` y `npm run lint` limpios. Probado en proceso con `NestFactory.createApplicationContext` (mismo método ya usado para `/sales/reconciliation` en esta sesión): script temporal que crea un usuario de prueba, prueba los 3 casos (`password !== confirmPassword`, id inexistente, caso válido), confirma con `usersService.validatePassword` que el hash nuevo valida la contraseña nueva y ya no la vieja, y borra el usuario de prueba directo por Prisma al final (no hay endpoint de borrado en la app). Script borrado después de correrlo.

No se probó por HTTP real (Postman) porque no hay credenciales de un SUPER_ADMIN real disponibles en esta sesión para obtener un JWT — la verificación en proceso ejercita la misma lógica de negocio (validación, hash, escritura en Mongo) sin pasar por la capa de auth.
