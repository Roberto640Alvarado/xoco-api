import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isAllowedRedirectUri, randomToken, sha256Hex, verifyPkceS256 } from '../utils/oauth-crypto.util.js';

describe('oauth-crypto', () => {
  it('PKCE S256: acepta el verifier correcto y rechaza otro', () => {
    const verifier = randomToken();
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256('otro-verifier', challenge)).toBe(false);
    expect(verifyPkceS256('', challenge)).toBe(false);
  });

  it('redirects: https sí; http solo a la propia máquina; nada con fragmento', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(isAllowedRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost:6274/oauth/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://evil.com/callback')).toBe(false);
    expect(isAllowedRedirectUri('https://claude.ai/cb#x')).toBe(false);
    expect(isAllowedRedirectUri('no es url')).toBe(false);
  });

  it('el hash es estable y no es el valor en claro', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).not.toContain('abc');
  });
});
