// Lo que devuelve GET /inventory/movements/notifications — contadores para
// el aviso del menú (Inventario → Movimientos). Depende del rol de quien
// consulta, ver InventoryMovementsService.findNotifications.
export interface InventoryMovementNotificationsDoc {
  // Suma de los contadores de abajo — lo que muestra el globo del menú.
  total: number;
  // Admin/Finanzas: movimientos de TODAS las tiendas esperando su
  // confirmación o rechazo (PENDIENTE, o RECIBIDO si es una entrada).
  // Siempre 0 para VENDEDOR.
  toResolve: number;
  // Vendedor: entradas (envíos planta→tienda) solicitadas por su tienda
  // que todavía no marcó como recibidas. Siempre 0 para Admin/Finanzas.
  toReceive: number;
  // Vendedor: movimientos que él registró y que Admin/Finanzas ya
  // confirmó o rechazó desde `since`. Siempre 0 para Admin/Finanzas.
  resolvedUnseen: number;
}
