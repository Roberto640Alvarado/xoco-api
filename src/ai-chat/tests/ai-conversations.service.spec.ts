import { describe, expect, it, vi } from 'vitest';
import { Role, User } from '../../generated/prisma/index.js';
import { AiConversationsService, blocksText, cleanTitle, titleFrom } from '../services/ai-conversations.service.js';
import type { AiConversationsRepository } from '../repositories/ai-conversations.repository.js';
import type { AiChatEvent, AiChatService } from '../services/ai-chat.service.js';

const USER = { id: 'a'.repeat(24), email: 'admin@xoco.com', role: Role.SUPER_ADMIN } as User;
const CONV = { id: 'c'.repeat(24), userId: USER.id, title: 'Ventas', provider: 'claude', createdAt: new Date(), updatedAt: new Date() };

type StoredMessage = { id?: string; role: string; text: string; status?: string | null; attachments?: unknown };

function setup(previous: StoredMessage[] = [], files: Array<Record<string, unknown>> = []) {
  const repository = {
    list: vi.fn(async () => [CONV]),
    findOwned: vi.fn(async (id: string, userId: string) => (id === CONV.id && userId === USER.id ? CONV : null)),
    create: vi.fn(async () => CONV),
    update: vi.fn(async () => CONV),
    messages: vi.fn(async () => previous),
    addMessage: vi.fn(async () => ({ id: 'm'.repeat(24) })),
    addAttachment: vi.fn(async () => ({ id: 'f'.repeat(24) })),
    updateMessageAttachments: vi.fn(async () => undefined),
    attachmentsOf: vi.fn(async () => files),
    findAttachment: vi.fn(async (id: string) => files.find((file) => file.id === id) ?? null),
    remove: vi.fn(async () => undefined),
  };
  const chat = {
    titleSession: vi.fn((_input?: unknown) => ({ step: vi.fn(async () => ({ text: 'Título: "Ventas de Centrika."', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } })), addToolResults: vi.fn() })),
    resolve: vi.fn(async () => ({ model: 'claude-sonnet-5-5', apiKey: 'sk', provider: { startSession: (input: unknown) => chat.titleSession(input) } })),
    run: vi.fn(async ({ emit }: { emit: (event: AiChatEvent) => void }) => {
      emit({ type: 'start', provider: 'claude', label: 'Claude', model: 'claude-sonnet-5-5' });
      emit({ type: 'tool', name: 'xoco_venta_mensual', title: 'Venta Mensual oficial' });
      emit({ type: 'table', table: { titulo: 'Ventas', columnas: [{ titulo: 'Mes' }], filas: [['Oct']] } });
      emit({ type: 'text', text: 'Subió 21%.' });
      emit({ type: 'done', usage: { inputTokens: 1, outputTokens: 1 }, steps: 2 });
    }),
  };
  const service = new AiConversationsService(repository as unknown as AiConversationsRepository, chat as unknown as AiChatService);
  return { service, repository, chat };
}

