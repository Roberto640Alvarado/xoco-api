import { describe, expect, it } from 'vitest';
import { InventoryLedgerEntryType } from '../doc/inventory-ledger.doc.js';
import { KardexEvent, buildProductKardex } from '../utils/kardex.util.js';

const at = (iso: string) => new Date(iso);
const day = (date: Date) => date.toISOString().slice(0, 10);
const FROM = at('2026-10-10T00:00:00Z');
const TO = at('2026-10-12T23:59:59Z');

const count = (iso: string, quantity: number): KardexEvent => ({
  direction: 'COUNT',
  type: InventoryLedgerEntryType.CONTEO,
  at: at(iso),
  quantity,
  reference: null,
  registeredBy: 'fin@xoco.com',
});
const sale = (iso: string, quantity: number, ticket = 'POS/001'): KardexEvent => ({
  direction: 'OUT',
  type: InventoryLedgerEntryType.VENTA,
  at: at(iso),
  quantity,
  reference: ticket,
  registeredBy: null,
});
const entry = (iso: string, quantity: number): KardexEvent => ({
  direction: 'IN',
  type: InventoryLedgerEntryType.ENTRADA,
  at: at(iso),
  quantity,
  reference: 'Solicitud SOL-0001',
  registeredBy: 'ramblas@xoco.com',
});

describe('buildProductKardex', () => {
  it('parte del último conteo antes del período y lleva el saldo línea por línea', () => {
    const result = buildProductKardex(
      [count('2026-10-01T15:00:00Z', 20), sale('2026-10-05T15:00:00Z', 5), entry('2026-10-10T16:00:00Z', 12), sale('2026-10-11T18:00:00Z', 3)],
      FROM,
      TO,
      day,
    );
    expect(result.openingBalance).toBe(15);
    expect(result.rows.map((row) => [row.concept, row.quantityIn, row.quantityOut, row.balance])).toEqual([
      ['Entrada', 12, 0, 27],
      ['Venta', 0, 3, 24],
    ]);
    expect(result).toMatchObject({ totalIn: 12, totalOut: 3, totalAdjustment: 0, closingBalance: 24 });
  });

  it('junta las ventas seguidas del mismo día en una sola línea', () => {
    const result = buildProductKardex(
      [count('2026-10-09T15:00:00Z', 10), sale('2026-10-10T15:00:00Z', 1), sale('2026-10-10T16:00:00Z', 2), sale('2026-10-10T17:00:00Z', 1), sale('2026-10-11T15:00:00Z', 1)],
      FROM,
      TO,
      day,
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ quantityOut: 4, reference: '3 tickets', balance: 6 });
    expect(result.rows[1]).toMatchObject({ quantityOut: 1, reference: 'POS/001', balance: 5 });
  });

  it('un conteo dentro del período fija el saldo y deja el ajuste', () => {
    const result = buildProductKardex(
      [count('2026-10-09T15:00:00Z', 10), sale('2026-10-10T15:00:00Z', 2), count('2026-10-11T15:00:00Z', 7)],
      FROM,
      TO,
      day,
    );
    expect(result.rows[1]).toMatchObject({ concept: 'Conteo físico', adjustment: -1, balance: 7 });
    expect(result.totalAdjustment).toBe(-1);
    expect(result.closingBalance).toBe(7);
  });

  it('sin conteo previo el saldo es desconocido hasta el primer conteo', () => {
    const result = buildProductKardex([sale('2026-10-10T15:00:00Z', 2), count('2026-10-11T15:00:00Z', 9), sale('2026-10-12T15:00:00Z', 1)], FROM, TO, day);
    expect(result.openingBalance).toBeNull();
    expect(result.rows.map((row) => row.balance)).toEqual([null, 9, 8]);
    expect(result.rows[1]).toMatchObject({ adjustment: null, reference: 'Conteo inicial' });
  });

  it('ignora lo que pasa después del período', () => {
    const result = buildProductKardex([count('2026-10-09T15:00:00Z', 4), sale('2026-10-20T15:00:00Z', 2)], FROM, TO, day);
    expect(result).toMatchObject({ openingBalance: 4, closingBalance: 4, rows: [] });
  });
});
