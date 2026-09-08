import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface RotateOdooConfigData {
  apiKey: string;
  uid: number;
  durationDays: number;
}

// Único acceso a datos permitido a la colección odoo_config — el resto
// de la app pasa siempre por OdooConfigService, nunca por Prisma directo.
@Injectable()
export class OdooConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive() {
    return this.prisma.odooConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // Un solo documento "vivo" por ahora (ver TODO en schema.prisma sobre
  // guardar historial más adelante): si ya hay uno activo, se rota
  // (update); si no, se crea. Igual que hace prisma/seed.mjs.
  async rotate(data: RotateOdooConfigData) {
    const expiresAt = new Date(Date.now() + data.durationDays * 24 * 60 * 60 * 1000);
    const existing = await this.findActive();

    if (existing) {
      return this.prisma.odooConfig.update({
        where: { id: existing.id },
        data: {
          apiKey: data.apiKey,
          uid: data.uid,
          durationDays: data.durationDays,
          expiresAt,
          isActive: true,
        },
      });
    }

    return this.prisma.odooConfig.create({
      data: {
        apiKey: data.apiKey,
        uid: data.uid,
        durationDays: data.durationDays,
        expiresAt,
        isActive: true,
      },
    });
  }
}
