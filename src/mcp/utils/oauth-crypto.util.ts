import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Utilidades del flujo OAuth del conector MCP — puras, para poder probarlas.

/** Hash con el que se guardan códigos y tokens (nunca en claro). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Token aleatorio apto para URL (códigos, refresh tokens, client_id). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** PKCE S256: BASE64URL(SHA256(code_verifier)) === code_challenge. */
export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  if (!codeVerifier || !codeChallenge) return false;
  const computed = Buffer.from(createHash('sha256').update(codeVerifier).digest('base64url'));
  const expected = Buffer.from(codeChallenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Redirecciones permitidas: https, o http solo a la propia máquina (clientes de escritorio). Sin fragmento. */
export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}
