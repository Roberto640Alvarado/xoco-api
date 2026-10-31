import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../generated/prisma/index.js';
import type { UsersService } from '../../users/services/users.service.js';
import type { OAuthRepository } from '../repositories/oauth.repository.js';
import { OAuthService } from '../services/oauth.service.js';

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

type Row = Record<string, unknown> & { id: string };

function setup() {
  process.env.JWT_SECRET = 'test-secret';
  const clients: Row[] = [];
  const codes: Row[] = [];
  const refresh: Row[] = [];
  let seq = 0;
  const repository = {
    createClient: vi.fn(async (data: Row) => {
      const row = { ...data, id: String(++seq), createdAt: new Date() };
      clients.push(row);
      return row;
    }),
    findClient: vi.fn(async (clientId: string) => clients.find((row) => row.clientId === clientId) ?? null),
    createCode: vi.fn(async (data: Row) => {
      const row = { ...data, id: String(++seq), usedAt: null };
      codes.push(row);
      return row;
    }),
    findCode: vi.fn(async (hash: string) => codes.find((row) => row.codeHash === hash) ?? null),
    consumeCode: vi.fn(async (id: string) => {
      const row = codes.find((item) => item.id === id);
      if (!row || row.usedAt) return false;
      row.usedAt = new Date();
      return true;
    }),
    createRefreshToken: vi.fn(async (data: Row) => {
      const row = { ...data, id: String(++seq), revokedAt: null };
      refresh.push(row);
      return row;
    }),
    findRefreshToken: vi.fn(async (hash: string) => refresh.find((row) => row.tokenHash === hash) ?? null),
    revokeRefreshToken: vi.fn(async (id: string) => {
      const row = refresh.find((item) => item.id === id);
      if (!row || row.revokedAt) return false;
      row.revokedAt = new Date();
      return true;
    }),
  } as unknown as OAuthRepository;

  const users = {
    admin: { id: 'a1', email: 'admin@xoco.com', password: 'ok', role: Role.SUPER_ADMIN, isActive: true },
    fin: { id: 'f1', email: 'fin@xoco.com', password: 'ok', role: Role.FINANZAS, isActive: true },
    vend: { id: 'v1', email: 'tienda@xoco.com', password: 'ok', role: Role.VENDEDOR, isActive: true },
  };
  const all = Object.values(users);
  const usersService = {
    findByEmail: vi.fn(async (email: string) => all.find((user) => user.email === email) ?? null),
    findById: vi.fn(async (id: string) => all.find((user) => user.id === id) ?? null),
    validatePassword: vi.fn(async (plain: string, hash: string) => plain === hash),
  } as unknown as UsersService;

  const service = new OAuthService(repository, usersService, new JwtService({}));
  return { service, users };
}

async function authorize(service: OAuthService, email: string) {
  const client = await service.registerClient({ client_name: 'Claude', redirect_uris: [REDIRECT] });
  const verifier = 'v'.repeat(50);
  const params = {
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  };
  await service.validateAuthorize(params);
  const user = await service.authenticate(email, 'ok');
  const code = await service.issueCode(user, params);
  return { client, verifier, code };
}

describe('OAuthService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('flujo completo: registro, login de Finanzas, código con PKCE, token y uso en /mcp', async () => {
    const { client, verifier, code } = await authorize(ctx.service, 'fin@xoco.com');
    const tokens = await ctx.service.token({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT });
    expect(tokens.token_type).toBe('Bearer');
    const user = await ctx.service.verifyAccessToken(tokens.access_token);
    expect(user.email).toBe('fin@xoco.com');
  });

  it('solo Super admin y Finanzas pueden conectar; contraseña mala no entra', async () => {
    await expect(ctx.service.authenticate('tienda@xoco.com', 'ok')).rejects.toThrow('Super admin y Finanzas');
    await expect(ctx.service.authenticate('admin@xoco.com', 'mala')).rejects.toThrow('incorrectos');
  });

  it('el código sirve una sola vez y exige el PKCE correcto', async () => {
    const { client, verifier, code } = await authorize(ctx.service, 'admin@xoco.com');
    const base = { grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: REDIRECT };
    await expect(ctx.service.token({ ...base, code_verifier: 'x'.repeat(50) })).rejects.toThrow('PKCE');
    await ctx.service.token({ ...base, code_verifier: verifier });
    await expect(ctx.service.token({ ...base, code_verifier: verifier })).rejects.toThrow();
  });

  it('refresh token rota: el viejo deja de servir', async () => {
    const { client, verifier, code } = await authorize(ctx.service, 'admin@xoco.com');
    const first = await ctx.service.token({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT });
    const second = await ctx.service.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: client.client_id });
    expect(second.refresh_token).not.toBe(first.refresh_token);
    await expect(ctx.service.token({ grant_type: 'refresh_token', refresh_token: first.refresh_token })).rejects.toThrow();
  });

  it('si al usuario lo desactivan, su token deja de servir', async () => {
    const { client, verifier, code } = await authorize(ctx.service, 'admin@xoco.com');
    const tokens = await ctx.service.token({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT });
    ctx.users.admin.isActive = false;
    await expect(ctx.service.verifyAccessToken(tokens.access_token)).rejects.toThrow('ya no tiene acceso');
  });

  it('el token del conector no es un token del panel (otra clave)', async () => {
    const { client, verifier, code } = await authorize(ctx.service, 'admin@xoco.com');
    const tokens = await ctx.service.token({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT });
    expect(() => new JwtService({}).verify(tokens.access_token, { secret: 'test-secret' })).toThrow();
  });

  it('rechaza redirect_uri no registrada y registro con http externo', async () => {
    await expect(ctx.service.registerClient({ redirect_uris: ['http://evil.com/cb'] })).rejects.toThrow('no permitida');
    const client = await ctx.service.registerClient({ redirect_uris: [REDIRECT] });
    await expect(
      ctx.service.validateAuthorize({ response_type: 'code', client_id: client.client_id, redirect_uri: 'https://otro.com/cb', code_challenge: 'x', code_challenge_method: 'S256' }),
    ).rejects.toThrow('redirect_uri');
  });
});
