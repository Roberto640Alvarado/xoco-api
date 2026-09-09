// Formas de respuesta propias de este módulo.

export interface StoreGoalDoc {
  id: string;
  posConfigId: number;
  year: number;
  month: number;
  targetOrders: number;
  updatedAt: Date;
}

// Meta vs. real vs. proyección de una tienda, para un mes dado.
//
// - `actualOrders` es lo real "hasta ayer" en el mes en curso (mismo
//   criterio que la "Fecha actualización" del Excel original: TODAY()-1,
//   porque el día de hoy todavía no cerró) — en un mes ya cerrado es
//   simplemente el total real del mes completo.
// - `projectedOrders` en el mes en curso extrapola el ritmo diario real
//   (`actualOrders / daysElapsed`) a los días totales del mes; en un mes
//   cerrado es igual a `actualOrders` (no hay nada que proyectar).
// - `targetOrders`/`reachPercent`/`projectedReachPercent` son `null`
//   cuando la tienda no tiene una meta guardada para ese mes todavía.
export interface GoalSummaryItemDoc {
  posConfigId: number;
  storeName: string;
  year: number;
  month: number;
  targetOrders: number | null;
  actualOrders: number;
  reachPercent: number | null;
  isCurrentMonth: boolean;
  daysElapsed: number;
  daysInMonth: number;
  projectedOrders: number;
  projectedReachPercent: number | null;
}
