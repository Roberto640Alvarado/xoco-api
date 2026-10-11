# Historial de API keys de Odoo

## Objetivo
Guardar registro de las API keys de Odoo (la activa y las pasadas) para mostrarlo en Administración.

## Cambios realizados
- `OdooConfig`: campo nuevo `createdByEmail` (opcional). Cada rotación crea un documento nuevo y desactiva los anteriores, en vez de actualizar el único existente.
- `GET /odoo/config/history` (solo Super admin): todas las keys enmascaradas, la más nueva primero, con estado y quién la registró.
- `PUT /odoo/config` guarda el correo de quien registra la key.

## Resultado final
`prisma generate` y `tsc` sin errores nuevos (solo el error previo de `supertest` en los tests e2e).
