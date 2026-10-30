import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OdooService } from '../../odoo/services/odoo.service.js';
import type { RecipesRepository } from '../repositories/recipes.repository.js';
import { RecipesService } from '../services/recipes.service.js';

const RAMBLAS = 3;
const CENTRO = 4;

function product(id: number, name: string, uom = 'Unidades') {
  return { id, display_name: name, categ_id: [id, 'All / Café'], uom_id: [1, uom] };
}

type Saved = { posConfigId: number; productId: number; productName: string; components: { productId: number; productName: string; unit: string; quantity: number }[]; updatedByEmail: string; updatedAt: Date };

function setup() {
  const rows: Saved[] = [];
  const repository = {
    findForStore: vi.fn(async (posConfigId: number) => rows.filter((row) => row.posConfigId === posConfigId)),
    upsert: vi.fn(async (data: Omit<Saved, 'updatedAt'>) => {
      const index = rows.findIndex((row) => row.posConfigId === data.posConfigId && row.productId === data.productId);
      const saved = { ...data, updatedAt: new Date() };
      if (index >= 0) rows[index] = saved;
      else rows.push(saved);
      return saved;
    }),
    remove: vi.fn(async (posConfigId: number, productId: number) => {
      const index = rows.findIndex((row) => row.posConfigId === posConfigId && row.productId === productId);
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    }),
  } as unknown as RecipesRepository;
  const odoo = {
    findProducts: vi.fn().mockResolvedValue([product(10, 'Americano'), product(11, 'Capuchino'), product(500, 'Cápsula Pacamara'), product(600, 'Leche', 'kg')]),
    findPosConfigs: vi.fn(async (options: { domain: [string, string, number][] }) =>
      [RAMBLAS, CENTRO].includes(options.domain[0][2]) ? [{ id: options.domain[0][2], name: 'Tienda' }] : [],
    ),
  } as unknown as OdooService;
  return { service: new RecipesService(repository, odoo), rows };
}

describe('RecipesService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('guarda la receta con nombres y unidad de Odoo, por tienda', async () => {
    const doc = await ctx.service.upsert(RAMBLAS, 11, { components: [{ productId: 500, quantity: 1 }, { productId: 600, quantity: 0.15 }] }, 'admin@xoco.com');
    expect(doc).toMatchObject({
      posConfigId: RAMBLAS,
      productName: 'Capuchino',
      components: [
        { productId: 500, productName: 'Cápsula Pacamara', unit: 'unidad', quantity: 1 },
        { productId: 600, unit: 'kg', quantity: 0.15 },
      ],
    });
    expect(await ctx.service.findForStore(CENTRO)).toEqual([]);
    const map = await ctx.service.findRecipeMap(RAMBLAS);
    expect(map.get(11)?.components.map((component) => component.productId)).toEqual([500, 600]);
  });

  it('rechaza tienda inválida, ingrediente igual al producto, repetidos y productos que no existen', async () => {
    await expect(ctx.service.upsert(99, 10, { components: [{ productId: 500, quantity: 1 }] }, 'a')).rejects.toThrow('tienda');
    await expect(ctx.service.upsert(RAMBLAS, 10, { components: [{ productId: 10, quantity: 1 }] }, 'a')).rejects.toThrow('sí mismo');
    await expect(
      ctx.service.upsert(RAMBLAS, 10, { components: [{ productId: 500, quantity: 1 }, { productId: 500, quantity: 1 }] }, 'a'),
    ).rejects.toThrow('repetidos');
    await expect(ctx.service.upsert(RAMBLAS, 10, { components: [{ productId: 777, quantity: 1 }] }, 'a')).rejects.toThrow('777');
  });

  it('no permite recetas anidadas', async () => {
    await ctx.service.upsert(RAMBLAS, 10, { components: [{ productId: 500, quantity: 1 }] }, 'a');
    await expect(ctx.service.upsert(RAMBLAS, 11, { components: [{ productId: 10, quantity: 1 }] }, 'a')).rejects.toThrow('propia receta');
    await expect(ctx.service.upsert(RAMBLAS, 500, { components: [{ productId: 600, quantity: 1 }] }, 'a')).rejects.toThrow('propia receta');
  });

  it('copia las recetas de otra tienda y quita una receta', async () => {
    await ctx.service.upsert(RAMBLAS, 10, { components: [{ productId: 500, quantity: 1 }] }, 'a');
    const copied = await ctx.service.copyFrom(CENTRO, RAMBLAS, 'b');
    expect(copied.map((recipe) => recipe.productId)).toEqual([10]);
    await ctx.service.remove(CENTRO, 10);
    expect(await ctx.service.findForStore(CENTRO)).toEqual([]);
    await expect(ctx.service.remove(CENTRO, 10)).rejects.toThrow('no existe');
  });
});
