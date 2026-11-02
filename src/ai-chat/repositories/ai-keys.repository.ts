import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface SaveAiKeyData {
  provider: string;
  encryptedKey: string;
  last4: string;
  status: string;
  statusMessage: string | null;
  updatedByEmail: string;
}

// Único acceso a la colección ai_provider_keys.
@Injectable()
export class AiKeysRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.aiProviderKey.findMany();
  }

  findByProvider(provider: string) {
    return this.prisma.aiProviderKey.findUnique({ where: { provider } });
  }

  upsert(data: SaveAiKeyData) {
    const values = { ...data, checkedAt: new Date() };
    return this.prisma.aiProviderKey.upsert({ where: { provider: data.provider }, create: values, update: values });
  }

  updateStatus(provider: string, status: string, statusMessage: string | null) {
    return this.prisma.aiProviderKey.update({ where: { provider }, data: { status, statusMessage, checkedAt: new Date() } });
  }

  async remove(provider: string) {
    await this.prisma.aiProviderKey.deleteMany({ where: { provider } });
  }
}
