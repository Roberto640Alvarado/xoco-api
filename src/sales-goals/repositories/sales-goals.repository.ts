import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface UpsertSalesGoalData {
  posConfigId: number;
  year: number;
  month: number;
  growthPercent: number;
}

// Único acceso a datos permitido a la colección store_sales_goals — el
// resto de la app pasa siempre por SalesGoalsService, nunca por Prisma
// directo. Mismo patrón que GoalsRepository (src/goals/), pero para el %
// de crecimiento de VENTA ($), independiente del de visitas/órdenes.
@Injectable()
export class SalesGoalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyForMonth(year: number, month: number) {
    return this.prisma.storeSalesGoal.findMany({ where: { year, month } });
  }

  // Historial completo (todos los años/meses) de las tiendas dadas — lo
  // necesita SalesGoalsService para resolver la cadena "meta del mes N
  // depende de la meta del mes N-1" (ver GoalsRepository.findManyForStores,
  // mismo mecanismo).
  findManyForStores(posConfigIds: number[]) {
    return this.prisma.storeSalesGoal.findMany({ where: { posConfigId: { in: posConfigIds } } });
  }

  upsert(data: UpsertSalesGoalData) {
    return this.prisma.storeSalesGoal.upsert({
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

  upsertMany(entries: UpsertSalesGoalData[]) {
    return Promise.all(entries.map((entry) => this.upsert(entry)));
  }
}
