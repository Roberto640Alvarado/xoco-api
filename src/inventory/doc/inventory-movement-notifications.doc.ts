// Lo que devuelve GET /inventory/movements/notifications — el contador del
// aviso de Inventario → Movimientos (merma, regalía, degustación). El aviso
// de Solicitudes es otro endpoint (GET /inventory/requests/notifications).
// Depende del rol de quien consulta, ver
// InventoryMovementsService.findNotifications.
export interface InventoryMovementNotificationsDoc {
  // Lo mismo que `movements`: lo que suma el globo del submenú Inventario.
  total: number;
  // Admin/Finanzas: merma/regalía/degustación PENDIENTES de todas las
  // tiendas. Vendedor: las suyas que Admin/Finanzas resolvió desde
  // `sinceMovements`.
  movements: number;
}
