import { Logger } from '@nestjs/common';
import { OdooSearchReadOptions } from '../../odoo/types/odoo-common.types.js';

// Tamaño de página para las consultas internas que necesitan "todo lo que
// matchea" (no son una lista paginada que ve el frontend, sino datos
// intermedios para agregar: órdenes del rango, líneas de esas órdenes,
// facturas del rango). fetchAllOdooPages() pagina de verdad con offset
// hasta traer todo, así que esto es solo el tamaño de cada viaje a Odoo,
// no un tope de resultados.
export const INTERNAL_PAGE_SIZE = 1000;

// Tope de seguridad para que un bug de paginación (o un volumen de datos
// absurdo) no deje el loop trayendo millones de registros a memoria. Muy
// por encima de cualquier volumen real esperado (4 tiendas) — si algún
// día se topa, hay que revisar por qué hay tantos registros, no solo
// subir el número.
export const INTERNAL_FETCH_HARD_CAP = 50_000;

// Trae TODO lo que matchea un domain, paginando de verdad con offset en
// vez de un solo fetch con límite alto — un solo fetch con límite trunca
// silenciosamente en cuanto el rango de fechas junta más registros que el
// límite (ver bug de "Visitas solo muestra los últimos ~24 días de un
// rango de 90": con 4 tiendas, 90 días ya pasan de miles de órdenes, y
// sin `order` explícito Odoo devuelve más reciente primero, así que el
// corte se comía justo los días viejos del rango).
export async function fetchAllOdooPages<T>(
  fetchPage: (options: OdooSearchReadOptions) => Promise<T[]>,
  domain: unknown[],
  contextLabel: string,
  logger?: Logger,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const page = await fetchPage({ domain, limit: INTERNAL_PAGE_SIZE, offset });
    all.push(...page);
    if (page.length < INTERNAL_PAGE_SIZE) break;
    offset += INTERNAL_PAGE_SIZE;
    if (all.length >= INTERNAL_FETCH_HARD_CAP) {
      logger?.warn(
        `${contextLabel} tocó el tope de seguridad de ${INTERNAL_FETCH_HARD_CAP} registros — revisar si hace falta subirlo.`,
      );
      break;
    }
  }
  return all;
}
