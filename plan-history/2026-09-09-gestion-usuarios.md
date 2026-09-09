# Gestión de usuarios: crear, listar, activar/desactivar

## Contexto

Quedaba pendiente desde antes (la sección "Usuarios" del panel de Administración estaba marcada "Próximamente" — ver plan-history "sidebar-lateral-como-ecoguide"): no había forma de que un SUPER_ADMIN diera de alta una cuenta FINANZAS desde el panel — solo existía `prisma/seed.mjs` para el superadmin inicial.

Pedido textual: "hace lo de gestion de usuarios, osea el Admin puede agregar un usuario y debe de confirma si es ese usuario y el le asigna una contraseña / y ya y pued ever los usuarios que existen". Se resolvieron 2 ambigüedades con `AskUserQuestion`:

- Contraseña: el admin la escribe 2 veces (password + confirmar contraseña) — no se genera al azar ni hay invitación por correo.
- Alcance: crear + listar + activar/desactivar (no editar rol/nombre, no borrar).

## Diseño

**`src/users/`** (ya existía `UsersRepository`/`UsersService`, usados hasta ahora solo por Auth — no había `UsersController`):

- `repositories/users.repository.ts` — se agregó `findAll()`, `create()` y `setActive()`.
- `dto/create-user.dto.ts` — `email`, `name?`, `role` (`SUPER_ADMIN`/`FINANZAS`), `password` + `confirmPassword` (`@MinLength(8)` en ambos).
- `dto/set-user-active.dto.ts` — `isActive: boolean`.
- `services/users.service.ts`:
  - `createUser()`: valida `password === confirmPassword` (si no, 400), valida correo único (si no, 409 `ConflictException`), hashea con bcrypt costo 12 (mismo costo que usa `prisma/seed.mjs` para el superadmin inicial, para que toda cuenta quede igual de segura sin importar cómo se creó).
  - `setActive(targetUserId, isActive, actingUserId)`: recibe también quién hace la petición — si un SUPER_ADMIN intenta desactivarse a sí mismo, `ForbiddenException` (403). Sin este chequeo, un admin podría quedarse afuera del panel sin que nadie más pudiera reactivarlo.
- `controllers/users.controller.ts` — nuevo. `@Roles(SUPER_ADMIN)` a nivel de clase (FINANZAS no administra cuentas). `GET /users`, `POST /users`, `PATCH /users/:id/active`. Nunca expone `password` (usa `UserResponseDoc`, que ya existía con `@Expose()` explícito por campo).
- `users.module.ts` — se registró el controller (ya estaba importado en `app.module.ts`, así que el controller queda expuesto sin más cambios ahí).

**Verificación funcional** (con un SUPER_ADMIN de prueba creado directo en Mongo — nunca con la contraseña real de producción — y el server levantado localmente, borrado todo después):

- `GET /users` sin token → 401; con token → lista correcta.
- `POST /users` con contraseñas que no coinciden → 400 `"Las contraseñas no coinciden."`.
- `POST /users` con correo duplicado → 409 `"Ya existe un usuario con ese correo."`.
- `POST /users` válido → 201, usuario creado, sin `password` en la respuesta.
- `PATCH /users/:id/active` con `isActive:false` → 200, y ese usuario ya no puede hacer login (`POST /auth/login` → 401 "Esta cuenta se encuentra desactivada.").
- Un SUPER_ADMIN intentando desactivarse a sí mismo → 403.
- Reactivar → 200, vuelve a poder loguearse.

## Pendiente

- No se pudo hacer una prueba de clic-a-clic en el navegador contra la UI real de xoco-app en esta sesión (el entorno donde corre este asistente no mantiene procesos en segundo plano — como `npm run dev`/`node dist/main.js` — vivos entre una llamada de herramienta y la siguiente, así que no hay forma de dejar ambos servidores arriba el tiempo suficiente para interactuar con el navegador). El backend sí quedó probado de punta a punta por HTTP real (ver arriba). El usuario debe revisar la UI en vivo y confirmar que el formulario/tabla/switch se ven y funcionan como espera.
