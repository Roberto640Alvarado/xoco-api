import { InventoryMovementStatus, InventoryMovementType, Role } from '../../generated/prisma/index.js';

// Lo que devuelven POST/GET .../movements — se agrega productName acá
// mismo (no viaja con el modelo de Mongo) porque el frontend necesita
// mostrar el nombre del producto sin tener que volver a pedir el
// catálogo completo de Odoo.
export interface InventoryMovementDoc {
  id: string;
  posConfigId: number;
  productId: number;
  productName: string;
  type: InventoryMovementType;
  quantity: number;
  // Solo ENTRADA la llena: lo que de verdad llegó de una solicitud — null
  // en los demás tipos.
  receivedQuantity: number | null;
  note: string | null;
  occurredAt: Date;
  status: InventoryMovementStatus;
  registeredByEmail: string;
  registeredByRole: Role;
  resolvedByEmail: string | null;
  resolvedAt: Date | null;
  // Motivo con el que Admin/Finanzas rechazó — null si no está rechazado.
  rejectionReason: string | null;
}
