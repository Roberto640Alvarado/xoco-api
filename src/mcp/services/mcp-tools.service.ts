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

const STORE_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' });

// Se arma en cada request para que el asistente sepa qué día es "hoy" en
// El Salvador (ayer, esta semana, este mes...).
function instructions(): string {
  const today = STORE_DATE.format(new Date());
  return `Conector de Xocolatísimo ("Xoco"), chocolatería en El Salvador. SOLO LECTURA y solo para Super admin.

Úsalo siempre que el usuario mencione Xoco, Xocolatísimo, Xocolatisimo, Xocolatisimo SV, "la chocolatería", sus tiendas (CENTRIKA, San Benito, Sucursal Escalón, Tienda Ramblas), Planta, ventas, metas, inventario, kardex, solicitudes de stock, recetas o datos de Odoo del negocio.

Hoy en El Salvador es ${today} (UTC-6). Interpreta "hoy", "ayer", "esta semana" o "este mes" con esa fecha.

Empieza por las herramientas directas (mismas cifras que el panel):
- xoco_tiendas, xoco_ventas_por_dia, xoco_ventas_por_tienda, xoco_productos_mas_vendidos, xoco_metas_del_mes
- xoco_inventario_tienda, xoco_kardex
Para lo demás del panel: xoco_endpoints + xoco_get.
Para detalle que el panel no cubre, Odoo: odoo_models, odoo_fields, odoo_search_read, odoo_count, odoo_read_group.

Reglas:
- Las tiendas son pos.config en Odoo (posConfigId en el panel).
- Los datetimes de Odoo vienen en UTC: el día local ${today} va de "${today} 06:00:00" a las 05:59:59 UTC del día siguiente.
- Ventas de caja: pos.order (sin state='cancel') y pos.order.line. Facturas: account.move (out_invoice / out_refund).
- Para muchos registros usa odoo_read_group u odoo_count en vez de traer todo.
- Montos en dólares (USD). Responde en español.
- Nada de esto crea, cambia ni borra datos: si piden modificar algo, explica que el conector es solo de consulta y que se hace en el panel.`;
}

function text(data: unknown) {
  let value = typeof data === 'string' ? data : JSON.stringify(data, null, 1);
  if (value.length > MAX_TEXT) value = `${value.slice(0, MAX_TEXT)}\n…[recortado: pide menos filas o campos]`;
  return { content: [{ type: 'text' as const, text: value }] };
}

