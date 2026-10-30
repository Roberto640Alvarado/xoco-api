import { describe, expect, it } from 'vitest';
import { RecipeMap, expandSale, soldProductsAffecting, viaLabel } from '../utils/expand-recipes.util.js';

const PACAMARA = 500;
const LECHE = 600;
const AMERICANO = 10;
const CAPUCHINO = 11;

const recipes: RecipeMap = new Map([
  [AMERICANO, { productName: 'Americano', components: [{ productId: PACAMARA, productName: 'Cápsula Pacamara', quantity: 1 }] }],
  [
    CAPUCHINO,
    {
      productName: 'Capuchino',
      components: [
        { productId: PACAMARA, productName: 'Cápsula Pacamara', quantity: 1 },
        { productId: LECHE, productName: 'Leche (kg)', quantity: 0.15 },
      ],
    },
  ],
]);

describe('expandSale', () => {
  it('una venta con receta descuenta sus ingredientes × lo vendido, no el producto', () => {
    expect(expandSale(CAPUCHINO, 2, recipes)).toEqual([
      { productId: PACAMARA, productName: 'Cápsula Pacamara', quantity: 2, via: { productId: CAPUCHINO, productName: 'Capuchino', quantity: 2 } },
      { productId: LECHE, productName: 'Leche (kg)', quantity: 0.3, via: { productId: CAPUCHINO, productName: 'Capuchino', quantity: 2 } },
    ]);
  });

  it('una venta sin receta queda igual', () => {
    expect(expandSale(999, 3, recipes)).toEqual([{ productId: 999, productName: null, quantity: 3, via: null }]);
  });

  it('5 pacamaras: 2 americanos y 1 capuchino gastan 3', () => {
    const used = [...expandSale(AMERICANO, 2, recipes), ...expandSale(CAPUCHINO, 1, recipes)]
      .filter((sale) => sale.productId === PACAMARA)
      .reduce((sum, sale) => sum + sale.quantity, 0);
    expect(5 - used).toBe(2);
  });
});

describe('soldProductsAffecting', () => {
  it('un ingrediente lo mueven las bebidas que lo usan', () => {
    expect(soldProductsAffecting(PACAMARA, recipes).sort()).toEqual([PACAMARA, AMERICANO, CAPUCHINO].sort());
  });

  it('un producto con receta no tiene ventas propias', () => {
    expect(soldProductsAffecting(AMERICANO, recipes)).toEqual([]);
  });
});

it('viaLabel nombra el origen del consumo', () => {
  expect(viaLabel({ productId: AMERICANO, productName: 'Americano', quantity: 2 })).toBe('Americano ×2');
});
