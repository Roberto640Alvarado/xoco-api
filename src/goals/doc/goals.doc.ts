// Formas de respuesta propias de este módulo.

export interface StoreGoalDoc {
  id: string;
  posConfigId: number;
  year: number;
  month: number;
  growthPercent: number;
  updatedAt: Date;
}

// Fila de la tabla "Tráfico de tiendas" (meta vs. real vs. proyección),
// para una tienda y un mes dados. Los nombres de los campos siguen la
// terminología del Excel original que el usuario ya conoce.
//
// Una "visita" es una FACTURA de cliente de esa tienda, no una orden de
// caja — es el conteo que hace el negocio desde el módulo de Contabilidad
// de Odoo (ver StoreInvoiceTotalsService y plan-history
// "visitas-por-vendedor-facturas"). Los campos se siguen llamando
// `...Orders` para no romper el contrato con el frontend.
//
// - `actualOrders` = "Visitas a la fecha": lo real del mes en curso hasta
//   AYER (el día de hoy todavía no cerró); en un mes ya cerrado, el total
//   real del mes completo.
// - `previousMonthActualOrders` = total real de visitas (Odoo) del mes
//   ANTERIOR completo — insumo de la meta, nunca se guarda, se recalcula siempre.
// - `targetOrders` = "Meta del mes" = previousMonthActualOrders * (1 +
//   growthPercent). `null` si la tienda no tiene un % guardado para este
//   mes todavía.
// - `reachPercent` = "Alcance" = actualOrders / targetOrders.
// - `missingOrders` = "Visitas faltantes a la fecha" = targetOrders -
//   actualOrders.
// - `dailyNeededOrders` = "Visitas Diarias Necesarias": el usuario pidió
//   explícitamente que sea el mismo valor que `missingOrders` (así está
//   también en el Excel original), no una división por días restantes.
// - `projectedOrders` = "Proyección cierre de mes" = (actualOrders /
//   daysElapsed) * daysInMonth — ritmo diario real extrapolado a todo el
//   mes; en un mes cerrado da el mismo total real (daysElapsed ===
//   daysInMonth).
// - `projectedReachPercent` = "%" = projectedOrders / targetOrders.
export interface GoalSummaryItemDoc {
  posConfigId: number;
  storeName: string;
  year: number;
  month: number;
  growthPercent: number | null;
  previousMonthActualOrders: number;
  targetOrders: number | null;
  actualOrders: number;
  reachPercent: number | null;
  missingOrders: number | null;
  dailyNeededOrders: number | null;
  isCurrentMonth: boolean;
  daysElapsed: number;
  daysInMonth: number;
  projectedOrders: number;
  projectedReachPercent: number | null;
}
