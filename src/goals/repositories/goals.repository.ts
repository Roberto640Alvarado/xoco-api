import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface UpsertGoalData {
  posConfigId: number;
  year: number;
  month: number;
  growthPercent: number;
}

// Único acceso a datos permitido a la colección store_goals — el resto de
// la app pasa siempre por GoalsService, nunca por Prisma directo.
@Injectable()
export class GoalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyForMonth(year: number, month: number) {
    return this.prisma.storeGoal.findMany({ where: { year, month } });
  }

  // Un doc por tienda+año+mes (índice único en el schema) — si ya existe
  // el % de ese mes para esa tienda, se sobreescribe.
  upsert(data: UpsertGoalData) {
    return this.prisma.storeGoal.upsert({
      where: {
        posConfigId_year_month: {
          posConfigId: data.posConfigId,
          year: data.year,
          month: data.month,
        },
      },
      update: { growthPercent: data.growthPercent },
      create: data,
    });
  }

  // El modal del frontend siempre manda un lote (aunque sea de una sola
  // tienda) — mismo % para todas o uno distinto por tienda, ver
  // GoalsService.upsertBulk.
  upsertMany(entries: UpsertGoalData[]) {
    return Promise.all(entries.map((entry) => this.upsert(entry)));
  }
}
