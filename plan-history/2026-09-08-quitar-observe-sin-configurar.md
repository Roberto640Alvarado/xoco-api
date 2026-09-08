# Quitar @nestjs/observe (telemetría) mientras no esté configurado

## Contexto

El usuario reportó este error en consola al levantar la API:

```
ERROR [ObserveAgentWorker] Error: Telemetry rejected (401). Check that
appKey and appSecret are valid...
```

Causa: `app.module.ts` seguía registrando `ObserveModule.forRoot({...})`
con credenciales de ejemplo literales (`'YOUR_APP_KEY'`/`'YOUR_APP_SECRET'`)
— quedaron ahí desde el scaffold inicial de `nest new`, a pesar de que el
usuario ya había decidido explícitamente dejar Observe sin configurar. Con
esas credenciales, la app SÍ intentaba mandar telemetría a
observe.nestjs.com en cada arranque y recibía un 401 — inofensivo para la
API en sí (arranca y sirve normal, es un intento de red aparte), pero
genera este ERROR confuso en consola y una llamada de red que nunca iba a
funcionar.

## Cambio

Se quitó `createObserveModule()`/`ObserveModule.forRoot(...)` de
`app.module.ts` y `instrument: ObserveInstrument` de `main.ts` por
completo — no solo "no configurado", sino fuera del todo. La dependencia
`@nestjs/observe` se deja instalada en `package.json` por si se activa más
adelante; quedó un comentario en `app.module.ts` con los pasos para
reactivarlo (crear cuenta real, credenciales por variable de entorno).

## Verificación

`npm run build` — 0 errores (se topó primero con un `EPERM` al borrar
`dist/` porque el permiso de borrado del bridge remoto no persistió entre
sesiones de trabajo; se volvió a otorgar). Servidor real levantado: log de
arranque limpio, sin ningún ERROR, todas las rutas mapeadas correctamente
(`/auth/*`, `/odoo/config`, `/sales/*`).
