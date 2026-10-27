import { OdooMany2One } from '../../odoo/types/odoo-common.types.js';

const UNCATEGORIZED = 'Sin categoría';

// Raíz que Odoo le pone a todo el árbol de categorías ("All" / "Todos"):
// no aporta nada al agrupar, así que se quita del nombre.
const ROOT_SEGMENT = /^(all|todos?|todas?)$/i;

// Nombre corto de la categoría de un producto (product.category de Odoo)
// para agruparlo en pantalla y en el PDF del formato de envío. Odoo manda
// el nombre completo con su ruta ("All / Chocolates / Tabletas"); se
// conserva la ruta sin la raíz ("Chocolates / Tabletas") para que dos
// categorías con el mismo nombre en ramas distintas no se mezclen.
export function productCategoryName(categ: OdooMany2One): string {
  if (!categ) return UNCATEGORIZED;
  const segments = categ[1]
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length > 1 && ROOT_SEGMENT.test(segments[0])) segments.shift();
  return segments.length > 0 ? segments.join(' / ') : UNCATEGORIZED;
}
