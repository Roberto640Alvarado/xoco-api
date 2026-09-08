# Módulo Auth (JWT + roles) y protección de Sales

## Contexto

Con Odoo y Sales ya funcionando, se construyó la autenticación de la API:
login con JWT, guards globales, y `@Roles()` para restringir endpoints por
rol (`SUPER_ADMIN` / `FINANZAS`), siguiendo el mismo patrón ya usado en
`ecoguide-api` (adaptado en `xocolatisimo-api-CLAUDE.md`).

No existe endpoint de registro — los usuarios se crean directamente en la
base (hoy solo vía `prisma/seed.mjs`, que ya crea el `SUPER_ADMIN` inicial).

## Diseño

- `common/interfaces/jwt-payload.interface.ts` — `JwtPayload` (lo que se firma) y `AuthenticatedUser` (lo que queda en `request.user`).
- `common/decorators/`: `@Public()` (salta el guard global), `@Roles(...)` (restringe por rol), `@User()` (extrae `request.user`, entero o por propiedad).
- `common/guards/jwt-auth.guard.ts` — extiende `AuthGuard('jwt')` de Passport, respeta `@Public()`.
- `common/guards/roles.guard.ts` — si el endpoint no tiene `@Roles()`, cualquier usuario autenticado pasa; si lo tiene, exige que `request.user.role` esté en la lista.
- Ambos guards registrados **globalmente** en `app.module.ts` vía `APP_GUARD` (orden: `JwtAuthGuard` primero, `RolesGuard` después) — así cualquier endpoint nuevo queda protegido por defecto, y hay que optar explícitamente por `@Public()` para exponerlo sin token.
- `users/` (nuevo, mínimo): `UsersRepository` (Prisma), `UsersService` (`findByEmail`, `findById`, `validatePassword` con bcrypt) — sin controller ni endpoint propio todavía, solo lo consume `auth`.
- `auth/`: `AuthService.login()` valida credenciales (bcrypt), verifica `isActive`, firma el JWT (`sub`, `email`, `role`) y devuelve `{ accessToken, user }` (`UserResponseDoc` vía `class-transformer`, nunca expone `password`). `AuthController`: `POST /auth/login` (`@Public()`) y `GET /auth/me` (protegido, usa `@User('id')`).
- `JwtStrategy.validate()` vuelve a consultar la base por `payload.sub` en cada request (no confía ciegamente en lo firmado) y rechaza si el usuario ya no existe o está inactivo.
- `JwtModule.registerAsync` con `useFactory` (en vez de `JwtModule.register` directo): el factory se evalúa al instanciar el módulo durante el bootstrap de Nest, no al importar el archivo — para ese momento `process.env.JWT_SECRET` ya está poblado (el cliente Prisma generado carga el `.env` como efecto secundario al importarse, y `PrismaModule` se importa antes que `AuthModule` en `app.module.ts`). Mismo patrón que ya usa `OdooService` con `ODOO_BASE_URL`/`ODOO_DB` — no se usa `@nestjs/config`/`ConfigService` en este proyecto, se lee `process.env` directo.
- `SalesController` ahora lleva `@Roles(Role.SUPER_ADMIN, Role.FINANZAS)` a nivel de controller (ambos roles pueden ver ventas/reportes, según CLAUDE.md) + `@ApiBearerAuth()`. Se quitó el TODO de "sin proteger".

## Verificación en vivo

Servidor real levantado contra Mongo Atlas real (dentro de una sola invocación de shell, mismo patrón que en el módulo Sales):

- `POST /auth/login` con password incorrecto → `401`.
- `POST /auth/login` con las credenciales reales del `SUPER_ADMIN` sembrado (`xocoprojectsv@gmail.com`) → `200`, devuelve `accessToken` + `user` (sin `password`).
- `GET /sales/orders` sin header `Authorization` → `401` (guard global funcionando).
- `GET /sales/orders` con `Authorization: Bearer <token>` → `200`, datos reales de Odoo.
- `GET /auth/me` con el token → devuelve el mismo usuario.

`npm run build` y `npm run lint` (oxlint) — 0 errores.

## Pendiente

- No hay ningún usuario `FINANZAS` sembrado todavía — el `@Roles()` de Sales nunca se probó en vivo contra ese rol específico (la lógica es la misma que ya usa `RolesGuard`, no hay motivo para que se comporte distinto, pero queda como verificación pendiente en cuanto exista una cuenta `FINANZAS`).
- No hay endpoint para que `SUPER_ADMIN` cree usuarios `FINANZAS` desde el panel — hoy solo se pueden crear editando la base directamente. Es el siguiente paso natural del módulo `users`.
- `pos.payment` (pagos individuales) — sigue pendiente el ejemplo real del usuario.
