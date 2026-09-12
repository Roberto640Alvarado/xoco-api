// Clientes de mayoreo que el negocio pidió trackear aparte (facturan sin
// pasar por caja — ver StoreInvoiceTotalsService, "Mayoreo NO entra en
// los totales de tienda"). Es una lista FIJA y curada (no "todos los
// partners de Odoo"): el negocio nombró estos dos, y se agregan más acá
// si algún día piden trackear otro.
//
// `commercialPartnerId` es el id de `res.partner` (campo
// `commercial_partner_id` de account.move) que agrupa TODAS las facturas
// de ese cliente — resuelto por inspección directa de Odoo, no
// adivinado:
//
// - Selectos: la cadena de supermercados "Súper Selectos" factura bajo
//   la razón social "Calleja S.A. de C.V." (id 2306 en este Odoo). Sus
//   facturas van a distintos `partner_id` HIJOS de esa razón social — una
//   por cada sucursal/comprador (ej. "Calleja S.A. de C.V., Super
//   Selectos Valle Dulce El Encuentro - 251") — de ahí que el desglose
//   por comprador (ver WholesaleClientTotalsService) tenga sentido para
//   este cliente.
// - Operadora del Sur: factura directo a su propia razón social (id 2366
//   en este Odoo), sin sub-contactos — el desglose por comprador le
//   devuelve un solo renglón igual al total.
//
// Si en Odoo se re-crea o cambia el id de alguno de estos partners, hay
// que actualizar el valor acá — no hay forma de resolverlo dinámicamente
// sin arriesgar falsos positivos (buscar por nombre no sirve: la razón
// social de Selectos no contiene la palabra "Selectos").
export interface WholesaleClientConfig {
  key: string;
  label: string;
  commercialPartnerId: number;
}

export const WHOLESALE_CLIENTS: WholesaleClientConfig[] = [
  { key: 'selectos', label: 'Selectos', commercialPartnerId: 2306 },
  { key: 'operadora_del_sur', label: 'Operadora del Sur', commercialPartnerId: 2366 },
];
