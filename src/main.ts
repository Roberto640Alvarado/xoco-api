import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

// La app (xoco-app) llama a esta API desde el navegador (axios
// client-side) — al vivir en otro puerto es otro origin, así que sin CORS
// el navegador bloquea la respuesta aunque el request "funcione" (por eso
// nunca se vio como error al probar con curl, que no aplica CORS). No se
// usan cookies para esto (solo header Authorization), así que no hace
// falta `credentials: true`.
const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:3010'];

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
  await app.listen(process.env.PORT ?? 4005);
}
await bootstrap();
