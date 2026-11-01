# Conector MCP de Xocolatísimo (Claude y ChatGPT)

Permite que **solo el Super admin** pregunte en Claude o ChatGPT por cualquier dato del panel (xoco-api) y de Odoo. **Solo lectura**: no puede modificar nada.

## Qué necesita la API publicada

1. Desplegar esta versión de xoco-api (incluye el módulo `mcp` y 3 colecciones nuevas: `oauth_clients`, `oauth_auth_codes`, `oauth_refresh_tokens`).
2. Variable de entorno **`PUBLIC_API_URL`** con la URL pública https de la API, sin "/" final (ej. `https://api.xocolatisimo.com`).
3. La dirección del conector es: **`https://<tu-api>/mcp`**

En producción (Railway): `PUBLIC_API_URL=https://xoco-api-production.up.railway.app` y el conector es **`https://xoco-api-production.up.railway.app/mcp`**.

Para comprobarlo: abrir `https://<tu-api>/.well-known/oauth-protected-resource` debe mostrar un JSON con `"resource": "https://<tu-api>/mcp"`.

## Conectarlo en Claude

En Claude, en la configuración de **Conectores**, agregar un **conector personalizado** con la URL `https://<tu-api>/mcp`. Al pulsar **Conectar** se abre la página de Xocolatísimo: entrar con el correo y la contraseña del panel. (En planes de equipo, el dueño de la organización puede agregarlo para todos y cada persona conecta su propia cuenta.)

## Conectarlo en ChatGPT

En ChatGPT, en la configuración de **Conectores / Apps** (puede requerir activar el modo de desarrollador según el plan), crear un conector con la URL `https://<tu-api>/mcp` y autenticación **OAuth**. ChatGPT se registra solo; al conectar se abre la misma página de inicio de sesión.

> La disponibilidad de conectores personalizados depende del plan de Claude/ChatGPT y puede cambiar; revisar la ayuda de cada uno.

## Qué puede consultar

| Herramienta | Para qué |
| --- | --- |
| `xoco_endpoints` | Lista las consultas del panel (ventas, metas, tiendas, inventario, kardex, solicitudes, recetas...) con sus parámetros. |
| `xoco_get` | Ejecuta una de esas consultas con los permisos de la persona conectada. |
| `odoo_models`, `odoo_fields` | Descubrir modelos y campos de Odoo. |
| `odoo_search_read`, `odoo_count`, `odoo_read_group` | Leer, contar y agrupar/sumar cualquier modelo de Odoo. |
| `whoami` | Con qué usuario está conectado. |

Ejemplos de preguntas: "¿Cuánto vendió Centrika ayer por método de pago?", "Kardex de Pacamara en Centrika este mes", "Top 10 productos de octubre en todas las tiendas", "Facturas de mayoreo pendientes de este mes".

## Seguridad

- Solo **SUPER_ADMIN** y **FINANZAS** activos pueden iniciar sesión; se revalida en cada llamada (si se desactiva o cambia de rol, deja de funcionar al momento).
- OAuth 2.1 con PKCE S256 obligatorio; códigos de un solo uso (5 min); access token de 1 h firmado con una clave distinta a la del panel; refresh token de 30 días que se rota en cada uso. Códigos y tokens se guardan hasheados.
- `xoco_get` solo permite GET a rutas conocidas y usa un token del panel de la persona (mismos permisos que en pantalla). No expone login ni la configuración del API key de Odoo.
- Odoo se consulta con el API key configurado (usuario de Odoo de ese key), sin métodos de escritura; se bloquean modelos de credenciales/configuración técnica y adjuntos.
- Para desconectar: quitar el conector en Claude/ChatGPT. Para cortar el acceso de alguien: desactivarlo o cambiarle el rol en Usuarios.

## Herramientas directas (v1.1)
`xoco_tiendas`, `xoco_ventas_por_dia`, `xoco_ventas_por_tienda`, `xoco_productos_mas_vendidos`, `xoco_metas_del_mes`, `xoco_inventario_tienda`, `xoco_kardex`. El asistente las usa cuando se menciona Xoco o Xocolatísimo. Las genéricas (`xoco_get`, `odoo_*`) siguen para lo demás.

## Ícono
La API sirve `/favicon.ico` e `/icon.png`, y el servidor MCP anuncia su ícono. Claude puede tardar en actualizar el ícono de un conector ya agregado: si sigue saliendo el de Railway, quita el conector y vuelve a agregarlo. Con un dominio propio (ej. `api.xocolatisimo.com.sv`) el ícono deja de depender de railway.app.
