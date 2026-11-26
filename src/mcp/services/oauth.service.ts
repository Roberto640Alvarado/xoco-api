import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '../../generated/prisma/index.js';
import { UsersService } from '../../users/services/users.service.js';
import { OAuthRepository } from '../repositories/oauth.repository.js';
import { hmacBase64Url, isAllowedRedirectUri, randomToken, safeEqual, sha256Hex, verifyPkceS256 } from '../utils/oauth-crypto.util.js';

/** Quién puede usar el conector: Super admin y Finanzas. */
export const MCP_ALLOWED_ROLES: Role[] = [Role.SUPER_ADMIN, Role.FINANZAS];

const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_S = 60 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REDIRECT_URIS = 10;
export const MCP_AUDIENCE = 'xoco-mcp';

/** Métodos de autenticación en /oauth/token que acepta el servidor. */
export const TOKEN_ENDPOINT_AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'] as const;
type TokenEndpointAuthMethod = (typeof TOKEN_ENDPOINT_AUTH_METHODS)[number];

/** Error con la forma de OAuth 2.1 ({ error, error_description }). */
export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
  }
}

export interface AuthorizeParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export const MCP_SCOPE = 'xoco.read';

// Servidor de autorización OAuth 2.1 mínimo para el conector MCP:
// registro dinámico de clientes (Claude.ai / ChatGPT lo hacen solos),
// código de autorización con PKCE S256 obligatorio y refresh tokens.
// Clientes públicos (Claude, ChatGPT): sin secreto y el refresh token se
// rota en cada uso. Clientes confidenciales (Gemini, que vincula cuentas con
// client_secret): reciben un secreto derivado del client_id (HMAC, no se
// guarda) y su refresh token NO se rota — Google exige recibir el mismo. El access token es un JWT firmado con una clave
// DISTINTA a la del panel (no sirve para la API normal y viceversa).
@Injectable()
export class OAuthService {
  constructor(
    private readonly repository: OAuthRepository,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  private mcpSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET no está definido en las variables de entorno.');
    return `${secret}::mcp`;
  }

  /** Secreto del cliente confidencial: HMAC del client_id, se recalcula en vez de guardarse. */
  private clientSecretFor(clientId: string): string {
    return hmacBase64Url(`${this.mcpSecret()}::oauth-client`, clientId);
  }

  /**
   * Si la petición a /oauth/token trae client_secret, debe ser el correcto
   * (devuelve true: cliente confidencial autenticado). Sin secreto se trata
   * como cliente público (el PKCE sigue siendo obligatorio).
   */
  private authenticateClient(body: Record<string, unknown>): boolean {
    // Algunos clientes públicos mandan client_secret vacío: se trata como ausente.
    if (body.client_secret === undefined || body.client_secret === '') return false;
    const clientId = typeof body.client_id === 'string' ? body.client_id : '';
    const secret = typeof body.client_secret === 'string' ? body.client_secret : '';
    if (!clientId || !secret || !safeEqual(secret, this.clientSecretFor(clientId))) {
      throw new OAuthError('invalid_client', 'Credenciales del cliente inválidas.', 401);
    }
    return true;
  }

  // ---------------------------------------------------------------- registro

  async registerClient(body: Record<string, unknown>) {
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((uri): uri is string => typeof uri === 'string') : [];
    if (redirectUris.length === 0 || redirectUris.length > MAX_REDIRECT_URIS) {
      throw new OAuthError('invalid_redirect_uri', 'Hace falta al menos una redirect_uri.');
    }
    const invalid = redirectUris.find((uri) => !isAllowedRedirectUri(uri));
    if (invalid) throw new OAuthError('invalid_redirect_uri', `redirect_uri no permitida: ${invalid}`);

    const requested = body.token_endpoint_auth_method;
    const authMethod: TokenEndpointAuthMethod =
      requested === 'client_secret_post' || requested === 'client_secret_basic' ? requested : 'none';

    const clientName = typeof body.client_name === 'string' ? body.client_name.slice(0, 100) : null;
    const client = await this.repository.createClient({ clientId: randomToken(18), clientName, redirectUris });
    const secret = authMethod === 'none' ? {} : { client_secret: this.clientSecretFor(client.clientId), client_secret_expires_at: 0 };
    return {
      client_id: client.clientId,
      ...secret,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.clientName ?? undefined,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: authMethod,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: MCP_SCOPE,
    };
  }

