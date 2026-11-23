import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';

// Único acceso a ai_conversations, ai_conversation_messages y
// ai_conversation_attachments. Todas las
// consultas llevan el userId del dueño: nunca se lee la conversación de otro.
@Injectable()
export class AiConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, search: string | undefined, take: number) {
    let where: Prisma.AiConversationWhereInput = { userId };
    if (search) {
      const matching = await this.prisma.aiConversationMessage.findMany({
        where: { userId, text: { contains: search, mode: 'insensitive' } },
        select: { conversationId: true },
        take: 500,
      });
      const ids = [...new Set(matching.map((message) => message.conversationId))];
      where = { userId, OR: [{ title: { contains: search, mode: 'insensitive' } }, { id: { in: ids } }] };
    }
    return this.prisma.aiConversation.findMany({ where, orderBy: { updatedAt: 'desc' }, take });
  }

  findOwned(id: string, userId: string) {
    return this.prisma.aiConversation.findFirst({ where: { id, userId } });
  }

  create(data: { userId: string; title: string; provider: string }) {
    return this.prisma.aiConversation.create({ data });
  }

  update(id: string, data: { title?: string; provider?: string }) {
    return this.prisma.aiConversation.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
  }

  messages(conversationId: string, userId: string) {
    return this.prisma.aiConversationMessage.findMany({ where: { conversationId, userId }, orderBy: { createdAt: 'asc' } });
  }

  addMessage(data: Prisma.AiConversationMessageUncheckedCreateInput) {
    return this.prisma.aiConversationMessage.create({ data });
  }

  updateMessageAttachments(id: string, attachments: Prisma.InputJsonValue) {
    return this.prisma.aiConversationMessage.update({ where: { id }, data: { attachments } });
  }

  addAttachment(data: Prisma.AiConversationAttachmentUncheckedCreateInput) {
    return this.prisma.aiConversationAttachment.create({ data, select: { id: true } });
  }

  /** Adjuntos (con contenido) de varios mensajes de un chat propio. */
  attachmentsOf(conversationId: string, userId: string, messageIds: string[]) {
    return this.prisma.aiConversationAttachment.findMany({
      where: { conversationId, userId, messageId: { in: messageIds } },
      orderBy: { createdAt: 'asc' },
    });
  }

  findAttachment(id: string, conversationId: string, userId: string) {
    return this.prisma.aiConversationAttachment.findFirst({ where: { id, conversationId, userId } });
  }

  async remove(id: string, userId: string) {
    await this.prisma.aiConversationAttachment.deleteMany({ where: { conversationId: id, userId } });
    await this.prisma.aiConversationMessage.deleteMany({ where: { conversationId: id, userId } });
    await this.prisma.aiConversation.deleteMany({ where: { id, userId } });
  }
}
