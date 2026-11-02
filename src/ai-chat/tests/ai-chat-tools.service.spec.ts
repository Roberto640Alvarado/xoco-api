import { describe, expect, it, vi } from 'vitest';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Role, User } from '../../generated/prisma/index.js';
import type { OdooService } from '../../odoo/services/odoo.service.js';
import type { OAuthService } from '../../mcp/services/oauth.service.js';
import { McpToolsService } from '../../mcp/services/mcp-tools.service.js';
import { XocoApiCatalogService } from '../../mcp/services/xoco-api-catalog.service.js';
import { AiChatToolsService } from '../services/ai-chat-tools.service.js';

const USER = { id: 'a1', email: 'admin@xoco.com', name: 'Admin', role: Role.SUPER_ADMIN } as User;

function toolsService() {
  const catalog = new XocoApiCatalogService();
  catalog.setDocument({ openapi: '3.0.0', info: { title: 't', version: '1' }, paths: {} } as unknown as OpenAPIObject);
  vi.spyOn(catalog, 'get').mockResolvedValue({ status: 200, body: JSON.stringify({ items: [{ id: 1, name: 'CENTRIKA' }] }) });
  const odoo = { readGroupModel: vi.fn().mockResolvedValue([{ config_id: [1, 'Centrika'], amount_total: 100 }]) };
  const oauth = { panelToken: vi.fn().mockResolvedValue('panel-token') };
  const mcp = new McpToolsService(odoo as unknown as OdooService, catalog, oauth as unknown as OAuthService);
  return new AiChatToolsService(mcp);
}

describe('AiChatToolsService', () => {
  it('expone las herramientas del conector (sin whoami) como JSON Schema y las ejecuta', async () => {
    const toolbox = await toolsService().open(USER);
    const names = toolbox.tools.map((tool) => tool.name);
    expect(names).toContain('xoco_venta_mensual');
    expect(names).toContain('odoo_read_group');
    expect(names).not.toContain('whoami');
    const monthly = toolbox.tools.find((tool) => tool.name === 'xoco_venta_mensual');
    expect(monthly?.inputSchema).toMatchObject({ type: 'object' });
    expect(monthly?.inputSchema).not.toHaveProperty('$schema');
    expect(toolbox.instructions).toContain('Xocolatísimo');
    expect(toolbox.titles.get('xoco_tiendas')).toBe('Tiendas de Xocolatísimo');

    const result = await toolbox.call('xoco_tiendas', {});
    expect(result.isError).toBe(false);
    expect(result.output).toContain('CENTRIKA');
    await toolbox.close();
  });
});
