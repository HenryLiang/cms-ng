# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**01创作大脑 (CMS-NG)** — AI-driven content creation system for Hong Kong 01 media. A monorepo containing:
- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + TipTap rich text editor
- **Backend**: NestJS 11 + Prisma ORM + MySQL 8 + Redis
- **Shared**: `@cms-ng/shared` package for types and constants shared across frontend/backend
- **i18n**: Content-level language support (`SIMPLIFIED_CHINESE`, `TRADITIONAL_CHINESE_HK`, `TRADITIONAL_CHINESE_CANTONESE`, `ENGLISH`) via `ContentLanguage` enum

## Development Commands

All commands run from repo root using npm workspaces / Turbo:

```bash
# Start all services in dev mode
npm run dev

# Build everything
npm run build

# Lint all packages
npm run lint

# Run all tests
npm run test

# Database seed (optional test data)
npm run db:seed
```

### Frontend (`frontend/`)

```bash
# Dev server (Next.js, port 3000)
cd frontend && npm run dev

# Production build
cd frontend && npm run build

# Start production server
cd frontend && npm run start

# Lint
cd frontend && npm run lint

# Run tests (Vitest + jsdom)
cd frontend && npm run test

# Run tests in watch mode
cd frontend && npm run test:watch

# Run single test file
cd frontend && npx vitest run src/lib/article-api.test.ts
```

### Backend (`backend/`)

```bash
# Dev server with hot reload (port 3001)
cd backend && npm run start:dev

# Production build
cd backend && npm run build

# Production start
cd backend && npm run start:prod

# Lint
cd backend && npm run lint

# Run tests
cd backend && npm run test

# Run single test file
cd backend && npx jest src/auth/auth.service.spec.ts

# Run tests in watch mode
cd backend && npm run test:watch

# E2E tests
cd backend && npm run test:e2e
```

### Database (Prisma)

```bash
# Generate Prisma Client after schema changes
cd backend && npx prisma generate

# Create and apply a migration
cd backend && npx prisma migrate dev --name <migration_name>

# Open Prisma Studio (visual DB editor)
cd backend && npx prisma studio

# Reset database (WARNING: drops all data)
cd backend && npx prisma migrate reset
```

## Architecture

### Monorepo Structure

```
cms-ng/
├── frontend/           # Next.js App Router app
│   ├── src/app/        # Route segments (page.tsx, layout.tsx)
│   ├── src/components/ # React components
│   ├── src/lib/        # Utilities, API clients
│   ├── src/hooks/      # Custom React hooks
│   └── src/types/      # Frontend-specific types
├── backend/            # NestJS REST API
│   ├── src/
│   │   ├── modules/    # Feature modules (auth, articles, stories, ai)
│   │   ├── common/     # Guards, interceptors, filters, pipes
│   │   ├── prisma/     # Prisma service module
│   │   └── ai/         # AI model abstraction layer
│   └── prisma/
│       ├── schema.prisma   # Database schema
│       └── migrations/     # Migration files
├── packages/
│   └── shared/         # Shared types, enums, interfaces
└── docker-compose.yml  # Redis container (MySQL uses existing host container)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS v4, TypeScript |
| State Management | Zustand |
| Data Fetching | TanStack Query (React Query), Axios |
| Backend | NestJS 11, Express, TypeScript |
| ORM | Prisma (MySQL 8) |
| Cache / Queue | Redis (ioredis) |
| AI Model | Kimi (Moonshot AI) via REST API; Tavily search; Seedream image generation |
| Monorepo | npm workspaces + Turbo |
| Auth | JWT (NestJS @nestjs/jwt) |

### Database

- **Provider**: MySQL 8
- **Host container** (reused): `mysql://root:root123@localhost:3306/cms_ng` — connect to existing `mysql8` container
- **Docker Compose** (alternative): `mysql://root:root123@localhost:3307/cms_ng` — docker-compose maps host `3307` to container `3306`
- **ORM**: Prisma with `@prisma/client`
- **Schema**: `backend/prisma/schema.prisma`

Key models: `User`, `Story`, `Article`, `ArticleVersion`, `AIOperation`, `PlatformPublish`.

### AI Layer

All AI interactions go through an abstraction layer in `backend/src/ai/`:
- `AIModelProvider` interface for swappable LLM backends
- Current implementations: Kimi (`kimi-for-coding`), Tavily search, Seedream image generation
- Operations logged to `AIOperation` table for audit

### Key Backend Conventions

- NestJS modules mirror domain entities: `auth`, `users`, `stories`, `articles`, `ai`, `channels` (platform publishing), `trending-topics`
- Controllers handle HTTP; Services contain business logic
- PrismaService is injected as a singleton database client
- Use `@cms-ng/shared` for enums and interfaces shared with frontend
- `backend/src/common/test-helpers.ts` provides `createMock<T>()`, `UUID_REGEX`, and `now` fixture for tests

### Key Frontend Conventions

- App Router file-based routing: `app/login`, `app/register`, `app/dashboard` (with nested `/articles`, `/stories`, `/review`, `/profile`)
- Server Components by default; Client Components only when needed (`'use client'`)
- API calls centralized in `src/lib/api.ts` (Axios instance with JWT interceptor and 401 redirect)
- Zustand store in `src/store/auth-store.ts` (auth state + user hydration)
- Rich text editing via TipTap (`@tiptap/*` packages)
- Tests use Vitest + jsdom + `@testing-library/jest-dom`; setup in `src/test/setup.ts`

## Environment Setup

### Required Environment Variables

**Backend** (`backend/.env` — copy from `.env.example`):
```
DATABASE_URL="mysql://root:root123@localhost:3306/cms_ng"
REDIS_URL="redis://localhost:6379"
KIMI_API_KEY="your-kimi-api-key"
KIMI_API_BASE="https://api.kimi.com/coding/v1"
KIMI_MODEL="kimi-for-coding"
PORT=3001
JWT_SECRET="change-me"
JWT_EXPIRES_IN="7d"

# Optional: Tavily web search
TAVILY_API_KEY="your-tavily-api-key"
TAVILY_SEARCH_DEPTH="advanced"
SEARCH_PROVIDER="kimi"   # 'kimi' | 'tavily'

# Optional: Seedream image generation
SEEDREAM_API_KEY="your-seedream-api-key"
SEEDREAM_API_BASE="https://ark.cn-beijing.volces.com/api/v3"
SEEDREAM_MODEL="doubao-seedream-5-0-260128"

# File uploads
UPLOAD_DIR="./uploads"
```

**Frontend** (`frontend/.env.local` — copy from `.env.example`):
```
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### Infrastructure

- **MySQL**: Existing container `mysql8` (port 3306, user `root`, password `root123`)
- **Redis**: Started via `docker-compose up -d redis` (port 6379)
- Do NOT add MySQL to docker-compose.yml; reuse the existing container.

## Important Notes

- **Node version**: Current environment uses Node v23.9.0. Some packages may log engine warnings but function correctly.
- **Prisma Client**: Regenerate (`npx prisma generate`) after any schema change before running backend code.
- **AI-generated content**: AI never auto-publishes. All AI output requires human editor review and approval.
- **Shared package**: `@cms-ng/shared` must be built (`cd packages/shared && npm run build`) or use TypeScript project references before imports resolve in other packages.
- **Next.js breaking changes**: See `frontend/AGENTS.md` — Next.js 16 APIs may differ from training data; read `node_modules/next/dist/docs/` before writing code.
