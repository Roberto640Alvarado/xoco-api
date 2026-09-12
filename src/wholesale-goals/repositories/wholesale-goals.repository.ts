import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface UpsertWholesaleGoalData {
  clientKey: string;
  year: number;
  month: number;
  growthPercent: number;
  updatedByEmail: string;
}

// Único acceso a datos permitido a la colección wholesale_client_goals —
// el resto de la app pasa siempre por WholesaleGoalsService, nunca por
// Prisma directo. Mismo patrón que SalesGoalsRepository (src/sales-goals/),
// pero `clientKey` (string fijo, ver WHOLESALE_CLIENTS) en vez de
// `posConfigId`.
@Injectable()
export class WholesaleGoalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyForMonth(year: number, month: number) {
    return this.prisma.wholesaleClientGoal.findMany({ where: { year, month } });
  }

  // Historial completo (todos los años/meses) de los clientes dados — lo
  // necesita WholesaleGoalsService para resolver la cadena "meta del mes
  // N depende de la meta del mes N-1" (ver SalesGoalsRepository.findManyForStores,
  // mismo mecanismo).
  findManyForClients(clientKeys: string[]) {
    return this.prisma.wholesaleClientGoal.findMany({ where: { clientKey: { in: clientKeys } } });
  }

  upsert(data: UpsertWholesaleGoalData) {
    return this.prisma.wholesaleClientGoal.upsert({
      where: {
        clientKey_year_month: {
          clientKey: data.clientKey,
          year: data.year,
          month: data.month,
        },
      },
      update: { growthPercent: data.growthPercent, updatedByEmail: data.updatedByEmail },
      create: data,
    });
  }

  upsertMany(entries: UpsertWholesaleGoalData[]) {
    return Promise.all(entries.map((entry) => this.upsert(entry)));
  }
}