function failure(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD.');

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

  // GET al panel con los permisos de la persona; devuelve el JSON ya parseado.
  private async panel(user: User, path: string, query: Record<string, string | number | boolean | undefined> = {}) {
    const clean = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined)) as Record<
      string,
      string | number | boolean
    >;
    const token = await this.oauthService.panelToken(user);
    const result = await this.catalog.get(path, clean, token);
    if (result.status >= 400) return { error: `El panel respondió ${result.status}: ${result.body}` };
    try {
      const parsed = JSON.parse(result.body) as unknown;
      // Algunas respuestas vienen en el sobre { status, data } del panel.
      const data =
        parsed && typeof parsed === 'object' && 'data' in parsed && 'status' in parsed ? (parsed as { data: unknown }).data : parsed;
      return { data };
    } catch {
      return { data: result.body as unknown };
    }
  }

  private async panelTool(user: User, path: string, query?: Record<string, string | number | boolean | undefined>) {
    const result = await this.panel(user, path, query);
    return 'error' in result ? failure(result.error as string) : text(result.data);
  }

  createServer(user: User, baseUrl?: string): McpServer {
    const icons = baseUrl
      ? [
          { src: `${baseUrl}/icon.png`, mimeType: 'image/png', sizes: ['96x96'] },
          { src: `${baseUrl}/favicon.ico`, mimeType: 'image/x-icon', sizes: ['48x48'] },
        ]
      : undefined;
    const server = new McpServer(
      { name: 'xocolatisimo', title: 'Xocolatísimo (Xoco)', version: '1.1.0', icons, websiteUrl: baseUrl },
      { instructions: instructions() },
    );
    const domainSchema = z
      .array(z.unknown())
      .optional()
      .describe('Domain de Odoo, ej. [["state","!=","cancel"],["date_order",">=","2026-10-30 06:00:00"]]');

    server.registerTool(
      'whoami',
      { title: 'Quién está conectado', description: 'Usuario y rol con que está conectado este acceso.', inputSchema: {}, annotations: READ_ONLY },
      async () => text({ email: user.email, name: user.name, role: user.role }),
    );


    // ---------------------------------------------- herramientas directas
    // Atajos con nombre claro sobre los mismos endpoints del panel, para que
    // el asistente no tenga que adivinar rutas.
    const storeId = z.number().int().positive().describe('id de la tienda (posConfigId). Ver xoco_tiendas.');
    const rangeSchema = {
      desde: dateSchema.describe('Día inicial (incluido), YYYY-MM-DD, hora de El Salvador.'),
      hasta: dateSchema.optional().describe('Día final (incluido). Si se omite, solo "desde".'),
    };

    server.registerTool(
      'xoco_tiendas',
      {
        title: 'Tiendas de Xocolatísimo',
        description: 'Lista las tiendas de Xocolatísimo (Xoco) con su id: CENTRIKA, San Benito, Sucursal Escalón, Tienda Ramblas.',
        inputSchema: {},
        annotations: READ_ONLY,
      },
      async () => this.panelTool(user, '/sales/stores'),
    );

    server.registerTool(
      'xoco_ventas_por_dia',
      {
        title: 'Ventas de Xoco por día',
        description:
          'Venta de caja (POS) de Xocolatísimo por día local: monto y órdenes, sin canceladas. Una tienda o todas. Igual que la gráfica del panel.',
        inputSchema: { ...rangeSchema, tienda: storeId.optional().describe('Sin valor = todas las tiendas.') },
        annotations: READ_ONLY,
      },
      async ({ desde, hasta, tienda }) =>
        this.panelTool(user, '/sales/daily-summary', { dateFrom: desde, dateTo: hasta ?? desde, posConfigId: tienda }),
    );

    server.registerTool(
      'xoco_ventas_por_tienda',
      {
        title: 'Ventas y visitas de Xoco por tienda',
        description:
          'Visitas (facturas) y venta con y sin impuesto por tienda de Xocolatísimo; mayoreo aparte. Es la cifra de los módulos Visitas y Venta Mensual del panel.',
        inputSchema: rangeSchema,
        annotations: READ_ONLY,
      },
      async ({ desde, hasta }) => this.panelTool(user, '/sales/by-store', { dateFrom: desde, dateTo: hasta ?? desde }),
    );

    server.registerTool(
      'xoco_productos_mas_vendidos',
      {
        title: 'Productos más (o menos) vendidos de Xoco',
        description: 'Ranking de productos de Xocolatísimo por unidades vendidas en caja, por tienda o todas. "orden": desc = más vendidos, asc = menos vendidos.',
        inputSchema: {
          ...rangeSchema,
          tienda: storeId.optional().describe('Sin valor = todas las tiendas.'),
          cuantos: z.number().int().min(1).max(100).optional().describe('Cuántos productos (por defecto 20).'),
          orden: z.enum(['desc', 'asc']).optional(),
        },
        annotations: READ_ONLY,
      },
      async ({ desde, hasta, tienda, cuantos, orden }) =>
        this.panelTool(user, '/sales/top-products', {
          dateFrom: desde,
          dateTo: hasta ?? desde,
          posConfigId: tienda,
          limit: cuantos ?? 20,
          order: orden,
        }),
    );

    server.registerTool(
      'xoco_metas_del_mes',
      {
        title: 'Metas de venta de Xoco',
        description: 'Meta de venta, avance real y pendiente por tienda de Xocolatísimo para un mes (en el mes en curso, el real es hasta ayer).',
        inputSchema: {
          anio: z.number().int().min(2020).max(2100),
          mes: z.number().int().min(1).max(12),
        },
        annotations: READ_ONLY,
      },
      async ({ anio, mes }) => this.panelTool(user, '/sales-goals/summary', { year: anio, month: mes }),
    );

    server.registerTool(
      'xoco_inventario_tienda',
      {
        title: 'Inventario de una tienda de Xoco',
        description:
          'Existencia de una tienda de Xocolatísimo: último conteo físico, existencia estimada hoy (conteo − ventas − mermas/regalías/degustaciones + entradas) y fecha del conteo. Filtra por nombre o categoría.',
        inputSchema: {
          tienda: storeId,
          buscar: z.string().optional().describe('Texto en el nombre del producto o su categoría (ej. "bombón", "Pacamara").'),
          soloContados: z.boolean().optional().describe('true = solo productos que ya tienen conteo (por defecto true).'),
        },
        annotations: READ_ONLY,
      },
      async ({ tienda, buscar, soloContados }) => {
        const result = await this.panel(user, `/inventory/stores/${tienda}/items`);
        if ('error' in result) return failure(result.error as string);
        const term = buscar?.trim().toLowerCase();
        const items = (Array.isArray(result.data) ? result.data : []) as Array<{
          productId: number;
          productName: string;
          categoryName: string;
          unit: string;
          quantity: number | null;
          estimatedQuantity: number | null;
          recipe: unknown;
          countedAt: string | null;
        }>;
        const rows = items
          .filter((item) => (soloContados ?? true ? item.quantity !== null || item.recipe : true))
          .filter((item) => !term || `${item.productName} ${item.categoryName}`.toLowerCase().includes(term))
          .map((item) => ({
            producto: item.productName,
            productId: item.productId,
            categoria: item.categoryName,
            unidad: item.unit,
            ultimoConteo: item.quantity,
            existenciaEstimada: item.estimatedQuantity,
            contadoEl: item.countedAt,
            porReceta: Boolean(item.recipe),
          }));
        return text({ tienda, productos: rows.length, items: rows });
      },
    );

    server.registerTool(
      'xoco_kardex',
      {
        title: 'Kardex de una tienda de Xoco',
        description: 'Kardex de inventario de una tienda de Xocolatísimo: saldo inicial, entradas, salidas, ajustes por conteo y saldo final por producto en un rango.',
        inputSchema: {
          tienda: storeId,
          ...rangeSchema,
          productId: z.number().int().positive().optional().describe('Solo este producto (id de Odoo, ver xoco_inventario_tienda).'),
        },
        annotations: READ_ONLY,
      },
      async ({ tienda, desde, hasta, productId }) =>
        this.panelTool(user, `/inventory/stores/${tienda}/kardex`, { dateFrom: desde, dateTo: hasta ?? desde, productId }),
    );

    // ------------------------------------------------------------ xoco-api
    server.registerTool(
      'xoco_endpoints',
      {
        title: 'Consultas disponibles del panel de Xoco',
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
        title: 'Consultar el panel de Xoco',
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
        return this.panelTool(user, path, query);
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