  // -------------------------------------------------------------- autorizar

  /** Valida la solicitud de /oauth/authorize; devuelve el nombre del cliente para la página. */
  async validateAuthorize(params: AuthorizeParams): Promise<{ clientName: string }> {
    if (!params.client_id) throw new OAuthError('invalid_request', 'Falta client_id.');
    const client = await this.repository.findClient(params.client_id);
    if (!client) throw new OAuthError('invalid_client', 'Este conector no está registrado. Vuelve a agregarlo desde Claude o ChatGPT.');
    if (!params.redirect_uri || !client.redirectUris.includes(params.redirect_uri)) {
      throw new OAuthError('invalid_request', 'La dirección de regreso (redirect_uri) no coincide con la registrada.');
    }
    if (params.response_type !== 'code') throw new OAuthError('unsupported_response_type', 'Solo se admite response_type=code.');
    if (!params.code_challenge || params.code_challenge_method !== 'S256') {
      throw new OAuthError('invalid_request', 'Hace falta PKCE con code_challenge_method=S256.');
    }
    return { clientName: client.clientName || 'Asistente de IA' };
  }

  /** Correo y contraseña del panel; solo Super admin o Finanzas activos. */
  async authenticate(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email ?? '');
    const valid = user && (await this.usersService.validatePassword(password ?? '', user.password));
    if (!user || !valid) throw new OAuthError('access_denied', 'Correo o contraseña incorrectos.', 401);
    if (!user.isActive) throw new OAuthError('access_denied', 'Tu cuenta está desactivada.', 403);
    if (!MCP_ALLOWED_ROLES.includes(user.role)) {
      throw new OAuthError('access_denied', 'Solo los usuarios Super admin y Finanzas pueden conectar este acceso.', 403);
    }
    return user;
  }

  async issueCode(user: User, params: AuthorizeParams): Promise<string> {
    const code = randomToken();
    await this.repository.createCode({
      codeHash: sha256Hex(code),
      clientId: params.client_id as string,
      userId: user.id,
      redirectUri: params.redirect_uri as string,
      codeChallenge: params.code_challenge as string,
      resource: params.resource ?? null,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    return code;
  }

  // ------------------------------------------------------------------ token

  async token(body: Record<string, unknown>): Promise<TokenResponse> {
    const grantType = body.grant_type;
    const confidential = this.authenticateClient(body);
    if (grantType === 'authorization_code') return this.exchangeCode(body);
    if (grantType === 'refresh_token') return this.refresh(body, confidential);
    throw new OAuthError('unsupported_grant_type', 'grant_type no soportado.');
  }

  private async exchangeCode(body: Record<string, unknown>): Promise<TokenResponse> {
    const code = typeof body.code === 'string' ? body.code : '';
    const stored = code ? await this.repository.findCode(sha256Hex(code)) : null;
    if (!stored || stored.usedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new OAuthError('invalid_grant', 'El código no es válido o ya venció.');
    }
    if (body.client_id !== undefined && body.client_id !== stored.clientId) {
      throw new OAuthError('invalid_grant', 'El código es de otro cliente.');
    }
    if (body.redirect_uri !== undefined && body.redirect_uri !== stored.redirectUri) {
      throw new OAuthError('invalid_grant', 'La redirect_uri no coincide.');
    }
    if (!verifyPkceS256(typeof body.code_verifier === 'string' ? body.code_verifier : '', stored.codeChallenge)) {
      throw new OAuthError('invalid_grant', 'PKCE inválido.');
    }
    if (!(await this.repository.consumeCode(stored.id))) throw new OAuthError('invalid_grant', 'El código ya se usó.');

    const user = await this.loadAllowedUser(stored.userId);
    return this.issueTokens(user, stored.clientId);
  }

  private async refresh(body: Record<string, unknown>, confidential: boolean): Promise<TokenResponse> {
    const token = typeof body.refresh_token === 'string' ? body.refresh_token : '';
    const stored = token ? await this.repository.findRefreshToken(sha256Hex(token)) : null;
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new OAuthError('invalid_grant', 'La sesión venció. Vuelve a conectar.');
    }
    if (body.client_id !== undefined && body.client_id !== stored.clientId) {
      throw new OAuthError('invalid_grant', 'El token es de otro cliente.');
    }

    // Confidencial (autenticado con su secreto, y el token es suyo): se
    // devuelve el MISMO refresh token con la vigencia extendida.
    if (confidential && body.client_id === stored.clientId) {
      if (!(await this.repository.extendRefreshToken(stored.id, new Date(Date.now() + REFRESH_TOKEN_TTL_MS)))) {
        throw new OAuthError('invalid_grant', 'La sesión venció. Vuelve a conectar.');
      }
      const user = await this.loadAllowedUser(stored.userId);
      return this.issueTokens(user, stored.clientId, token);
    }

    if (!(await this.repository.revokeRefreshToken(stored.id))) throw new OAuthError('invalid_grant', 'El token ya se usó.');

    const user = await this.loadAllowedUser(stored.userId);
    return this.issueTokens(user, stored.clientId);
  }

  /** Emite access token; crea un refresh token nuevo salvo que se pase uno existente (no rotado). */
  private async issueTokens(user: User, clientId: string, existingRefreshToken?: string): Promise<TokenResponse> {
    const refreshToken = existingRefreshToken ?? randomToken();
    if (!existingRefreshToken) {
      await this.repository.createRefreshToken({
        tokenHash: sha256Hex(refreshToken),
        clientId,
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      });
    }
    const accessToken = await this.jwtService.signAsync(
      { email: user.email, role: user.role, client_id: clientId, scope: MCP_SCOPE },
      { secret: this.mcpSecret(), audience: MCP_AUDIENCE, subject: user.id, expiresIn: ACCESS_TOKEN_TTL_S },
    );
    return { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_S, refresh_token: refreshToken, scope: MCP_SCOPE };
  }

  // Revalida al usuario en cada uso: si lo desactivan o le cambian el rol,
  // el conector deja de funcionar de inmediato.
  private async loadAllowedUser(userId: string): Promise<User> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive || !MCP_ALLOWED_ROLES.includes(user.role)) {
      throw new OAuthError('invalid_grant', 'Tu usuario ya no tiene acceso a este conector.');
    }
    return user;
  }

  // ------------------------------------------------------------- uso del MCP

  /** Valida el Bearer de una llamada a /mcp y devuelve al usuario (vigente y con rol permitido). */
  async verifyAccessToken(token: string): Promise<User> {
    let payload: { sub?: string };
    try {
      payload = await this.jwtService.verifyAsync(token, { secret: this.mcpSecret(), audience: MCP_AUDIENCE });
    } catch {
      throw new OAuthError('invalid_token', 'Token inválido o vencido.', 401);
    }
    if (!payload.sub) throw new OAuthError('invalid_token', 'Token inválido.', 401);
    try {
      return await this.loadAllowedUser(payload.sub);
    } catch {
      throw new OAuthError('invalid_token', 'Tu usuario ya no tiene acceso a este conector.', 401);
    }
  }

  /** Token corto del PANEL para que las herramientas consulten la API con los permisos de la persona. */
  panelToken(user: User): Promise<string> {
    const secret = process.env.JWT_SECRET as string;
    return this.jwtService.signAsync({ sub: user.id, email: user.email, role: user.role }, { secret, expiresIn: 300 });
  }
}
