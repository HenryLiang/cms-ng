# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**01创作大脑 (CMS-NG)** — AI-driven content creation system for Hong Kong 01 media. A monorepo containing:
- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind CSS v4
- **Backend**: NestJS 11 + Prisma ORM + MySQL 8 + Redis
- **Shared**: `@cms-ng/shared` package for types and constants shared across frontend/backend

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
| AI Model | Kimi (Moonshot AI) via REST API |
| Monorepo | npm workspaces + Turbo |
| Auth | JWT (NestJS @nestjs/jwt) |

### Database

- **Provider**: MySQL 8 (existing container `mysql8` on host)
- **Connection**: `mysql://root:root123@localhost:3306/cms_ng`
- **ORM**: Prisma with `@prisma/client`
- **Schema**: `backend/prisma/schema.prisma`

Key models: `User`, `Story`, `Article`, `ArticleVersion`, `AIOperation`.

### AI Layer

All AI interactions go through an abstraction layer in `backend/src/ai/`:
- `AIModelProvider` interface for swappable LLM backends
- Current implementation: Kimi API (`moonshot-v1-8k`)
- Operations logged to `AIOperation` table for audit

### Key Backend Conventions

- NestJS modules mirror domain entities: `auth`, `users`, `stories`, `articles`, `ai`
- Controllers handle HTTP; Services contain business logic
- PrismaService is injected as a singleton database client
- Use `@cms-ng/shared` for enums and interfaces shared with frontend

### Key Frontend Conventions

- App Router file-based routing (`app/(dashboard)/page.tsx`)
- Server Components by default; Client Components only when needed (`'use client'`)
- API calls centralized in `src/lib/api.ts`
- Zustand stores in `src/stores/`

## Environment Setup

### Required Environment Variables

**Backend** (`backend/.env` — copy from `.env.example`):
```
DATABASE_URL="mysql://root:root123@localhost:3306/cms_ng"
REDIS_URL="redis://localhost:6379"
KIMI_API_KEY="your-kimi-api-key"
KIMI_API_BASE="https://api.moonshot.cn/v1"
KIMI_MODEL="moonshot-v1-8k"
PORT=3001
JWT_SECRET="change-me"
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