describe('AiConversationsService', () => {
  it('crea el chat, manda el historial guardado y guarda pregunta y respuesta', async () => {
    const ctx = setup();
    const events: { type: string }[] = [];
    await ctx.service.ask({ user: USER, provider: 'claude', message: '  ¿Cómo le fue a Centrika?  ', emit: (event) => events.push(event) });

    expect(ctx.repository.create).toHaveBeenCalledWith({ userId: USER.id, title: '¿Cómo le fue a Centrika?', provider: 'claude' });
    expect(events[0]).toEqual({ type: 'conversation', id: CONV.id, title: 'Ventas' });
    const runInput = ctx.chat.run.mock.calls[0] as unknown as [{ messages: unknown[] }];
    expect(runInput[0].messages).toEqual([{ role: 'user', content: '¿Cómo le fue a Centrika?' }]);
    const saved = ctx.repository.addMessage.mock.calls.map((call) => (call as unknown as [Record<string, unknown>])[0]);
    expect(saved[0]).toMatchObject({ role: 'user', text: '¿Cómo le fue a Centrika?', userId: USER.id });
    expect(saved[1]).toMatchObject({ role: 'assistant', status: 'done', model: 'claude-sonnet-5-5', text: '[Tabla mostrada: Ventas]\n\nSubió 21%.' });
    expect((saved[1].blocks as { kind: string }[]).map((block) => block.kind)).toEqual(['tool', 'table', 'text']);

    // Título automático al terminar la primera respuesta.
    expect(ctx.chat.titleSession).toHaveBeenCalledWith(expect.objectContaining({ tools: [], maxTokens: 30 }));
    expect(ctx.repository.update).toHaveBeenCalledWith(CONV.id, { title: 'Ventas de Centrika' });
    expect(events.at(-1)).toEqual({ type: 'title', id: CONV.id, title: 'Ventas de Centrika' });
  });

  it('en un chat existente usa lo guardado como historial (sin respuestas con error)', async () => {
    const ctx = setup([
      { role: 'user', text: 'hola' },
      { role: 'assistant', text: 'falló', status: 'error' },
      { role: 'user', text: 'otra vez' },
      { role: 'assistant', text: 'Listo.', status: 'done' },
    ]);
    await ctx.service.ask({ user: USER, provider: 'claude', conversationId: CONV.id, message: 'y ahora?', emit: () => undefined });
    expect(ctx.repository.create).not.toHaveBeenCalled();
    expect(ctx.chat.titleSession).not.toHaveBeenCalled();
    const runInput = ctx.chat.run.mock.calls[0] as unknown as [{ messages: { content: string }[] }];
    expect(runInput[0].messages.map((message) => message.content)).toEqual(['hola', 'otra vez', 'Listo.', 'y ahora?']);
  });

  it('guarda los archivos de la pregunta, avisa al panel y se los pasa a la IA', async () => {
    const ctx = setup();
    const events: Array<Record<string, unknown>> = [];
    await ctx.service.ask({
      user: USER,
      provider: 'claude',
      message: '',
      attachments: [
        { name: 'ticket.png', mimeType: 'image/png', kind: 'image', size: 3, data: 'AAAA' },
        { name: 'ventas.csv', mimeType: 'text/csv', kind: 'text', size: 9, data: 'mes,total' },
      ],
      emit: (event) => events.push(event as Record<string, unknown>),
    });

    expect(ctx.repository.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'ticket.png' }));
    expect(ctx.repository.addAttachment).toHaveBeenCalledTimes(2);
    expect(ctx.repository.addAttachment).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'm'.repeat(24), userId: USER.id, name: 'ticket.png', data: 'AAAA' }));
    expect(ctx.repository.updateMessageAttachments).toHaveBeenCalledWith('m'.repeat(24), [
      { id: 'f'.repeat(24), name: 'ticket.png', mimeType: 'image/png', kind: 'image', size: 3 },
      { id: 'f'.repeat(24), name: 'ventas.csv', mimeType: 'text/csv', kind: 'text', size: 9 },
    ]);
    expect(events.find((event) => event.type === 'attachments')).toMatchObject({ messageId: 'm'.repeat(24) });

    const runInput = ctx.chat.run.mock.calls[0] as unknown as [{ messages: Array<{ content: string; attachments?: unknown[] }> }];
    const last = runInput[0].messages.at(-1);
    expect(last?.content).toContain('Revisa los archivos adjuntos');
    expect(last?.attachments).toEqual([
      { kind: 'image', name: 'ticket.png', mimeType: 'image/png', data: 'AAAA' },
      { kind: 'text', name: 'ventas.csv', text: 'mes,total' },
    ]);
  });

  it('en preguntas siguientes vuelve a pasar los archivos guardados del chat', async () => {
    const meta = [{ id: 'f'.repeat(24), name: 'reporte.pdf', mimeType: 'application/pdf', kind: 'pdf', size: 10 }];
    const ctx = setup(
      [
        { id: '1'.repeat(24), role: 'user', text: 'Lee esto', attachments: meta },
        { id: '2'.repeat(24), role: 'assistant', text: 'Listo, es un reporte.', status: 'done' },
      ],
      [{ id: 'f'.repeat(24), messageId: '1'.repeat(24), name: 'reporte.pdf', mimeType: 'application/pdf', kind: 'pdf', data: 'JVBERi0=' }],
    );
    await ctx.service.ask({ user: USER, provider: 'claude', conversationId: CONV.id, message: '¿Y el total?', emit: () => undefined });

    expect(ctx.repository.attachmentsOf).toHaveBeenCalledWith(CONV.id, USER.id, ['1'.repeat(24)]);
    const runInput = ctx.chat.run.mock.calls[0] as unknown as [{ messages: Array<{ content: string; attachments?: unknown[] }> }];
    expect(runInput[0].messages[0]).toEqual({ role: 'user', content: 'Lee esto', attachments: [{ kind: 'pdf', name: 'reporte.pdf', data: 'JVBERi0=' }] });
    expect(runInput[0].messages.at(-1)).toEqual({ role: 'user', content: '¿Y el total?' });
  });

  it('solo el dueño del chat puede ver sus archivos', async () => {
    const ctx = setup([], [{ id: 'f'.repeat(24), messageId: 'm'.repeat(24), name: 'nota.txt', mimeType: 'text/plain', kind: 'text', data: 'hola' }]);
    await expect(ctx.service.attachment(CONV.id, 'f'.repeat(24), 'b'.repeat(24))).rejects.toThrow('no es tuyo');
    const file = await ctx.service.attachment(CONV.id, 'f'.repeat(24), USER.id);
    expect(file).toMatchObject({ name: 'nota.txt', mimeType: 'text/plain' });
    expect(file.body.toString('utf8')).toBe('hola');
  });

  it('nadie ve, renombra ni borra el chat de otro', async () => {
    const ctx = setup();
    const other = 'b'.repeat(24);
    await expect(ctx.service.get(CONV.id, other)).rejects.toThrow('no es tuyo');
    await expect(ctx.service.rename(CONV.id, other, 'x')).rejects.toThrow('no es tuyo');
    await expect(ctx.service.remove(CONV.id, other)).rejects.toThrow('no es tuyo');
    await expect(ctx.service.ask({ user: { ...USER, id: other } as User, provider: 'claude', conversationId: CONV.id, message: 'x', emit: () => undefined })).rejects.toThrow('no es tuyo');
    expect(ctx.repository.remove).not.toHaveBeenCalled();
    await ctx.service.remove(CONV.id, USER.id);
    expect(ctx.repository.remove).toHaveBeenCalledWith(CONV.id, USER.id);
  });

  it('limpia el título que propone la IA', () => {
    expect(cleanTitle('"Top productos de San Benito".')).toBe('Top productos de San Benito');
    expect(cleanTitle('**Metas de noviembre**\nOtra línea')).toBe('Metas de noviembre');
    expect(cleanTitle('  ')).toBeNull();
  });

  it('título corto y texto de respuesta', () => {
    expect(titleFrom('a'.repeat(80))).toHaveLength(60);
    expect(blocksText([{ kind: 'tool', title: 'x' }, { kind: 'chart', chart: { titulo: 'G' } }])).toBe('[Gráfica mostrada: G]');
  });
});
