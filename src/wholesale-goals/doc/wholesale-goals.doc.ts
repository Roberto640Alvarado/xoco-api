// Formas de respuesta propias del módulo "Ventas Mayoreo".

export interface WholesaleClientGoalDoc {
  id: string;
  clientKey: string;
  year: number;
  month: number;
  growthPercent: number;
  updatedAt: Date;
  updatedByEmail: string | null;
}

// Fila de la tabla de "Ventas Mayoreo" (meta $ vs. real $), para un
// cliente de mayoreo y un mes dados — mismo shape que
// SalesGoalSummaryItemDoc (src/sales-goals/), pero por cliente de mayoreo
// en vez de por tienda.
//
// - `actualRevenue` = monto real del mes en curso hasta AYER (el día de
//   hoy todavía no cerró); en un mes ya cerrado, el total real completo.
// - `targetRevenue` = "Meta" = encadenada sobre la meta del mes anterior
//   (mismo mecanismo que SalesGoalsService.resolveTargetRevenue). `null`
//   si la cadena no tiene un % configurado para este mes.
// - `reachPercent` = "Alcance" = actualRevenue / targetRevenue.
// - `pendingValue` = "Valor Pendiente" = targetRevenue - actualRevenue.
export interface WholesaleGoalSummaryItemDoc {
  clientKey: string;
  clientLabel: string;
  year: number;
  month: number;
  growthPercent: number | null;
  actualRevenue: number;
  targetRevenue: number | null;
  reachPercent: number | null;
  pendingValue: number | null;
  isCurrentMonth: boolean;
  updatedAt: Date | null;
  updatedByEmail: string | null;
}
