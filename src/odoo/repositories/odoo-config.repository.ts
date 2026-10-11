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

  // Historial completo: la key activa y las reemplazadas, la más nueva primero.
  findAll() {
    return this.prisma.odooConfig.findMany({ orderBy: { createdAt: 'desc' } });
  }

  // Cada rotación crea un documento nuevo y deja el anterior inactivo, así
  // queda registro de las keys pasadas. Se crea primero la nueva y luego se
  // desactivan las demás: nunca hay un instante sin key activa.
  async rotate(data: RotateOdooConfigData, createdByEmail: string | null) {
    const expiresAt = new Date(Date.now() + data.durationDays * 24 * 60 * 60 * 1000);

    const created = await this.prisma.odooConfig.create({
      data: {
        apiKey: data.apiKey,
        uid: data.uid,
        durationDays: data.durationDays,
        expiresAt,
        isActive: true,
        createdByEmail,
      },
    });

    await this.prisma.odooConfig.updateMany({
      where: { isActive: true, id: { not: created.id } },
      data: { isActive: false },
    });

    return created;
  }
}
