import { Role, StockRequestStatus } from '../../generated/prisma/index.js';
import { StockRequestDispatchKind } from '../doc/stock-request.doc.js';

// Reglas puras del flujo de solicitudes de stock — sin Mongo ni Odoo, para
// poder probarlas sin armar nada y para que servicio y tests usen la misma.

export const OPEN_STATUSES: StockRequestStatus[] = [
  StockRequestStatus.SOLICITADA,
  StockRequestStatus.EN_PREPARACION,
  StockRequestStatus.EN_CAMINO,
];

/** Estados en los que planta todavía puede responder (qué sí, qué no, qué agrega). */
export const PLANT_EDITABLE_STATUSES: StockRequestStatus[] = [
  StockRequestStatus.SOLICITADA,
  StockRequestStatus.EN_PREPARACION,
];

// Quién puede cancelar y en qué estados:
// - La tienda, solo mientras planta no la tomó (SOLICITADA).
// - Planta, mientras la está respondiendo (p. ej. si no tiene nada de lo pedido).
// - Admin/Finanzas, en cualquier momento antes de que la tienda confirme.
const CANCELLABLE: Partial<Record<Role, StockRequestStatus[]>> = {
  [Role.VENDEDOR]: [StockRequestStatus.SOLICITADA],
  [Role.PLANTA]: PLANT_EDITABLE_STATUSES,
  [Role.SUPER_ADMIN]: OPEN_STATUSES,
  [Role.FINANZAS]: OPEN_STATUSES,
};

export function canCancel(role: Role, status: StockRequestStatus): boolean {
  return (CANCELLABLE[role] ?? []).includes(status);
}

interface DispatchLine {
  requestedQuantity: number;
  sentQuantity: number | null;
  addedByPlant: boolean;
}

// Completo = planta envía TODO lo que pidió la tienda (o más). Las líneas
// que agregó planta no cuentan: no se pidieron, así que no pueden faltar.
export function dispatchKind(lines: DispatchLine[]): StockRequestDispatchKind {
  const complete = lines
    .filter((line) => !line.addedByPlant)
    .every((line) => (line.sentQuantity ?? 0) >= line.requestedQuantity);
  return complete ? 'COMPLETO' : 'PARCIAL';
}

export function formatRequestCode(number: number): string {
  return `SOL-${String(number).padStart(4, '0')}`;
}

// 3 decimales alcanzan para kg y evitan colas como 0.30000000000000004.
export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}
