import { describe, expect, it, vi } from 'vitest';
import { Role, User } from '../../generated/prisma/index.js';
import { AiConversationsService, blocksText, cleanTitle, titleFrom } from '../services/ai-conversations.service.js';
import type { AiConversationsRepository } from '../repositories/ai-conversations.repository.js';
import type { AiChatEvent, AiChatService } from '../services/ai-chat.service.js';

const USER = { id: 'a'.repeat(24), email: 'admin@xoco.com', role: Role.SUPER_ADMIN } as User;
const CONV = { id: 'c'.repeat(24), userId: USER.id, title: 'Ventas', provider: 'claude', createdAt: new Date(), updatedAt: new Date() };

function setup(previous: Array<{ role: string; text: string; status?: string | null }> = []) {
  const repository = {
    list: vi.fn(async () => [CONV]),
    findOwned: vi.fn(async (id: string, userId: string) => (id === CONV.id && userId === USER.id ? CONV : null)),
    create: vi.fn(async () => CONV),
    update: vi.fn(async () => CONV),
    messages: vi.fn(async () => previous),
    addMessage: vi.fn(async () => undefined),
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
