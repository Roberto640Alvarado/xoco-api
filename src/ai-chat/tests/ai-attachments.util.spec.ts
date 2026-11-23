import { describe, expect, it } from 'vitest';
import { MAX_AI_ATTACHMENTS, MAX_AI_IMAGE_BYTES, prepareAttachments, toAttachmentContent } from '../utils/ai-attachments.util.js';
import { toAnthropicMessage } from '../providers/anthropic.provider.js';
import { toOpenAiItem } from '../providers/openai.provider.js';

const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64');

describe('prepareAttachments', () => {
  it('acepta imágenes, PDF y texto y deja el texto decodificado', () => {
    const result = prepareAttachments([
      { name: 'foto.jpg', mimeType: 'image/jpeg', data: b64('jpeg') },
      { name: 'reporte.pdf', mimeType: 'application/pdf', data: b64('%PDF-1.7 ...') },
      { name: 'ventas.csv', mimeType: 'text/csv', data: b64('﻿mes,total\noct,10') },
    ]);
    expect(result.map((file) => file.kind)).toEqual(['image', 'pdf', 'text']);
    expect(result[2].data).toBe('mes,total\noct,10');
    expect(result[0].size).toBe(4);
  });

  it('rechaza tipos no soportados, PDF falsos, archivos vacíos o pesados y demasiados archivos', () => {
    expect(() => prepareAttachments([{ name: 'a.exe', mimeType: 'application/x-msdownload', data: b64('x') }])).toThrow('no se puede leer');
    expect(() => prepareAttachments([{ name: 'a.pdf', mimeType: 'application/pdf', data: b64('hola') }])).toThrow('no parece un PDF');
    expect(() => prepareAttachments([{ name: 'a.txt', mimeType: 'text/plain', data: '' }])).toThrow('vacío');
    expect(() => prepareAttachments([{ name: 'big.png', mimeType: 'image/png', data: b64(Buffer.alloc(MAX_AI_IMAGE_BYTES + 1)) }])).toThrow('pesa más de 5 MB');
    const many = Array.from({ length: MAX_AI_ATTACHMENTS + 1 }, (_, index) => ({ name: `${index}.txt`, mimeType: 'text/plain', data: b64('x') }));
    expect(() => prepareAttachments(many)).toThrow(`hasta ${MAX_AI_ATTACHMENTS} archivos`);
  });

  it('recorta archivos de texto enormes antes de pasarlos a la IA', () => {
    const content = toAttachmentContent({ name: 'big.txt', mimeType: 'text/plain', kind: 'text', data: 'a'.repeat(250_000) });
    expect(content.kind === 'text' && content.text).toContain('archivo recortado');
  });
});

describe('adjuntos en los proveedores', () => {
  const message = {
    role: 'user' as const,
    content: '¿Qué dice?',
    attachments: [
      { kind: 'image' as const, name: 'foto.png', mimeType: 'image/png', data: 'AAA' },
      { kind: 'pdf' as const, name: 'reporte.pdf', data: 'JVBE' },
      { kind: 'text' as const, name: 'ventas.csv', text: 'mes,total' },
    ],
  };

  it('Claude: imagen, documento y texto antes de la pregunta', () => {
    expect(toAnthropicMessage(message)).toEqual({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
        { type: 'document', title: 'reporte.pdf', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBE' } },
        { type: 'text', text: 'Archivo adjunto "ventas.csv":\n\nmes,total' },
        { type: 'text', text: '¿Qué dice?' },
      ],
    });
    expect(toAnthropicMessage({ role: 'assistant', content: 'Hola' })).toEqual({ role: 'assistant', content: 'Hola' });
  });

  it('OpenAI: input_image, input_file e input_text', () => {
    expect(toOpenAiItem(message)).toEqual({
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_image', image_url: 'data:image/png;base64,AAA' },
        { type: 'input_file', filename: 'reporte.pdf', file_data: 'data:application/pdf;base64,JVBE' },
        { type: 'input_text', text: 'Archivo adjunto "ventas.csv":\n\nmes,total' },
        { type: 'input_text', text: '¿Qué dice?' },
      ],
    });
    expect(toOpenAiItem({ role: 'user', content: 'Hola' })).toEqual({ type: 'message', role: 'user', content: 'Hola' });
  });
});
