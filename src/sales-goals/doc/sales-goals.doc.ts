// Formas de respuesta propias del módulo "Venta Mensual".

export interface StoreSalesGoalDoc {
  id: string;
  posConfigId: number;
  year: number;
  month: number;
  growthPercent: number;
  updatedAt: Date;
}

// Fila de la tabla "Venta Mensual" (meta $ vs. real $), para una tienda y
// un mes dados. Más simple que GoalSummaryItemDoc (src/goals/doc/) — no
// hay proyección de cierre ni "diarias necesarias", el usuario solo pidió
// 4 columnas:
//
// - `actualRevenue` = monto real del mes en curso hasta AYER (el día de
//   hoy todavía no cerró); en un mes ya cerrado, el total real completo.
// - `targetRevenue` = "Meta" = encadenada sobre la meta del mes anterior
//   (mismo mecanismo que GoalsService.resolveTargetOrders, aplicado a
//   totalRevenue en vez de orderCount). `null` si la cadena no tiene un %
//   configurado para este mes.
// - `reachPercent` = "Alcance" = actualRevenue / targetRevenue.
// - `pendingValue` = "Valor Pendiente" = targetRevenue - actualRevenue.
export interface SalesGoalSummaryItemDoc {
  posConfigId: number;
  storeName: string;
  year: number;
  month: number;
  growthPercent: number | null;
  actualRevenue: number;
  targetRevenue: number | null;
  reachPercent: number | null;
  pendingValue: number | null;
  isCurrentMonth: boolean;
}
