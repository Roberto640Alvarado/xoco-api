# CORS en xoco-api + xoco-app en otro puerto

## Contexto

Pediste mover `xoco-app` a otro puerto. Al revisar `main.ts` de `xoco-api`
para confirmar que nada dependía del puerto 3000, encontré que **CORS nunca
se había habilitado** — un bug real que no se había notado porque toda la
verificación hasta ahora fue con `curl` (que no aplica la política CORS del
navegador). El axios client-side de `xoco-app` (`lib/api/client.ts`) llama
a `xoco-api` desde el navegador; al vivir en otro puerto es otro origin, así
que sin CORS el navegador habría bloqueado silenciosamente todas las
respuestas (login incluido) aunque el request "funcionara" del lado del
servidor.

## Cambios

- `xoco-api/src/main.ts`: `app.enableCors({ origin: [...] })`, con una lista
  por defecto (`http://localhost:3000`, `http://localhost:3010`) y override
  opcional vía `CORS_ORIGIN` (coma-separado) en `.env` para cuando esto se
  despliegue de verdad. No se usa `credentials: true` — la API se llama solo
  con header `Authorization`, sin cookies.
- `xoco-app/package.json`: `dev`/`start` ahora fijan `-p 3010` (antes usaban
  el puerto 3000 por defecto de Next). `NEXT_PUBLIC_API_URL` no cambia — es
  el puerto de la API (4005), no el de la app.

## Verificación en vivo

Con el servidor real corriendo: preflight `OPTIONS` con
`Origin: http://localhost:3010` → `204` con
`Access-Control-Allow-Origin: http://localhost:3010`; `POST /auth/login`
con ese mismo header `Origin` → `200` con el header CORS presente en la
respuesta real (no solo en el preflight).
