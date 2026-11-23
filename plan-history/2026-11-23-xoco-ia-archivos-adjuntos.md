# Xoco IA: archivos adjuntos en el chat

## Objetivo
Permitir subir imágenes y archivos en el chat de Xoco IA para que Claude u OpenAI los lean y respondan sobre ellos.

## Cambios realizados
- `POST /ai-chat/stream` acepta `attachments` (hasta 5: `name`, `mimeType`, `data` en base64). El mensaje puede ir vacío si hay archivos.
- Tipos soportados: PNG, JPG, GIF, WebP (≤ 5 MB), PDF (≤ 10 MB), TXT/CSV/TSV/Markdown/JSON (≤ 2 MB); 20 MB en total. Los Excel los convierte el panel a CSV.
- `utils/ai-attachments.util.ts`: validación (tipo, tamaño, firma `%PDF-`, vacíos) y conversión a contenido para la IA (texto recortado a 200 mil caracteres).
- Proveedores: Claude recibe bloques `image` / `document` / `text`; OpenAI (Responses API) recibe `input_image` / `input_file` / `input_text`.
- Nueva colección `ai_conversation_attachments` y campo `attachments` (solo metadatos) en `ai_conversation_messages`.
- En preguntas siguientes del mismo chat, la IA vuelve a recibir los archivos guardados (como en ChatGPT).
- Nuevo evento de stream `attachments` (ids guardados) y nuevo `GET /ai-chat/conversations/:id/attachments/:attachmentId` (solo el dueño del chat).
- Límite del body JSON subido a 30 MB en `main.ts`.
- Pruebas: `ai-attachments.util.spec.ts` (validación y formato por proveedor) y casos nuevos en `ai-conversations.service.spec.ts`.

## Razones del cambio
El chat solo aceptaba texto. Subir capturas, tickets, PDFs o reportes en Excel permite pedirle a Xoco IA que los compare con los datos del panel.

## Resultado final
Pruebas del módulo `ai-chat` en verde. Pendiente correr `npx prisma generate` tras el cambio de `schema.prisma`.
