import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { OdooModule } from '../odoo/odoo.module.js';
import { OAuthMetadataController } from './controllers/oauth-metadata.controller.js';
import { OAuthController } from './controllers/oauth.controller.js';
import { McpController } from './controllers/mcp.controller.js';
import { BrandIconController } from './controllers/brand-icon.controller.js';
import { OAuthService } from './services/oauth.service.js';
import { McpToolsService } from './services/mcp-tools.service.js';
import { XocoApiCatalogService } from './services/xoco-api-catalog.service.js';
import { OAuthRepository } from './repositories/oauth.repository.js';

// Conector MCP de solo lectura para Claude.ai y ChatGPT (Admin y Finanzas):
// OAuth 2.1 propio + endpoint /mcp. Las firmas de tokens pasan su clave en
// cada llamada (OAuthService), por eso JwtModule va sin configuración.
@Module({
  imports: [UsersModule, OdooModule, JwtModule.register({})],
  controllers: [OAuthMetadataController, OAuthController, McpController, BrandIconController],
  providers: [OAuthService, OAuthRepository, McpToolsService, XocoApiCatalogService],
  exports: [XocoApiCatalogService],
})
export class McpModule {}
