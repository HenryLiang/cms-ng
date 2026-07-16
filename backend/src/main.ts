import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildCorsOptions } from './common/cors.config';
import type { IncomingMessage, Server, ServerResponse } from 'http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter());
  // CORS: whitelist from CORS_ORIGINS env var. In dev, http://localhost:3000
  // is always allowed. In production, no whitelist = deny all cross-origin.
  app.enableCors(buildCorsOptions());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // 启用 shutdown hooks：让 OnModuleDestroy 在 SIGTERM/SIGINT 时真正触发。
  // 此前是 dead code -- RedisService.onModuleDestroy 与 Playwright 浏览器清理
  // 都依赖它；cms-ng-service.sh 用 SIGTERM 停服，不启用会孤儿子进程。
  app.enableShutdownHooks();

  // OpenAPI / Swagger UI — only in non-production. The dev/QA E2E
  // fixtures use it to discover endpoint contracts; production hides it
  // by not mounting the route at all.
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CMS-NG API')
      .setDescription(
        '01创作大脑 (CMS-NG) REST API. Generated from NestJS controllers and DTOs via @nestjs/swagger.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description:
            'Paste a JWT obtained from /auth/login (no "Bearer " prefix needed)',
          in: 'header',
        },
        'bearer',
      )
      .addTag('auth', 'Login, registration, token refresh')
      .addTag('users', 'User CRUD and role management')
      .addTag('stories', 'Story lifecycle (reporter → editor → published)')
      .addTag('articles', 'Article CRUD, workflow, and AI operations')
      .addTag('channels', 'Multi-platform publishing adapters')
      .addTag('auto-publish', 'Scheduled publishing tasks and runs')
      .addTag(
        'trending-topics',
        'Trending topic aggregation (Google Trends, RSS)',
      )
      .addTag('ai', 'AI writing operations (draft, research kit, fact-check)')
      .addTag('billing', 'Top-ups, balance, transactions, billing config')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: 'CMS-NG API Docs',
    });
  }

  // PORT has been validated + coerced to a number by env.validation.ts
  const port = config.get<number>('PORT') ?? 3001;
  const server = await app.listen(port);
  // Increase server timeout for long-running AI operations (image generation can take 2-3 minutes)
  server.timeout = 180_000; // 3 minutes
  server.keepAliveTimeout = 190_000; // Slightly longer than timeout to prevent race conditions
}
bootstrap();
