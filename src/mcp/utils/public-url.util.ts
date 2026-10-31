import type { Request } from 'express';

// URL pública de la API (la que ven Claude/ChatGPT), sin "/" final. Se
// toma de PUBLIC_API_URL; si no está, del request (respetando el proxy).
export function publicBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() || req.get('host');
  return `${proto}://${host}`;
}
