import { BadRequestException } from '@nestjs/common';
import { AiAttachmentContent } from '../providers/provider.types.js';

// Archivos que Xoco IA puede leer en el chat. Claude y OpenAI leen imágenes
// y PDF directo; los de texto se mandan como texto. Los Excel los convierte
// el panel a CSV antes de subirlos (así la IA ve celdas, no binario).

export const AI_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export const AI_PDF_MIME_TYPE = 'application/pdf';
export const AI_TEXT_MIME_TYPES = ['text/plain', 'text/csv', 'text/markdown', 'text/tab-separated-values', 'application/json'] as const;
export const AI_ATTACHMENT_MIME_TYPES: string[] = [...AI_IMAGE_MIME_TYPES, AI_PDF_MIME_TYPE, ...AI_TEXT_MIME_TYPES];

export const MAX_AI_ATTACHMENTS = 5;
/** Límites por archivo (bytes reales). Las imágenes: tope de Claude (5 MB). */
export const MAX_AI_IMAGE_BYTES = 5 * 1024 * 1024;
/** PDF: 10 MB para que el documento guardado quepa en Mongo (16 MB en base64). */
export const MAX_AI_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_AI_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_AI_TOTAL_BYTES = 20 * 1024 * 1024;
/** Tope del base64 (4/3 del archivo más grande) para validar el DTO. */
export const MAX_AI_ATTACHMENT_BASE64_LENGTH = Math.ceil((MAX_AI_PDF_BYTES * 4) / 3) + 4;
/** Texto máximo que se le pasa a la IA por archivo (evita reventar el contexto). */
export const MAX_AI_TEXT_CHARS = 200_000;

export type AiAttachmentKind = AiAttachmentContent['kind'];

export interface PreparedAttachment {
  name: string;
  mimeType: string;
  kind: AiAttachmentKind;
  size: number;
  /** base64 para imagen/PDF; texto plano para archivos de texto. */
  data: string;
}

/** Lo que se guarda en el mensaje para mostrar los adjuntos (sin el contenido). */
export interface StoredAttachmentMeta {
  id: string;
  name: string;
  mimeType: string;
  kind: AiAttachmentKind;
  size: number;
}

export function attachmentKind(mimeType: string): AiAttachmentKind | null {
  if ((AI_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return 'image';
  if (mimeType === AI_PDF_MIME_TYPE) return 'pdf';
  if ((AI_TEXT_MIME_TYPES as readonly string[]).includes(mimeType)) return 'text';
  return null;
}

const MB = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/** Valida tipos y tamaños y deja cada archivo listo para guardar; 400 con un mensaje claro si algo no cuadra. */
export function prepareAttachments(inputs: { name: string; mimeType: string; data: string }[] | undefined): PreparedAttachment[] {
  if (!inputs?.length) return [];
  if (inputs.length > MAX_AI_ATTACHMENTS) throw new BadRequestException(`Puedes adjuntar hasta ${MAX_AI_ATTACHMENTS} archivos por mensaje.`);

  let total = 0;
  return inputs.map((input) => {
    const name = input.name.trim().slice(0, 200) || 'archivo';
    const kind = attachmentKind(input.mimeType);
    if (!kind) throw new BadRequestException(`"${name}": ese tipo de archivo no se puede leer. Sube imágenes, PDF, Excel, CSV o texto.`);

    const buffer = Buffer.from(input.data, 'base64');
    if (buffer.length === 0) throw new BadRequestException(`"${name}" está vacío.`);
    total += buffer.length;

    const limit = kind === 'image' ? MAX_AI_IMAGE_BYTES : kind === 'pdf' ? MAX_AI_PDF_BYTES : MAX_AI_TEXT_BYTES;
    if (buffer.length > limit) throw new BadRequestException(`"${name}" pesa más de ${MB(limit)}.`);
    if (total > MAX_AI_TOTAL_BYTES) throw new BadRequestException(`Los archivos juntos pesan más de ${MB(MAX_AI_TOTAL_BYTES)}.`);

    if (kind === 'pdf' && buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new BadRequestException(`"${name}" no parece un PDF válido.`);
    }

    const data = kind === 'text' ? buffer.toString('utf8').replace(/^﻿/, '') : buffer.toString('base64');
    return { name, mimeType: input.mimeType, kind, size: buffer.length, data };
  });
}

/** Archivo guardado → contenido para el proveedor de IA. */
export function toAttachmentContent(attachment: { name: string; mimeType: string; kind: string; data: string }): AiAttachmentContent {
  if (attachment.kind === 'image') return { kind: 'image', name: attachment.name, mimeType: attachment.mimeType, data: attachment.data };
  if (attachment.kind === 'pdf') return { kind: 'pdf', name: attachment.name, data: attachment.data };
  const text =
    attachment.data.length > MAX_AI_TEXT_CHARS
      ? `${attachment.data.slice(0, MAX_AI_TEXT_CHARS)}\n\n[… archivo recortado: solo se leyeron los primeros ${MAX_AI_TEXT_CHARS.toLocaleString('es')} caracteres]`
      : attachment.data;
  return { kind: 'text', name: attachment.name, text };
}
