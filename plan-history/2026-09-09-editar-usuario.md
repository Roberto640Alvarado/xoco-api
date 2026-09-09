# PATCH /users/:id: editar correo, nombre y rol de un usuario

## Contexto

Ver plan-history de xoco-app ("skeletons-y-editar-usuario") para el pedido completo. Este archivo cubre solo el endpoint nuevo (el cambio de contraseña ya estaba cubierto por "cambio-password-usuario").

## Diseño

Mismo patrón que el resto de `UsersController`/`UsersService`/`UsersRepository`:

- **`UpdateUserDto`** (`src/users/dto/update-user.dto.ts`): `email` (requerido, `@IsEmail`), `name` (opcional), `role` (requerido, `@IsEnum(Role)`). No incluye contraseña — eso sigue siendo `PATCH /users/:id/password`.
- **`UsersService.updateUser(targetUserId, dto, actingUserId)`**:
  - Usuario no encontrado → `NotFoundException`.
  - Si el correo cambia y ya lo tiene OTRO usuario → `ConflictException` (mismo chequeo que `createUser`, pero excluyendo al propio usuario que se edita).
  - Si `dto.role` es distinto al rol actual Y `targetUserId === actingUserId` → `ForbiddenException` ("No puedes cambiar tu propio rol.") — mismo criterio de "no quedarte afuera sin que nadie más pueda arreglarlo" que ya usa `setActive` con la auto-desactivación. Editar el propio correo/nombre SIN tocar el rol sí está permitido.
- **`UsersRepository.updateUser(id, data)`**: `prisma.user.update({ where: { id }, data: { email, name, role } })`.
- **`UsersController`**: `PATCH /users/:id`, mismo `@Roles(Role.SUPER_ADMIN)` de clase (sin override). No colisiona con `PATCH /users/:id/active` ni `PATCH /users/:id/password` — son patrones de 2 segmentos, este es de 1.

## Verificación

`npm run build` y `npm run lint` limpios. Probado en proceso con `NestFactory.createApplicationContext` (mismo método que el resto de esta sesión): crea 2 usuarios de prueba, edita correo/nombre/rol del primero (actuando otro admin), prueba el conflicto de correo contra el segundo, prueba que el propio usuario NO pueda cambiar su rol, prueba que SÍ pueda editar su propio nombre sin tocar el rol, prueba id inexistente, y borra ambos usuarios de prueba al final. Script borrado después de correrlo.
