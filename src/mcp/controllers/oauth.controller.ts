import { Body, Controller, Get, Logger, Post, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { AuthorizeParams, OAuthError, OAuthService } from '../services/oauth.service.js';
import { renderErrorPage, renderLoginPage } from '../utils/login-page.util.js';

const AUTHORIZE_PARAMS: (keyof AuthorizeParams)[] = [
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
  'state',
  'scope',
  'resource',
];

function pickAuthorizeParams(source: Record<string, unknown>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of AUTHORIZE_PARAMS) {
    if (typeof source[key] === 'string') params[key] = source[key];
  }
  return params;
}

function sendOAuthError(res: Response, error: unknown) {
  if (error instanceof OAuthError) {
    res.status(error.status).json({ error: error.error, error_description: error.description });
    return;
  }
  throw error;
}

// Endpoints OAuth del conector MCP: registro dinámico, página de inicio de
// sesión (correo y contraseña del panel) y canje de código / refresh por
// tokens. Fuera de Swagger y con respuesta cruda (formato OAuth, no el
// sobre { status, data } del panel).
@ApiExcludeController()
@Public()
@Controller('oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(private readonly oauthService: OAuthService) {}

  @Post('register')
  async register(@Body() body: Record<string, unknown>, @Res() res: Response) {
    try {
      res.status(201).json(await this.oauthService.registerClient(body ?? {}));
    } catch (error) {
      sendOAuthError(res, error);
    }
  }

  @Get('authorize')
  async authorizeForm(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const params = pickAuthorizeParams(query);
    try {
      const { clientName } = await this.oauthService.validateAuthorize(params);
      res.status(200).type('html').send(renderLoginPage({ clientName, params }));
    } catch (error) {
      if (error instanceof OAuthError) {
        res.status(400).type('html').send(renderErrorPage(error.description));
        return;
      }
      throw error;
    }
  }

  @Post('authorize')
  async authorize(@Body() body: Record<string, unknown>, @Res() res: Response) {
    const params = pickAuthorizeParams(body ?? {});
    let clientName: string;
    try {
      ({ clientName } = await this.oauthService.validateAuthorize(params));
    } catch (error) {
      if (error instanceof OAuthError) {
        res.status(400).type('html').send(renderErrorPage(error.description));
        return;
      }
      throw error;
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    try {
      const user = await this.oauthService.authenticate(email, typeof body.password === 'string' ? body.password : '');
      const code = await this.oauthService.issueCode(user, params);
      const redirect = new URL(params.redirect_uri);
      redirect.searchParams.set('code', code);
      if (params.state) redirect.searchParams.set('state', params.state);
      this.logger.log(`Conector MCP autorizado para ${user.email} (${clientName}).`);
      res.redirect(302, redirect.toString());
    } catch (error) {
      if (error instanceof OAuthError) {
        res.status(error.status).type('html').send(renderLoginPage({ clientName, params, email, error: error.description }));
        return;
      }
      throw error;
    }
  }

  @Post('token')
  async token(@Body() body: Record<string, unknown>, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.status(200).json(await this.oauthService.token(body ?? {}));
    } catch (error) {
      sendOAuthError(res, error);
    }
  }
}
