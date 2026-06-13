import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { buildCorsOptions } from './common/cors.config';
import type { IncomingMessage, Server, ServerResponse } from 'http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter());
  // CORS: whitelist from CORS_ORIGINS env var. In dev, http://localhost:3000
  // is always allowed. In production, no whitelist = deny all cross-origin.
  app.enableCors(buildCorsOptions());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // PORT has been validated + coerced to a number by env.validation.ts
  const port = app.get(ConfigService).get<number>('PORT') ?? 3001;
  const server = await app.listen(port);
  // Increase server timeout for long-running AI operations (image generation can take 2-3 minutes)
  server.timeout = 180_000; // 3 minutes
  server.keepAliveTimeout = 190_000; // Slightly longer than timeout to prevent race conditions
}
bootstrap();
