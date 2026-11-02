# Xoco IA: chat con Claude y OpenAI (backend)

## Objetivo
Que el chat "Xoco IA" del panel (solo Super admin) responda con Claude u OpenAI usando los datos de Xoco y Odoo, con gráficas y tablas.

## Cambios realizados
- Módulo `src/ai-chat`: `GET /ai-chat/config` y `POST /ai-chat/stream` (text/event-stream con eventos start, tool, text, chart, table, done, error), solo SUPER_ADMIN.
- Proveedores por fetch directo (sin SDK): `AnthropicProvider` (Messages API) y `OpenAiProvider` (Chat Completions con function calling). Llaves `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` solo en el servidor.
- Modelos fijos (cambiables por variable): Claude `claude-sonnet-5-5` (`AI_CLAUDE_MODEL`), OpenAI `gpt-6.1-sol` (`AI_OPENAI_MODEL`).
- Herramientas: las mismas del conector MCP, usadas en proceso con un cliente MCP en memoria (`AiChatToolsService`), más `mostrar_grafica` y `mostrar_tabla` validadas con zod.
- Bucle del agente con máximo 10 pasos, salida de herramientas recortada a 24k caracteres, latido SSE cada 15 s y corte si el usuario cierra.
- `/ai-chat` fuera del catálogo de `xoco_get`. Pruebas del bucle, de errores del proveedor, del límite de pasos y de las herramientas.

## Razones
Reusar las herramientas del MCP evita duplicar reglas (cifra oficial, permisos, solo lectura). Sonnet 5.5 y GPT-6.1 Sol son el escalón equilibrado de cada proveedor para análisis con herramientas, al mismo precio ($2 / $10 por millón de tokens).

## Resultado final
Con las llaves en Railway, el Super admin elige Claude o ChatGPT en el chat y recibe respuestas con datos, gráficas y tablas.

## Actualización: llaves desde el panel y registro de gasto
- Modelos `AiProviderKey` (llave cifrada AES-256-GCM con `AI_KEYS_SECRET` o derivada de `JWT_SECRET`, últimos 4, estado de la última prueba) y `AiUsageLog` (pregunta, usuario, modelo, tokens, costo, pasos, estado, duración).
- `GET/PUT/DELETE /ai-chat/keys[/:provider]` y `POST /ai-chat/keys/:provider/test`: cada llave nueva se prueba con una petición mínima al modelo fijo; inválida o sin acceso al modelo no se guarda, sin crédito se guarda con aviso. La llave del panel tiene prioridad sobre la variable de entorno.
- `GET /ai-chat/usage`: totales, por día local, por IA/modelo, por usuario y cada consulta paginada. El costo se estima con el precio por millón de tokens del modelo (`ai-pricing.util.ts`, ajustable por variables).
- Cada pregunta del chat se registra al terminar (respondida, con error o detenida); si falla el registro, el chat no se rompe.

## Actualización: historial de chats
- Modelos `AiConversation` y `AiConversationMessage` (la respuesta guarda sus bloques: pasos, texto, gráficas, tablas, errores).
- `GET /ai-chat/conversations[?search]`, `GET/PATCH/DELETE /ai-chat/conversations/:id`: siempre filtrados por el usuario conectado (404 si el chat es de otro).
- `POST /ai-chat/stream` ahora recibe `{ provider, conversationId?, message }`: crea el chat si no existe (evento `conversation`), arma el historial desde lo guardado y guarda pregunta y respuesta (también si se detiene o falla).

## Corrección: OpenAI por la Responses API
- GPT-6.1 Sol rechazaba herramientas en `/v1/chat/completions` ("Function tools with reasoning_effort are not supported… use /v1/responses"). `OpenAiProvider` ahora usa `/v1/responses` con `store: false`, `include: ['reasoning.encrypted_content']` y herramientas `strict: false`; cada paso devuelve su salida (razonamiento, texto, llamadas) como entrada del siguiente, más `function_call_output`.
- La prueba de llaves de OpenAI también usa `/v1/responses`.

## Actualización: privacidad del gasto y filtro por usuario
- `AiUsageLog` ya no guarda el texto de la pregunta (ni lo devuelve `GET /ai-chat/usage`).
- `byUser` siempre trae a todos los usuarios del período (para el filtro), aunque se filtre por uno; los totales, días, IA y registro sí respetan el filtro.

## Actualización: título automático del chat
- Al terminar la primera respuesta de un chat nuevo, la misma IA propone un título corto (2 a 6 palabras), `cleanTitle` lo limpia, se guarda y llega como evento `title`. Si falla, queda el inicio de la pregunta. Los proveedores aceptan `maxTokens` y omiten herramientas cuando no hay.
