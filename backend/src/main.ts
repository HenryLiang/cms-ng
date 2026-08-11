import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { Express } from 'express';
import { AppModule } from './app.module';
import { buildCorsOptions } from './common/cors.config';
import type { Server } from 'http';

async function bootstrap() {
  // rawBody: true — the WeChat Pay notify callback verifies the signature
  // over the RAW request body; a re-serialized parsed body would never
  // match (issue #106 follow-up).
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    rawBody: true,
  });
  // Host production uses a loopback nginx; Docker production uses one
  // unexposed proxy hop. Without `trust proxy`, @nestjs/throttler sees every
  // request as the proxy IP and one client can exhaust the shared bucket.
  // validateEnv restricts this to `loopback`, `1`, or `2` so arbitrary
  // forwarding chains cannot be trusted by configuration accident.
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  const config = app.get(ConfigService);
  const trustProxy = config.get<string>('TRUST_PROXY') ?? 'loopback';
  expressApp.set(
    'trust proxy',
    trustProxy === 'loopback' ? 'loopback' : Number(trustProxy),
  );
  const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
  // Security headers (issue #107). CSP is disabled outside production because
  // Swagger UI (dev-only) needs inline scripts/styles; the API itself serves
  // JSON only, so default CSP in production is safe.
  app.use(helmet({ contentSecurityPolicy: nodeEnv === 'production' }));
  // CORS: whitelist from CORS_ORIGINS env var. In dev, http://localhost:3000
  // is always allowed. In production, no whitelist = deny all cross-origin.
  app.enableCors(buildCorsOptions());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // 启用 shutdown hooks：让 OnModuleDestroy 在 SIGTERM/SIGINT 时真正触发。
  // Playwright 浏览器清理依赖它；cms-ng-service.sh 用 SIGTERM 停服，
  // 不启用会孤儿子进程。
  app.enableShutdownHooks();

  // OpenAPI / Swagger UI — only in non-production. The dev/QA E2E
  // fixtures use it to discover endpoint contracts; production hides it
  // by not mounting the route at all.
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
      .addTag('notifications', 'In-app task, billing, and system notifications')
      .addTag(
        'media',
        'Media asset library (image upload, AI-generated, management)',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: 'CMS-NG API Docs',
    });
  }

  // PORT has been validated + coerced to a number by env.validation.ts
  const port = config.get<number>('PORT') ?? 3001;
  await app.listen(port);
  // Increase server timeout for long-running AI operations (image generation can take 2-3 minutes)
  const server = app.getHttpServer() as Server;
  server.timeout = 180_000; // 3 minutes
  server.keepAliveTimeout = 190_000; // Slightly longer than timeout to prevent race conditions
}
void bootstrap();
