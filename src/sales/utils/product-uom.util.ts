import { OdooMany2One } from '../../odoo/types/odoo-common.types.js';

// Kilogramos que equivale UNA unidad de cada UoM de peso que puede traer
// Odoo en `product_uom_id`. "Crocks" y otros productos a granel se venden
// por peso: su `qty` en pos.order.line viene en esa unidad (típicamente
// gramos), no en piezas — mezclarlos tal cual en el ranking de "más
// vendidos por unidad" los hace ver como el producto #1 sin serlo (500 g
// de un solo tiquete ya "gana" a 50 piezas de otro producto).
//
// El nombre de la UoM (normalizado a minúsculas/trim) es lo único que da
// pos.order.line sin una llamada extra a Odoo. Esta instancia usa "g"/"kg"
// — se deja una lista más amplia de sinónimos comunes (client-configurable
// en Odoo) por si algún producto queda dado de alta con otro nombre; un
// producto cuya UoM no está en este mapa se sigue tratando como "por
// pieza" (comportamiento actual, sin cambios).
const WEIGHT_UOM_KG_FACTOR: Record<string, number> = {
  g: 0.001,
  gr: 0.001,
  grs: 0.001,
  gramo: 0.001,
  gramos: 0.001,
  gram: 0.001,
  grams: 0.001,
  kg: 1,
  kgs: 1,
  kilo: 1,
  kilos: 1,
  kilogramo: 1,
  kilogramos: 1,
  kilogram: 1,
  kilograms: 1,
  lb: 0.45359237,
  lbs: 0.45359237,
  libra: 0.45359237,
  libras: 0.45359237,
  oz: 0.0283495,
  onza: 0.0283495,
  onzas: 0.0283495,
};

// Factor para convertir `qty` (en la UoM de la línea) a kilogramos, o
// `null` si esa UoM no es de peso (se vende por pieza/unidad — la inmensa
// mayoría del catálogo).
export function weightKgFactor(uom: OdooMany2One): number | null {
  if (!uom || !uom[1]) return null;
  const name = uom[1].trim().toLowerCase();
  return WEIGHT_UOM_KG_FACTOR[name] ?? null;
}

// Azúcar sobre weightKgFactor para los call sites que solo necesitan el
// booleano (ej. filtrar productos a granel fuera del ranking por unidad).
export function isWeightUom(uom: OdooMany2One): boolean {
  return weightKgFactor(uom) !== null;
}
