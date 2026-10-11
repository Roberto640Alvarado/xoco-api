// Lo que devuelve GET /inventory/access: las tiendas con el módulo de
// Inventario habilitado para sus Vendedores. El frontend decide con esto si
// muestra la sección al Vendedor (¿incluye su posConfigId?) y el estado de
// cada tienda en Administración → Inventario.
export interface InventoryAccessDoc {
  enabledPosConfigIds: number[];
}
