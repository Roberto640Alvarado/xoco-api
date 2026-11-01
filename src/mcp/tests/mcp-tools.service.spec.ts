import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Role, User } from '../../generated/prisma/index.js';
import type { OdooService } from '../../odoo/services/odoo.service.js';
import type { OAuthService } from '../services/oauth.service.js';
import { McpToolsService } from '../services/mcp-tools.service.js';
import { XocoApiCatalogService } from '../services/xoco-api-catalog.service.js';

const USER = { id: 'a1', email: 'admin@xoco.com', name: 'Admin', role: Role.SUPER_ADMIN } as User;

function setup() {
  const catalog = new XocoApiCatalogService();
  catalog.setDocument({
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths: {
      '/inventory/stores/{posConfigId}/kardex': {
        get: {
          summary: 'Kardex',
          parameters: [
            { name: 'posConfigId', in: 'path', required: true, schema: { type: 'number' } },
            { name: 'dateFrom', in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: {},
        },
      },
      '/odoo/config': { get: { summary: 'API key', responses: {} } },
      '/auth/me': { get: { summary: 'Yo', responses: {} } },
    },
  } as unknown as OpenAPIObject);
  const get = vi.spyOn(catalog, 'get').mockResolvedValue({ status: 200, body: '{"products":[]}' });

  const odoo = {
    searchReadModel: vi.fn().mockResolvedValue([{ id: 1, name: 'POS/001' }]),
    searchCountModel: vi.fn().mockResolvedValue(42),
    readGroupModel: vi.fn().mockResolvedValue([{ config_id: [1, 'Centrika'], amount_total: 100 }]),
    fieldsGetModel: vi.fn().mockResolvedValue({ name: { string: 'Ref', type: 'char' }, amount_total: { string: 'Total', type: 'monetary' } }),
  };
  const oauth = { panelToken: vi.fn().mockResolvedValue('panel-token') };
  const service = new McpToolsService(odoo as unknown as OdooService, catalog, oauth as unknown as OAuthService);
  return { service, odoo, get };
}

async function connect(service: McpToolsService) {
  const server = service.createServer(USER);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(clientTransport);
  return client;
}

const textOf = (result: unknown) => ((result as { content: { text: string }[] }).content[0]?.text ?? '');

describe('McpToolsService', () => {
  it('expone solo herramientas de lectura', async () => {
    const client = await connect(setup().service);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [
        'odoo_count',
        'odoo_fields',
        'odoo_models',
        'odoo_read_group',
        'odoo_search_read',
        'whoami',
        'xoco_endpoints',
        'xoco_get',
        'xoco_inventario_tienda',
        'xoco_kardex',
        'xoco_metas_del_mes',
        'xoco_productos_mas_vendidos',
        'xoco_tiendas',
        'xoco_ventas_por_dia',
        'xoco_ventas_por_tienda',
      ].sort(),
    );
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });

  it('se presenta como Xocolatísimo (Xoco) con su ícono e instrucciones', async () => {
    const client = await connect(setup().service);
    expect(client.getServerVersion()?.title).toBe('Xocolatísimo (Xoco)');
    expect(client.getInstructions()).toMatch(/Xoco, Xocolatísimo, Xocolatisimo/);
    expect(client.getInstructions()).toMatch(/SOLO LECTURA/);
  });

  it('xoco_ventas_por_dia usa el endpoint del panel con el rango y la tienda', async () => {
    const ctx = setup();
    const client = await connect(ctx.service);
    await client.callTool({ name: 'xoco_ventas_por_dia', arguments: { desde: '2026-10-01', hasta: '2026-10-31', tienda: 1 } });
    expect(ctx.get).toHaveBeenCalledWith('/sales/daily-summary', { dateFrom: '2026-10-01', dateTo: '2026-10-31', posConfigId: 1 }, 'panel-token');
  });

  it('el catálogo de xoco-api oculta login y la config del API key de Odoo', async () => {
    const client = await connect(setup().service);
    const paths = JSON.parse(textOf(await client.callTool({ name: 'xoco_endpoints', arguments: {} }))).map((item: { path: string }) => item.path);
    expect(paths).toEqual(['/inventory/stores/{posConfigId}/kardex']);
  });

  it('xoco_get consulta con el token del panel de la persona y rechaza rutas no listadas', async () => {
    const ctx = setup();
    const client = await connect(ctx.service);
    const ok = await client.callTool({ name: 'xoco_get', arguments: { path: '/inventory/stores/1/kardex', query: { dateFrom: '2026-10-01' } } });
    expect(textOf(ok)).toContain('products');
    expect(ctx.get).toHaveBeenCalledWith('/inventory/stores/1/kardex', { dateFrom: '2026-10-01' }, 'panel-token');
    const blocked = await client.callTool({ name: 'xoco_get', arguments: { path: '/odoo/config' } });
    expect(blocked.isError).toBe(true);
  });

  it('Odoo: lee, cuenta y agrupa; bloquea modelos sensibles', async () => {
    const ctx = setup();
    const client = await connect(ctx.service);
    await client.callTool({ name: 'odoo_search_read', arguments: { model: 'pos.order', domain: [['state', '!=', 'cancel']], fields: ['name'] } });
    expect(ctx.odoo.searchReadModel).toHaveBeenCalledWith('pos.order', expect.objectContaining({ fields: ['name'], limit: 80 }));
    expect(textOf(await client.callTool({ name: 'odoo_count', arguments: { model: 'pos.order' } }))).toBe('42');
    expect(textOf(await client.callTool({ name: 'odoo_read_group', arguments: { model: 'pos.order', fields: ['amount_total:sum'], groupby: ['config_id'] } }))).toContain('Centrika');
    const blocked = await client.callTool({ name: 'odoo_search_read', arguments: { model: 'res.users.apikeys' } });
    expect(blocked.isError).toBe(true);
  });
});
