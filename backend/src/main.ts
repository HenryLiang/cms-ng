import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import type { IncomingMessage, Server, ServerResponse } from 'http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter());
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const server = await app.listen(process.env.PORT ?? 3001);
  // Increase server timeout for long-running AI operations (image generation can take 2-3 minutes)
  server.timeout = 180_000; // 3 minutes
  server.keepAliveTimeout = 190_000; // Slightly longer than timeout to prevent race conditions
}
bootstrap();
