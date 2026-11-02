import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';

// Único acceso a la colección ai_usage_logs.
@Injectable()
export class AiUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.AiUsageLogCreateInput) {
    return this.prisma.aiUsageLog.create({ data });
  }

  /** Todas las filas del rango (para los totales); solo los campos que suman. */
  findForSummary(where: Prisma.AiUsageLogWhereInput) {
    return this.prisma.aiUsageLog.findMany({
      where,
      select: { provider: true, model: true, userId: true, userEmail: true, userName: true, costUsd: true, inputTokens: true, outputTokens: true, status: true, createdAt: true },
    });
  }

  findPage(where: Prisma.AiUsageLogWhereInput, skip: number, take: number) {
    return this.prisma.aiUsageLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take });
  }

  count(where: Prisma.AiUsageLogWhereInput) {
    return this.prisma.aiUsageLog.count({ where });
  }
}
