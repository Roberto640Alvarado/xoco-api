// Formas de respuesta propias del módulo "Ticket Promedio".

export interface StoreTicketGoalDoc {
  id: string;
  posConfigId: number;
  year: number;
  month: number;
  growthPercent: number;
  updatedAt: Date;
  updatedByEmail: string | null;
}

// Fila de la tabla "Ticket Promedio" (ticket real vs. meta), para una
// tienda y un mes dados. Columnas pedidas por el usuario (ver captura del
// Excel original): Tienda / [Mes] / Meta / Diferencia — sin columna de
// Alcance % en la tabla, pero se expone `reachPercent` igual (mismo campo
// que los otros 2 módulos) para la tarjeta "Cumplimiento hasta la fecha".
//
// - `actualAverageTicket` = venta real / cantidad de órdenes reales del
//   mes en curso hasta AYER (o del mes completo si ya cerró). 0 si no
//   hubo órdenes en el rango (evita dividir entre cero).
// - `targetAverageTicket` = "Meta" = encadenada sobre la meta del mes
//   anterior (mismo mecanismo que GoalsService.resolveTargetOrders /
//   SalesGoalsService.resolveTargetRevenue, aplicado al ticket promedio).
//   `null` si la cadena no tiene un % configurado para este mes.
// - `difference` = "Diferencia" = actualAverageTicket - targetAverageTicket
//   (negativo = por debajo de la meta, tal como lo muestra el Excel en
//   rojo con signo "-$").
// - `reachPercent` = actualAverageTicket / targetAverageTicket.
export interface TicketGoalSummaryItemDoc {
  posConfigId: number;
  storeName: string;
  year: number;
  month: number;
  growthPercent: number | null;
  actualAverageTicket: number;
  targetAverageTicket: number | null;
  difference: number | null;
  reachPercent: number | null;
  isCurrentMonth: boolean;
  updatedAt: Date | null;
  updatedByEmail: string | null;
}
