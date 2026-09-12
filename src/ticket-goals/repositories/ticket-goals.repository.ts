import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface UpsertTicketGoalData {
  posConfigId: number;
  year: number;
  month: number;
  growthPercent: number;
  updatedByEmail: string;
}

// Único acceso a datos permitido a la colección store_ticket_goals — el
// resto de la app pasa siempre por TicketGoalsService, nunca por Prisma
// directo. Mismo patrón que GoalsRepository/SalesGoalsRepository, pero
// para el % de crecimiento del TICKET PROMEDIO, independiente de los
// otros dos.
@Injectable()
export class TicketGoalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyForMonth(year: number, month: number) {
    return this.prisma.storeTicketGoal.findMany({ where: { year, month } });
  }

  // Historial completo de las tiendas dadas — lo necesita
  // TicketGoalsService para resolver la cadena "meta del mes N depende de
  // la meta del mes N-1" (ver GoalsRepository.findManyForStores, mismo
  // mecanismo).
  findManyForStores(posConfigIds: number[]) {
    return this.prisma.storeTicketGoal.findMany({ where: { posConfigId: { in: posConfigIds } } });
  }

  upsert(data: UpsertTicketGoalData) {
    return this.prisma.storeTicketGoal.upsert({
      where: {
        posConfigId_year_month: {
          posConfigId: data.posConfigId,
          year: data.year,
          month: data.month,
        },
      },
      update: { growthPercent: data.growthPercent, updatedByEmail: data.updatedByEmail },
      create: data,
    });
  }

  upsertMany(entries: UpsertTicketGoalData[]) {
    return Promise.all(entries.map((entry) => this.upsert(entry)));
  }
}
