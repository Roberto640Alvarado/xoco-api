// Un campo many2one de Odoo llega como tupla [id, "nombre a mostrar"], o
// como `false` cuando está vacío (nunca `null`). Ejemplos reales:
// categ_id: [21, "Tabletas"], parent_id: false, barcode: false.
export type OdooMany2One = [number, string] | false;

// Credenciales resueltas para hacer una llamada — vienen de dos fuentes:
// baseUrl/db son de infraestructura (env), uid/apiKey se leen en cada
// request desde el OdooConfig guardado en Mongo (nunca desde env).
export interface OdooCredentials {
  baseUrl: string;
  db: string;
  uid: number;
  apiKey: string;
}

export interface OdooSearchReadOptions {
  domain?: unknown[];
  limit?: number;
  offset?: number;
  order?: string;
}

// Forma cruda que devuelve Odoo por JSON-RPC.
export interface OdooJsonRpcSuccess<T> {
  jsonrpc: '2.0';
  id: number;
  result: T;
}

export interface OdooJsonRpcError {
  jsonrpc: '2.0';
  id: number;
  error: {
    code: number;
    message: string;
    data?: { name?: string; debug?: string; message?: string };
  };
}
