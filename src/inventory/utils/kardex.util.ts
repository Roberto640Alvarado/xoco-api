import { InventoryLedgerEntryType } from '../doc/inventory-ledger.doc.js';
import { InventoryKardexRowDoc } from '../doc/inventory-kardex.doc.js';

// Cálculo puro del Kardex de UN producto (sin Mongo ni Odoo, para poder
// probarlo): recorre sus eventos en orden y lleva el saldo.
//   - COUNT (conteo físico) fija el saldo; dentro del período deja una
//     línea de ajuste (contado − saldo que había).
//   - IN suma, OUT resta. Sin un conteo previo el saldo es desconocido
//     (null) hasta el primer conteo.
// Las ventas seguidas del mismo día se juntan en una sola línea para que el
// reporte se lea (un día normal tiene decenas de tickets).

export interface KardexEvent {
  direction: 'IN' | 'OUT' | 'COUNT';
  type: InventoryLedgerEntryType;
  at: Date;
  quantity: number;
  reference: string | null;
  registeredBy: string | null;
}

export interface ProductKardex {
  openingBalance: number | null;
  closingBalance: number | null;
  totalIn: number;
  totalOut: number;
  totalAdjustment: number;
  rows: InventoryKardexRowDoc[];
}

export const KARDEX_CONCEPT: Record<InventoryLedgerEntryType, string> = {
  [InventoryLedgerEntryType.VENTA]: 'Venta',
  [InventoryLedgerEntryType.MERMA]: 'Merma',
  [InventoryLedgerEntryType.REGALIA]: 'Regalía',
  [InventoryLedgerEntryType.DEGUSTACION]: 'Degustación',
  [InventoryLedgerEntryType.ENTRADA]: 'Entrada',
  [InventoryLedgerEntryType.CONTEO]: 'Conteo físico',
};

// 3 decimales alcanzan para kg y evitan colas como 0.30000000000000004.
export function roundKardex(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// Orden estable: por hora y, a la misma hora, el conteo al final (se cuenta
// después de lo que pasó en ese instante).
function compareEvents(a: KardexEvent, b: KardexEvent): number {
  const diff = a.at.getTime() - b.at.getTime();
  if (diff !== 0) return diff;
  return Number(a.direction === 'COUNT') - Number(b.direction === 'COUNT');
}

export function buildProductKardex(
  events: KardexEvent[],
  from: Date,
  to: Date,
  storeDate: (at: Date) => string,
): ProductKardex {
  const sorted = [...events].filter((event) => event.at.getTime() <= to.getTime()).sort(compareEvents);

  let balance: number | null = null;
  const apply = (event: KardexEvent) => {
    if (event.direction === 'COUNT') balance = event.quantity;
    else if (balance !== null) balance = roundKardex(balance + (event.direction === 'IN' ? event.quantity : -event.quantity));
  };

  let index = 0;
  for (; index < sorted.length && sorted[index].at.getTime() < from.getTime(); index++) apply(sorted[index]);
  const openingBalance: number | null = balance;

  const rows: InventoryKardexRowDoc[] = [];
  let totalIn = 0;
  let totalOut = 0;
  let totalAdjustment = 0;
  let salesInRow = 0;

  for (; index < sorted.length; index++) {
    const event = sorted[index];
    const before: number | null = balance;
    apply(event);
    const day = storeDate(event.at);
    const last = rows[rows.length - 1];

    if (event.direction === 'OUT' && event.type === InventoryLedgerEntryType.VENTA && last?.type === InventoryLedgerEntryType.VENTA && last.storeDate === day) {
      salesInRow += 1;
      last.occurredAt = event.at;
      last.quantityOut = roundKardex(last.quantityOut + event.quantity);
      last.reference = `${salesInRow} tickets`;
      last.balance = balance;
      totalOut += event.quantity;
      continue;
    }

    const isCount = event.direction === 'COUNT';
    const adjustment = isCount && before !== null ? roundKardex(event.quantity - before) : null;
    if (adjustment !== null) totalAdjustment += adjustment;
    if (event.direction === 'IN') totalIn += event.quantity;
    if (event.direction === 'OUT') totalOut += event.quantity;
    salesInRow = event.type === InventoryLedgerEntryType.VENTA ? 1 : 0;

    rows.push({
      occurredAt: event.at,
      storeDate: day,
      type: event.type,
      concept: KARDEX_CONCEPT[event.type],
      reference: isCount ? (before === null ? 'Conteo inicial' : `Había ${before}, se contaron ${event.quantity}`) : event.reference,
      registeredBy: event.registeredBy,
      quantityIn: event.direction === 'IN' ? event.quantity : 0,
      quantityOut: event.direction === 'OUT' ? event.quantity : 0,
      adjustment,
      balance,
    });
  }

  return {
    openingBalance,
    closingBalance: balance,
    totalIn: roundKardex(totalIn),
    totalOut: roundKardex(totalOut),
    totalAdjustment: roundKardex(totalAdjustment),
    rows,
  };
}
