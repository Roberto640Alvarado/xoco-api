import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '../../generated/prisma/index.js';
import { AiChatMessage, AiProviderKey } from '../providers/provider.types.js';
import { AiConversationsRepository } from '../repositories/ai-conversations.repository.js';
import { AiChatEvent, AiChatService } from './ai-chat.service.js';

/** Pedazo de una respuesta guardada (mismo formato que dibuja el panel). */
export type StoredBlock =
  | { kind: 'tool'; title: string }
  | { kind: 'text'; text: string }
  | { kind: 'chart'; chart: unknown }
  | { kind: 'table'; table: unknown }
  | { kind: 'error'; message: string };

const MAX_HISTORY = 30;
const TITLE_LENGTH = 60;

export function titleFrom(question: string): string {
  const clean = question.replace(/\s+/g, ' ').trim();
  return clean.length > TITLE_LENGTH ? `${clean.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : clean || 'Nuevo chat';
}

/** Texto de una respuesta para el historial y la búsqueda (gráficas y tablas por su título). */
export function blocksText(blocks: StoredBlock[]): string {
  return blocks
    .map((block) => {
      if (block.kind === 'text') return block.text;
      if (block.kind === 'chart') return `[Gráfica mostrada: ${(block.chart as { titulo?: string }).titulo ?? ''}]`;
      if (block.kind === 'table') return `[Tabla mostrada: ${(block.table as { titulo?: string }).titulo ?? ''}]`;
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function toBlock(event: AiChatEvent): StoredBlock | null {
  if (event.type === 'tool') return { kind: 'tool', title: event.title };
  if (event.type === 'text') return { kind: 'text', text: event.text };
  if (event.type === 'chart') return { kind: 'chart', chart: event.chart };
  if (event.type === 'table') return { kind: 'table', table: event.table };
  if (event.type === 'error') return { kind: 'error', message: event.message };
  return null;
}

interface AskInput {
  user: User;
  provider: AiProviderKey;
  conversationId?: string;
  message: string;
  signal?: AbortSignal;
  emit: (event: AiChatEvent | { type: 'conversation'; id: string; title: string } | { type: 'title'; id: string; title: string }) => void;
}

const TITLE_PROMPT = `Escribe un título corto (de 2 a 6 palabras) en español para un chat que empieza con esta pregunta y respuesta.
Debe decir de qué trata, como "Ventas de Centrika por mes" o "Top productos de San Benito".
Responde solo con el título: sin comillas, sin punto final y sin emojis.`;

/** Limpia lo que devuelve la IA como título (comillas, "Título:", punto final). */
export function cleanTitle(raw: string): string | null {
  const line = raw.split('\n').map((part) => part.trim()).find(Boolean) ?? '';
  const strip = (value: string) => value.replace(/^["'«“*#\s]+|["'»”*\s]+$/g, '');
  const clean = strip(strip(line.replace(/^(t[ií]tulo)\s*:\s*/i, '')).replace(/[.。]+$/, '')).trim();
  if (!clean || clean.length < 3) return null;
  return titleFrom(clean);
}

// Historial de Xoco IA: cada usuario guarda sus conversaciones (como en
// ChatGPT), las busca, las renombra y las borra. El historial que se le
// manda a la IA sale de lo guardado, no de lo que mande el navegador.
@Injectable()
export class AiConversationsService {
  private readonly logger = new Logger(AiConversationsService.name);

  constructor(
    private readonly repository: AiConversationsRepository,
    private readonly chatService: AiChatService,
  ) {}

  async list(userId: string, search?: string) {
    const term = search?.trim();
    const items = await this.repository.list(userId, term ? term.slice(0, 100) : undefined, 200);
    return items.map((item) => ({ id: item.id, title: item.title, provider: item.provider, createdAt: item.createdAt, updatedAt: item.updatedAt }));
  }

  private async owned(id: string, userId: string) {
    const conversation = /^[a-f0-9]{24}$/i.test(id) ? await this.repository.findOwned(id, userId) : null;
    if (!conversation) throw new NotFoundException('Ese chat no existe o no es tuyo.');
    return conversation;
  }

  async get(id: string, userId: string) {
    const conversation = await this.owned(id, userId);
    const messages = await this.repository.messages(id, userId);
    return {
      id: conversation.id,
      title: conversation.title,
      provider: conversation.provider,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        blocks: (message.blocks as StoredBlock[] | null) ?? null,
        provider: message.provider,
        model: message.model,
        status: message.status,
        createdAt: message.createdAt,
      })),
    };
  }

  async rename(id: string, userId: string, title: string) {
    await this.owned(id, userId);
    const updated = await this.repository.update(id, { title: titleFrom(title) });
    return { id: updated.id, title: updated.title, provider: updated.provider, createdAt: updated.createdAt, updatedAt: updated.updatedAt };
  }

  async remove(id: string, userId: string) {
    await this.owned(id, userId);
    await this.repository.remove(id, userId);
  }

  /** Pregunta dentro de un chat (o crea uno nuevo) y guarda pregunta y respuesta. */
  async ask({ user, provider, conversationId, message, signal, emit }: AskInput): Promise<void> {
    const question = message.trim();
    // Valida el proveedor antes de crear nada.
    const { model } = await this.chatService.resolve(provider);

    const conversation = conversationId
      ? await this.owned(conversationId, user.id)
      : await this.repository.create({ userId: user.id, title: titleFrom(question), provider });
    emit({ type: 'conversation', id: conversation.id, title: conversation.title });

    const previous = await this.repository.messages(conversation.id, user.id);
    const history: AiChatMessage[] = previous
      .filter((item) => item.role === 'user' || item.status !== 'error')
      .map((item) => ({ role: item.role as 'user' | 'assistant', content: item.text }))
      .filter((item) => item.content.trim().length > 0)
      .slice(-MAX_HISTORY);
    history.push({ role: 'user', content: question });

    await this.repository.addMessage({ conversationId: conversation.id, userId: user.id, role: 'user', text: question });

    const blocks: StoredBlock[] = [];
    let status = 'stopped' as 'done' | 'error' | 'stopped';
    let usedModel = model;
    await this.chatService.run({
      user,
      provider,
      messages: history,
      signal,
      emit: (event) => {
        const block = toBlock(event);
        if (block) blocks.push(block);
        if (event.type === 'start') usedModel = event.model;
        if (event.type === 'done') status = 'done';
        if (event.type === 'error') status = 'error';
        emit(event);
      },
    });

    try {
      await this.repository.addMessage({
        conversationId: conversation.id,
        userId: user.id,
        role: 'assistant',
        text: blocksText(blocks),
        blocks: blocks as unknown as Prisma.InputJsonValue,
        provider,
        model: usedModel,
        status,
      });
      await this.repository.update(conversation.id, { provider });
    } catch (error) {
      this.logger.error('No se pudo guardar la respuesta de Xoco IA', error instanceof Error ? error.stack : String(error));
    }

    // Como ChatGPT: al terminar la primera respuesta de un chat nuevo, la IA
    // le pone un título corto. Si falla, se queda el inicio de la pregunta.
    if (!conversationId && status === 'done' && !signal?.aborted) {
      const title = await this.generateTitle(provider, question, blocksText(blocks), signal);
      if (title) {
        await this.repository.update(conversation.id, { title }).catch(() => undefined);
        emit({ type: 'title', id: conversation.id, title });
      }
    }
  }

  private async generateTitle(provider: AiProviderKey, question: string, answer: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const resolved = await this.chatService.resolve(provider);
      const session = resolved.provider.startSession({
        apiKey: resolved.apiKey,
        model: resolved.model,
        system: TITLE_PROMPT,
        tools: [],
        maxTokens: provider === 'openai' ? 256 : 30,
        messages: [{ role: 'user', content: `Pregunta: ${question.slice(0, 500)}\n\nRespuesta: ${answer.slice(0, 800)}` }],
      });
      const step = await session.step(signal);
      return cleanTitle(step.text);
    } catch (error) {
      this.logger.warn(`No se pudo generar el título del chat: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
