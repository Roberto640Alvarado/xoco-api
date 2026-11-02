import { Injectable, Logger } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

// Rutas que el conector NUNCA consulta, aunque sean GET: sesión/login,
// el propio OAuth/MCP y la configuración del API key de Odoo.
const BLOCKED_PREFIXES = ['/auth', '/oauth', '/mcp', '/.well-known', '/odoo/config', '/ai-chat'];

const MAX_BODY_CHARS = 120_000;

export interface CatalogParam {
  name: string;
  in: string;
  required: boolean;
  description?: string;
  type?: string;
  enum?: unknown[];
}

export interface CatalogEndpoint {
  path: string;
  summary?: string;
  description?: string;
  tag?: string;
  params: CatalogParam[];
}

interface OpenApiParameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: { type?: string; enum?: unknown[]; format?: string };
}

// Catálogo de los endpoints GET de xoco-api (sale del documento OpenAPI
// que arma main.ts con los decoradores de Swagger) y la llamada interna a
// ellos. El conector solo hace GET, siempre con un token del PANEL de la
// persona que está conectada: aplican exactamente los mismos permisos,
// validaciones y reglas que en el panel.
@Injectable()
export class XocoApiCatalogService {
  private readonly logger = new Logger(XocoApiCatalogService.name);
  private endpoints: CatalogEndpoint[] = [];
  private matchers: { regex: RegExp; endpoint: CatalogEndpoint }[] = [];

  setDocument(document: OpenAPIObject): void {
    const endpoints: CatalogEndpoint[] = [];
    for (const [path, item] of Object.entries(document.paths ?? {})) {
      const get = item.get;
      if (!get || this.isBlocked(path)) continue;
      const params = ((get.parameters ?? []) as OpenApiParameter[]).map((param) => ({
        name: param.name,
        in: param.in,
        required: Boolean(param.required),
        description: param.description,
        type: param.schema?.format ?? param.schema?.type,
        enum: param.schema?.enum,
      }));
      endpoints.push({ path, summary: get.summary, description: get.description, tag: get.tags?.[0], params });
    }
    endpoints.sort((a, b) => a.path.localeCompare(b.path));
    this.endpoints = endpoints;
    this.matchers = endpoints.map((endpoint) => ({
      regex: new RegExp(`^${endpoint.path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[^}]+\\?\}|\{[^}]+\}/g, '[^/]+')}$`),
      endpoint,
    }));
    this.logger.log(`Conector MCP: ${endpoints.length} endpoints GET disponibles.`);
  }

  private isBlocked(path: string): boolean {
    return BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  }

  list(search?: string): CatalogEndpoint[] {
    const term = search?.trim().toLowerCase();
    if (!term) return this.endpoints;
    return this.endpoints.filter((endpoint) =>
      [endpoint.path, endpoint.summary, endpoint.description, endpoint.tag].some((text) => text?.toLowerCase().includes(term)),
    );
  }

  /** Valida que `path` sea un GET conocido y no bloqueado (ej. /inventory/stores/1/items). */
  resolve(path: string): CatalogEndpoint | null {
    if (!path.startsWith('/') || path.includes('..') || path.includes('?') || this.isBlocked(path)) return null;
    return this.matchers.find((matcher) => matcher.regex.test(path))?.endpoint ?? null;
  }

  /** GET interno a la propia API con el token del panel de la persona. */
  async get(path: string, query: Record<string, string | number | boolean>, panelToken: string): Promise<{ status: number; body: string }> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
    }
    const port = process.env.PORT ?? 4005;
    const url = `http://127.0.0.1:${port}${path}${params.size ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${panelToken}`, Accept: 'application/json' } });
    let body = await response.text();
    if (body.length > MAX_BODY_CHARS) {
      body = `${body.slice(0, MAX_BODY_CHARS)}\n…[respuesta recortada: ${body.length} caracteres en total. Pide un rango más chico o filtra más.]`;
    }
    return { status: response.status, body };
  }
}
