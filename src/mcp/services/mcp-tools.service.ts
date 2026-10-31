import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { User } from '../../generated/prisma/index.js';
import { OdooService } from '../../odoo/services/odoo.service.js';
import { OAuthService } from './oauth.service.js';
import { XocoApiCatalogService } from './xoco-api-catalog.service.js';

// Modelos de Odoo que el conector no consulta aunque el usuario de Odoo
// pueda: credenciales, llaves y configuración técnica, y adjuntos (pesados).
const BLOCKED_ODOO_MODELS = new Set([
  'res.users.apikeys',
  'res.users.apikeys.description',
  'ir.config_parameter',
  'auth_totp.device',
  'ir.mail_server',
  'fetchmail.server',
  'ir.attachment',
]);

const MAX_ROWS = 500;
const DEFAULT_ROWS = 80;
const MAX_TEXT = 120_000;

const INSTRUCTIONS = `Conector de solo lectura de Xocolatísimo (chocolatería en El Salvador) para Admin y Finanzas.

Dos fuentes:
1) xoco-api (el panel): ventas ya calculadas como en el panel, metas, inventario por tienda (existencia estimada, kardex, registro, movimientos, solicitudes de stock, recetas). Usa "xoco_endpoints" para ver qué hay y "xoco_get" para consultarlo.
2) Odoo (la fuente de ventas, productos, clientes, facturas): "odoo_models", "odoo_fields", "odoo_search_read", "odoo_count", "odoo_read_group".

Reglas útiles:
- Las tiendas son pos.config en Odoo (posConfigId en xoco-api). Lista: xoco_get /sales/stores.
- Fechas de negocio en hora de El Salvador (UTC-6). Los datetimes de Odoo vienen en UTC: el día local 2026-10-30 va de "2026-10-30 06:00:00" a "2026-10-31 05:59:59" UTC.
- Ventas del POS: pos.order (excluye state='cancel') y pos.order.line. Facturas: account.move (move_type out_invoice / out_refund).
- Prefiere los endpoints de xoco-api para cifras que el panel ya calcula (así coinciden con lo que ven en pantalla), y Odoo para detalle o preguntas que el panel no cubre.
- Para muchos registros usa odoo_read_group o odoo_count en vez de traer todo.
- Nada de esto modifica datos.`;

function text(data: unknown) {
  let value = typeof data === 'string' ? data : JSON.stringify(data, null, 1);
  if (value.length > MAX_TEXT) value = `${value.slice(0, MAX_TEXT)}\n…[recortado: pide menos filas o campos]`;
  return { content: [{ type: 'text' as const, text: value }] };
}

