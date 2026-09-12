// Conversión entre el "día de negocio" de la tienda y los datetimes que
// devuelve Odoo.
//
// Odoo SIEMPRE guarda y devuelve datetimes en UTC (naive, sin sufijo:
// "2026-09-08 01:04:31"), y los convierte a la zona del usuario solo al
// presentarlos. Sus propios reportes (ej. el PDF "Detalles de ventas")
// van en hora local, así que si aquí se corta el string UTC tal cual, todo
// lo vendido entre las 18:00 y la medianoche local se contabiliza al día
// siguiente y los números no cuadran contra Odoo.
//
// El Salvador usa UTC-6 todo el año: no aplica horario de verano desde
// 1983, así que un offset fijo es correcto y evita depender de la tabla de
// zonas del runtime. Si algún día la operación se extiende a un país con
// DST, esto tiene que pasar a una conversión por zona IANA de verdad
// (Intl con timeZone), no a otro offset fijo.
const STORE_UTC_OFFSET_HOURS = -6;

const MS_PER_HOUR = 60 * 60 * 1000;

// "2026-09-08 01:04:31" (UTC) -> "2026-09-07" (día local de la tienda).
export function toStoreDate(odooDateTime: string): string {
  const utcMs = Date.parse(`${odooDateTime.replace(' ', 'T')}Z`);
  return new Date(utcMs + STORE_UTC_OFFSET_HOURS * MS_PER_HOUR)
    .toISOString()
    .slice(0, 10);
}

// Rango de días locales -> la ventana UTC que hay que pedirle a Odoo para
// cubrirlos completos. Con UTC-6, el 2026-09-07 local va de
// "2026-09-07 06:00:00" a "2026-09-08 05:59:59" en UTC.
//
// `to` es INCLUSIVO (el día completo), por eso el límite superior se
// calcula sobre el día siguiente. Se devuelve un `<=` en vez de un `<` del
// día siguiente para que el domain de Odoo quede simétrico y legible; el
// segundo perdido (05:59:59.xxx) no existe en la práctica porque Odoo
// guarda los datetimes truncados al segundo.
export function storeDayRangeToUtc(
  dateFrom: string,
  dateTo: string,
): { utcFrom: string; utcTo: string } {
  return {
    utcFrom: toOdooDateTime(storeDayStartUtcMs(dateFrom)),
    utcTo: toOdooDateTime(storeDayStartUtcMs(shiftDate(dateTo, 1)) - 1000),
  };
}

function storeDayStartUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) - STORE_UTC_OFFSET_HOURS * MS_PER_HOUR;
}

// Date -> el formato naive que espera Odoo en un domain ("YYYY-MM-DD HH:mm:ss").
function toOdooDateTime(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 19).replace('T', ' ');
}

// Suma (o resta, con `days` negativo) días a una fecha YYYY-MM-DD.
export function shiftDate(date: string, days: number): string {
  const cursor = new Date(`${date}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

// Todos los días del rango, inclusivo en ambos extremos.
export function enumerateDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// "Hoy" en el día local de la tienda — mismo offset fijo que el resto de
// este archivo (ver STORE_UTC_OFFSET_HOURS). Lo usan los reportes que
// necesitan saber en qué mes/día local estamos parados ahora mismo (ej.
// la comparación "mes en curso vs. mes anterior" de /sales/product-monthly-comparison).
export function todayStoreDate(): string {
  return new Date(Date.now() + STORE_UTC_OFFSET_HOURS * MS_PER_HOUR)
    .toISOString()
    .slice(0, 10);
}

// "2026-09-07" -> "2026-09-01".
export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

// Cualquier día de septiembre 2026 -> "2026-09-30" (respeta meses de 28-31
// días y años bisiestos).
export function endOfMonth(date: string): string {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
}

// Mueve una fecha `months` meses (negativo = hacia atrás), fijando el
// resultado al día 1 de ese mes. Pensado para usarse junto con
// `startOfMonth` (ej. `shiftMonthStart(startOfMonth(today), -1)` para el
// día 1 del mes anterior) — no preserva el día del mes original.
export function shiftMonthStart(date: string, months: number): string {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

