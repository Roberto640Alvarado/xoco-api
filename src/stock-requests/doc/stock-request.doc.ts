import { Role, StockRequestStatus } from '../../generated/prisma/index.js';

// Respuestas de Inventario → Solicitudes (StockRequestsService). Nunca la
// forma cruda de Mongo: con el nombre de la tienda ya resuelto, el código
// legible de la solicitud y lo que se puede derivar (diferencias, tipo de
// despacho) calculado una sola vez aquí.

export type StockRequestDispatchKind = 'COMPLETO' | 'PARCIAL';

export interface StockRequestLineDoc {
  productId: number;
  productName: string;
  categoryName: string;
  unit: 'unidad' | 'kg';
  /** Lo que pidió la tienda. 0 en las líneas que agregó planta. */
  requestedQuantity: number;
  /** Lo que planta envía. null = planta todavía no responde esta línea; 0 = no hay. */
  sentQuantity: number | null;
  /** Lo que la tienda confirmó que llegó. null hasta confirmar la recepción. */
  receivedQuantity: number | null;
  /** Recibido menos enviado (la columna DIF del formato). null si falta alguno. */
  difference: number | null;
  addedByPlant: boolean;
  plantNote: string | null;
  storeNote: string | null;
}

export interface StockRequestEventDoc {
  status: StockRequestStatus;
  at: Date;
  byEmail: string;
  byRole: Role;
  note: string | null;
}

export interface StockRequestDoc {
  id: string;
  number: number;
  /** "SOL-0012": el Número de Requisición del formato. */
  code: string;
  posConfigId: number;
  storeName: string;
  status: StockRequestStatus;
  /** Nota general de la tienda al pedir. */
  note: string | null;
  createdByEmail: string;
  createdAt: Date;
  updatedAt: Date;
  dispatchedAt: Date | null;
  receivedAt: Date | null;
  /** Completo si planta envía todo lo pedido; parcial si algo falta. null mientras no despacha. */
  dispatch: StockRequestDispatchKind | null;
  /** Motivo de la cancelación; null si no está cancelada. */
  cancelReason: string | null;
  lines: StockRequestLineDoc[];
  /** Seguimiento: cada cambio de estado, del más antiguo al más reciente. */
  events: StockRequestEventDoc[];
}

/** Producto del catálogo que se puede pedir (GET /inventory/requests/catalog). */
export interface StockRequestCatalogItemDoc {
  productId: number;
  productName: string;
  categoryName: string;
  unit: 'unidad' | 'kg';
}

/** GET /inventory/requests/notifications — el globo del menú. */
export interface StockRequestNotificationsDoc {
  /**
   * Planta: solicitudes por responder o despachar. Tienda: envíos en camino
   * por confirmar. Admin/Finanzas: 0 (solo ven el seguimiento).
   */
  pending: number;
}
