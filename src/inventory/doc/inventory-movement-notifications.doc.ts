// Lo que devuelve GET /inventory/movements/notifications — contadores para
// los avisos del menú: uno para Inventario → Movimientos (merma, regalía,
// degustación) y otro para Inventario → Solicitudes (entradas de stock).
// Depende del rol de quien consulta, ver
// InventoryMovementsService.findNotifications.
export interface InventoryMovementNotificationsDoc {
  // movements + requests — lo que suma el globo del submenú Inventario.
  total: number;
  // Admin/Finanzas: merma/regalía/degustación PENDIENTES de todas las
  // tiendas. Vendedor: las suyas que Admin/Finanzas resolvió desde
  // `sinceMovements`.
  movements: number;
  // Admin/Finanzas: solicitudes de stock por atender (PENDIENTE: aceptar o
  // rechazar; RECIBIDO: confirmar). Vendedor: envíos EN_CAMINO por marcar
  // como recibidos, más solicitudes suyas resueltas desde `sinceRequests`.
  requests: number;
}
