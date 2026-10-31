# Conector MCP para Claude y ChatGPT (Admin y Finanzas)

## Objetivo
Que Super admin y Finanzas consulten desde Claude.ai y ChatGPT cualquier dato de xoco-api y de Odoo, solo lectura.

## Cambios realizados
- Dependencias: `@modelcontextprotocol/sdk`, `zod`.
- Módulo `src/mcp`:
  - OAuth 2.1 propio: `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server` (y alias), `POST /oauth/register` (registro dinámico), `GET/POST /oauth/authorize` (página de login con correo y contraseña del panel, solo SUPER_ADMIN/FINANZAS activos), `POST /oauth/token` (código con PKCE S256, refresh con rotación). Modelos `OAuthClient`, `OAuthAuthCode`, `OAuthRefreshToken` (hashes).
  - `/mcp` (Streamable HTTP sin estado) con 401 + `WWW-Authenticate` para iniciar el login. Access token JWT con clave propia (`JWT_SECRET::mcp`, aud `xoco-mcp`), usuario revalidado en cada llamada.
  - Herramientas de solo lectura: `whoami`, `xoco_endpoints`, `xoco_get` (GET interno a la API con un token corto del panel de la persona; catálogo desde el OpenAPI que arma `main.ts`; bloquea `/auth`, `/oauth`, `/mcp`, `/.well-known`, `/odoo/config`), `odoo_models`, `odoo_fields`, `odoo_search_read`, `odoo_count`, `odoo_read_group` (modelos sensibles bloqueados).
- `OdooRepository/OdooService`: métodos genéricos de lectura (search_read, search_count, read_group, fields_get).
- `main.ts`: `trust proxy` y documento OpenAPI para el catálogo. `.env.example`: `PUBLIC_API_URL`. Guía en `docs/conector-mcp.md`.
- Tests: crypto/PKCE, flujo OAuth completo (roles, código de un uso, rotación, usuario desactivado, clave separada) y herramientas con un cliente MCP real en memoria.

## Razones del cambio
Dar a Admin/Finanzas consultas libres en lenguaje natural sin abrir el panel, reutilizando los mismos permisos de la API.

## Resultado final
`tsc`, build y oxlint sin errores; 140 tests en verde. Pendiente: desplegar, configurar `PUBLIC_API_URL` y conectar desde Claude/ChatGPT.
