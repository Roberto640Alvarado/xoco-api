// La propina entra a la orden de caja como una línea de producto más (el
// "producto de propina" del POS). En pantalla se muestra tal cual, pero
// hay reportes (ej. el Excel de Órdenes) que no deben contarla como venta.
//
// pos.order.line no trae una marca de "es propina", así que se reconoce
// por el nombre del producto: "Propina"/"Propinas" o el "Tips" que crea
// Odoo por defecto. Se comparan palabras completas, sin acentos ni
// mayúsculas, para no confundirla con productos como "Tipo ...".
const TIP_PRODUCT_PATTERN = /\b(propinas?|tips?)\b/;

function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function isTipProductName(name: string | null | undefined): boolean {
  return Boolean(name) && TIP_PRODUCT_PATTERN.test(normalize(name as string));
}
