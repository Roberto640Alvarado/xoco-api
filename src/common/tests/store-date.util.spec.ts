import { describe, expect, it } from 'vitest';
import {
  enumerateDates,
  shiftDate,
  storeDayRangeToUtc,
  toStoreDate,
} from '../utils/store-date.util.js';

describe('store-date.util', () => {
  describe('toStoreDate', () => {
    it('resta las 6 horas de El Salvador antes de quedarse con la fecha', () => {
      // 01:04 UTC del día 8 son las 19:04 del día 7 en la tienda.
      expect(toStoreDate('2026-09-08 01:04:31')).toBe('2026-09-07');
      expect(toStoreDate('2026-09-07 18:41:25')).toBe('2026-09-07');
    });

    it('respeta los bordes exactos del día local', () => {
      expect(toStoreDate('2026-09-07 05:59:59')).toBe('2026-09-06');
      expect(toStoreDate('2026-09-07 06:00:00')).toBe('2026-09-07');
      expect(toStoreDate('2026-09-08 05:59:59')).toBe('2026-09-07');
      expect(toStoreDate('2026-09-08 06:00:00')).toBe('2026-09-08');
    });
  });

  describe('storeDayRangeToUtc', () => {
    it('traduce un solo día local a su ventana UTC completa', () => {
      expect(storeDayRangeToUtc('2026-09-07', '2026-09-07')).toEqual({
        utcFrom: '2026-09-07 06:00:00',
        utcTo: '2026-09-08 05:59:59',
      });
    });

    it('incluye el último día completo en un rango de varios días', () => {
      expect(storeDayRangeToUtc('2026-09-01', '2026-09-30')).toEqual({
        utcFrom: '2026-09-01 06:00:00',
        utcTo: '2026-10-01 05:59:59',
      });
    });

    it('es la inversa de toStoreDate en ambos extremos', () => {
      const { utcFrom, utcTo } = storeDayRangeToUtc('2026-09-07', '2026-09-07');
      expect(toStoreDate(utcFrom)).toBe('2026-09-07');
      expect(toStoreDate(utcTo)).toBe('2026-09-07');
    });
  });

  describe('shiftDate', () => {
    it('suma y resta días cruzando meses y años', () => {
      expect(shiftDate('2026-09-07', 1)).toBe('2026-09-08');
      expect(shiftDate('2026-09-01', -1)).toBe('2026-08-31');
      expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    });
  });

  describe('enumerateDates', () => {
    it('incluye ambos extremos', () => {
      expect(enumerateDates('2026-09-06', '2026-09-08')).toEqual([
        '2026-09-06',
        '2026-09-07',
        '2026-09-08',
      ]);
    });

    it('devuelve un solo día cuando el rango es de un día', () => {
      expect(enumerateDates('2026-09-07', '2026-09-07')).toEqual(['2026-09-07']);
    });
  });
});
