import { All, Controller, Logger, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { OAuthError, OAuthService } from '../services/oauth.service.js';
import { McpToolsService } from '../services/mcp-tools.service.js';
import { publicBaseUrl } from '../utils/public-url.util.js';

// Endpoint MCP (Streamable HTTP, sin estado) para Claude.ai y ChatGPT.
// @Public() porque NO usa el JWT del panel: valida su propio token OAuth
// (OAuthService.verifyAccessToken), que solo emite para Super admin
// activos. Sin token responde 401 con la dirección de los
// metadatos para que el cliente arranque el inicio de sesión.
@ApiExcludeController()
@Public()
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly oauthService: OAuthService,
    private readonly toolsService: McpToolsService,
  ) {}

  @All()
  async handle(@Req() req: Request, @Res() res: Response) {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const challenge = `Bearer resource_metadata="${publicBaseUrl(req)}/.well-known/oauth-protected-resource"`;

    let user;
    try {
      if (!token) throw new OAuthError('invalid_token', 'Falta el token de acceso.', 401);
      user = await this.oauthService.verifyAccessToken(token);
    } catch (error) {
      const description = error instanceof OAuthError ? error.description : 'No autorizado.';
      this.logger.warn(`MCP ${req.method} sin acceso: ${description}`);
      res
        .status(401)
        .setHeader('WWW-Authenticate', `${challenge}, error="invalid_token", error_description="${description.replace(/"/g, "'")}"`)
        .json({ error: 'invalid_token', error_description: description });
      return;
    }

    // Sin estado: no hay stream de notificaciones (GET) ni sesiones que cerrar (DELETE).
    if (req.method !== 'POST') {
      this.logger.log(`MCP ${req.method} -> 405 (servidor sin estado).`);
      res.status(405).setHeader('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Método no permitido.' }, id: null });
      return;
    }

    const server = this.toolsService.createServer(user, publicBaseUrl(req));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    const rpc = req.body as { method?: string } | undefined;
    this.logger.log(`MCP ${rpc?.method ?? 'POST'} de ${user.email}`);
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.logger.error('Error en el conector MCP', error instanceof Error ? error.stack : String(error));
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Error interno.' }, id: null });
      }
    }
  }
}
