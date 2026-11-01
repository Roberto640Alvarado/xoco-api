import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OAuthAuthCode, OAuthClient, OAuthRefreshToken } from '../../generated/prisma/index.js';

// Único acceso a datos de las colecciones OAuth del conector MCP.
@Injectable()
export class OAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  createClient(data: { clientId: string; clientName: string | null; redirectUris: string[] }): Promise<OAuthClient> {
    return this.prisma.oAuthClient.create({ data });
  }

  findClient(clientId: string): Promise<OAuthClient | null> {
    return this.prisma.oAuthClient.findUnique({ where: { clientId } });
  }

  createCode(data: Omit<OAuthAuthCode, 'id' | 'usedAt' | 'createdAt'>): Promise<OAuthAuthCode> {
    return this.prisma.oAuthAuthCode.create({ data });
  }

  findCode(codeHash: string): Promise<OAuthAuthCode | null> {
    return this.prisma.oAuthAuthCode.findUnique({ where: { codeHash } });
  }

  // En MongoDB un campo que nunca se guardó NO coincide con `null`: por eso
  // se busca "null o ausente" (sin esto el código salía siempre como usado).

  /** Marca el código como usado SOLO si nadie lo usó antes (un código sirve una vez). */
  async consumeCode(id: string): Promise<boolean> {
    const result = await this.prisma.oAuthAuthCode.updateMany({ where: { id, OR: [{ usedAt: null }, { usedAt: { isSet: false } }] }, data: { usedAt: new Date() } });
    return result.count === 1;
  }

  createRefreshToken(data: { tokenHash: string; clientId: string; userId: string; expiresAt: Date }): Promise<OAuthRefreshToken> {
    return this.prisma.oAuthRefreshToken.create({ data });
  }

  findRefreshToken(tokenHash: string): Promise<OAuthRefreshToken | null> {
    return this.prisma.oAuthRefreshToken.findUnique({ where: { tokenHash } });
  }

  /** Revoca el refresh token SOLO si seguía vigente (rotación: cada uno sirve una vez). */
  async revokeRefreshToken(id: string): Promise<boolean> {
    const result = await this.prisma.oAuthRefreshToken.updateMany({ where: { id, OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }] }, data: { revokedAt: new Date() } });
    return result.count === 1;
  }
}
