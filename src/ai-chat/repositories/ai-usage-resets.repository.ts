import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

// Único acceso a la colección ai_usage_resets (un registro por proveedor).
@Injectable()
export class AiUsageResetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.aiUsageReset.findMany();
  }

  upsert(provider: string, resetByEmail: string) {
    const values = { provider, resetByEmail, resetAt: new Date() };
    return this.prisma.aiUsageReset.upsert({ where: { provider }, create: values, update: values });
  }
}
