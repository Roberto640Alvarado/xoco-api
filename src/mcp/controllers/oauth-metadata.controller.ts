import { Controller, Get, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { MCP_SCOPE } from '../services/oauth.service.js';
import { publicBaseUrl } from '../utils/public-url.util.js';

// Metadatos OAuth que Claude.ai y ChatGPT leen al agregar el conector
// (RFC 9728 y RFC 8414). Públicos: no revelan nada sensible.
@ApiExcludeController()
@Public()
@Controller('.well-known')
export class OAuthMetadataController {
  @Get(['oauth-protected-resource', 'oauth-protected-resource/mcp'])
  protectedResource(@Req() req: Request) {
    const base = publicBaseUrl(req);
    return {
      resource: `${base}/mcp`,
      authorization_servers: [base],
      bearer_methods_supported: ['header'],
      scopes_supported: [MCP_SCOPE],
      resource_name: 'Xocolatísimo',
    };
  }

  @Get(['oauth-authorization-server', 'oauth-authorization-server/mcp', 'openid-configuration'])
  authorizationServer(@Req() req: Request) {
    const base = publicBaseUrl(req);
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [MCP_SCOPE],
    };
  }
}