function failure(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// Arma el servidor MCP (uno por request, sin estado) con las herramientas
// de solo lectura para la persona autenticada.
@Injectable()
export class McpToolsService {
  constructor(
    private readonly odooService: OdooService,
    private readonly catalog: XocoApiCatalogService,
    private readonly oauthService: OAuthService,
  ) {}

  private assertOdooModel(model: string): string | null {
    if (!/^[a-z0-9_.]+$/.test(model)) return 'Nombre de modelo inválido (ej. "pos.order").';
    if (BLOCKED_ODOO_MODELS.has(model)) return `El modelo ${model} no está disponible desde el conector.`;
    return null;
  }

  private async odoo<T>(model: string, run: () => Promise<T>) {
    const blocked = this.assertOdooModel(model);
    if (blocked) return failure(blocked);
    try {
      return text(await run());
    } catch (error) {
      return failure(`Odoo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  createServer(user: User): McpServer {
    const server = new McpServer({ name: 'xocolatisimo', version: '1.0.0' }, { instructions: INSTRUCTIONS });
    const domainSchema = z
      .array(z.unknown())
      .optional()
      .describe('Domain de Odoo, ej. [["state","!=","cancel"],["date_order",">=","2026-10-30 06:00:00"]]');

    server.registerTool(
      'whoami',
      { title: 'Quién está conectado', description: 'Usuario y rol con que está conectado este acceso.', inputSchema: {}, annotations: READ_ONLY },
      async () => text({ email: user.email, name: user.name, role: user.role }),
    );

    // ------------------------------------------------------------ xoco-api
    server.registerTool(
      'xoco_endpoints',
      {
        title: 'Consultas disponibles del panel',
        description:
          'Lista las consultas (GET) de xoco-api con su descripción y parámetros: ventas, metas, tiendas, inventario, kardex, solicitudes, recetas, usuarios. Filtra con "search" (ej. "kardex", "ventas", "inventory").',
        inputSchema: { search: z.string().optional().describe('Texto para filtrar por ruta o descripción.') },
        annotations: READ_ONLY,
      },
      async ({ search }) => text(this.catalog.list(search)),
    );

    server.registerTool(
      'xoco_get',
      {
        title: 'Consultar el panel',
        description:
          'Hace un GET a xoco-api con los permisos del usuario conectado. "path" es la ruta concreta (ej. "/inventory/stores/1/kardex") y "query" sus parámetros (ej. {"dateFrom":"2026-10-01","dateTo":"2026-10-31"}). Usa xoco_endpoints para ver rutas y parámetros.',
        inputSchema: {
          path: z.string().describe('Ruta, ej. /sales/daily-summary o /inventory/stores/1/items'),
          query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe('Parámetros de la consulta.'),
        },
        annotations: READ_ONLY,
      },
      async ({ path, query }) => {
        const endpoint = this.catalog.resolve(path);
        if (!endpoint) return failure(`La ruta ${path} no es una consulta disponible. Revisa xoco_endpoints.`);
        const token = await this.oauthService.panelToken(user);
        const result = await this.catalog.get(path, query ?? {}, token);
        if (result.status >= 400) return failure(`xoco-api respondió ${result.status}: ${result.body}`);
        return text(result.body);
      },
    );

    // ---------------------------------------------------------------- Odoo
    server.registerTool(
      'odoo_models',
      {
        title: 'Modelos de Odoo',
        description: 'Busca modelos de Odoo por nombre técnico o descripción (ej. "pos", "factura", "product").',
        inputSchema: { search: z.string().optional() },
        annotations: READ_ONLY,
      },
      async ({ search }) =>
        this.odoo('ir.model', () =>
          this.odooService.searchReadModel('ir.model', {
            domain: search ? ['|', ['model', 'ilike', search], ['name', 'ilike', search]] : [],
            fields: ['model', 'name'],
            limit: 200,
            order: 'model',
          }),
        ),
    );

    server.registerTool(
      'odoo_fields',
      {
        title: 'Campos de un modelo de Odoo',
        description: 'Campos de un modelo (nombre, tipo, relación, ayuda) para saber qué pedir en odoo_search_read / odoo_read_group.',
        inputSchema: {
          model: z.string().describe('Ej. pos.order'),
          search: z.string().optional().describe('Filtra campos por nombre o etiqueta.'),
        },
        annotations: READ_ONLY,
      },
      async ({ model, search }) =>
        this.odoo(model, async () => {
          const fields = await this.odooService.fieldsGetModel(model);
          const term = search?.toLowerCase();
          return Object.fromEntries(
            Object.entries(fields).filter(
              ([name, info]) => !term || name.toLowerCase().includes(term) || String(info.string ?? '').toLowerCase().includes(term),
            ),
          );
        }),
    );

    server.registerTool(
      'odoo_search_read',
      {
        title: 'Buscar registros en Odoo',
        description: `Lee registros de cualquier modelo de Odoo (solo lectura). Indica los campos que necesitas. Máximo ${MAX_ROWS} filas por llamada (usa offset para paginar).`,
        inputSchema: {
          model: z.string().describe('Ej. pos.order, pos.order.line, product.product, account.move, res.partner'),
          domain: domainSchema,
          fields: z.array(z.string()).optional().describe('Campos a traer, ej. ["name","date_order","amount_total","config_id"]'),
          limit: z.number().int().min(1).max(MAX_ROWS).optional(),
          offset: z.number().int().min(0).optional(),
          order: z.string().optional().describe('Ej. "date_order desc"'),
        },
        annotations: READ_ONLY,
      },
      async ({ model, domain, fields, limit, offset, order }) =>
        this.odoo(model, () =>
          this.odooService.searchReadModel(model, {
            domain: domain ?? [],
            fields: fields?.length ? fields : ['id', 'display_name'],
            limit: limit ?? DEFAULT_ROWS,
            offset,
            order,
          }),
        ),
    );

    server.registerTool(
      'odoo_count',
      {
        title: 'Contar registros en Odoo',
        description: 'Cuántos registros de un modelo cumplen un domain.',
        inputSchema: { model: z.string(), domain: domainSchema },
        annotations: READ_ONLY,
      },
      async ({ model, domain }) => this.odoo(model, () => this.odooService.searchCountModel(model, domain ?? [])),
    );

    server.registerTool(
      'odoo_read_group',
      {
        title: 'Agrupar y sumar en Odoo',
        description:
          'Agrupa y agrega del lado de Odoo (como agrupar una lista en Odoo). Ej. ventas por tienda: model "pos.order", fields ["amount_total:sum"], groupby ["config_id"]. Agrupar por fecha: "date_order:day" (o :week, :month).',
        inputSchema: {
          model: z.string(),
          domain: domainSchema,
          fields: z.array(z.string()).describe('Agregados, ej. ["amount_total:sum","qty:sum"]'),
          groupby: z.array(z.string()).min(1).describe('Ej. ["config_id"] o ["product_id","date_order:month"]'),
          orderby: z.string().optional(),
          limit: z.number().int().min(1).max(MAX_ROWS).optional(),
        },
        annotations: READ_ONLY,
      },
      async ({ model, domain, fields, groupby, orderby, limit }) =>
        this.odoo(model, () =>
          this.odooService.readGroupModel(model, { domain: domain ?? [], fields, groupby, orderby, limit: limit ?? MAX_ROWS }),
        ),
    );

    return server;
  }
}
