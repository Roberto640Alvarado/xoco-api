import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { XocoApiCatalogService } from './mcp/services/xoco-api-catalog.service.js';

// La app (xoco-app) llama a esta API desde el navegador (axios
// client-side) — al vivir en otro puerto es otro origin, así que sin CORS
// el navegador bloquea la respuesta aunque el request "funcione" (por eso
// nunca se vio como error al probar con curl, que no aplica CORS). No se
// usan cookies para esto (solo header Authorization), así que no hace
// falta `credentials: true`.
const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:3010'];

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Detrás del proxy de hosting: respeta X-Forwarded-Proto/Host (URLs https
  // correctas en los metadatos OAuth del conector MCP).
  app.set('trust proxy', true);

  const configuredOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({ origin: configuredOrigins?.length ? configuredOrigins : DEFAULT_ORIGINS });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  // El conector MCP lista y valida los GET de la API a partir del documento
  // OpenAPI (los decoradores de Swagger de cada controller).
  const openApi = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Xocolatísimo API').build());
  app.get(XocoApiCatalogService).setDocument(openApi);

  await app.listen(process.env.PORT ?? 4005);
}
await bootstrap();
