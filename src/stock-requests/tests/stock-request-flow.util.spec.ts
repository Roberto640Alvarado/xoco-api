import { describe, expect, it } from 'vitest';
import { Role, StockRequestStatus } from '../../generated/prisma/index.js';
import { canCancel, dispatchKind, formatRequestCode, roundQuantity } from '../utils/stock-request-flow.util.js';

describe('stock-request-flow', () => {
  describe('dispatchKind', () => {
    it('es COMPLETO cuando planta envía todo lo pedido (o más)', () => {
      expect(
        dispatchKind([
          { requestedQuantity: 10, sentQuantity: 10, addedByPlant: false },
          { requestedQuantity: 5, sentQuantity: 8, addedByPlant: false },
        ]),
      ).toBe('COMPLETO');
    });

    it('es PARCIAL si falta algo, aunque sea una línea sin existencia', () => {
      expect(
        dispatchKind([
          { requestedQuantity: 10, sentQuantity: 10, addedByPlant: false },
          { requestedQuantity: 5, sentQuantity: 0, addedByPlant: false },
        ]),
      ).toBe('PARCIAL');
      expect(dispatchKind([{ requestedQuantity: 10, sentQuantity: 6, addedByPlant: false }])).toBe('PARCIAL');
    });

    it('no cuenta lo que planta agregó: no se pidió, no puede faltar', () => {
      expect(
        dispatchKind([
          { requestedQuantity: 10, sentQuantity: 10, addedByPlant: false },
          { requestedQuantity: 0, sentQuantity: 0, addedByPlant: true },
        ]),
      ).toBe('COMPLETO');
    });
  });

  describe('canCancel', () => {
    it('la tienda solo cancela mientras planta no la toma', () => {
      expect(canCancel(Role.VENDEDOR, StockRequestStatus.SOLICITADA)).toBe(true);
      expect(canCancel(Role.VENDEDOR, StockRequestStatus.EN_PREPARACION)).toBe(false);
      expect(canCancel(Role.VENDEDOR, StockRequestStatus.EN_CAMINO)).toBe(false);
    });

    it('planta cancela mientras responde, no después de despachar', () => {
      expect(canCancel(Role.PLANTA, StockRequestStatus.SOLICITADA)).toBe(true);
      expect(canCancel(Role.PLANTA, StockRequestStatus.EN_PREPARACION)).toBe(true);
      expect(canCancel(Role.PLANTA, StockRequestStatus.EN_CAMINO)).toBe(false);
    });

    it('Admin y Finanzas cancelan hasta que la tienda confirma', () => {
      for (const role of [Role.SUPER_ADMIN, Role.FINANZAS]) {
        expect(canCancel(role, StockRequestStatus.EN_CAMINO)).toBe(true);
        expect(canCancel(role, StockRequestStatus.RECIBIDA)).toBe(false);
        expect(canCancel(role, StockRequestStatus.CANCELADA)).toBe(false);
      }
    });
  });

  it('formatea el número de requisición', () => {
    expect(formatRequestCode(7)).toBe('SOL-0007');
    expect(formatRequestCode(12345)).toBe('SOL-12345');
  });

  it('redondea cantidades a 3 decimales', () => {
    expect(roundQuantity(0.1 + 0.2)).toBe(0.3);
    expect(roundQuantity(1.23456)).toBe(1.235);
  });
});
