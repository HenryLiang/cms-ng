# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**01创作大脑 (CMS-NG)** — AI-driven content creation system for Hong Kong 01 media's newsroom. A monorepo covering story discovery, article writing with AI collaboration, editorial review, and multi-platform distribution.

- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + TipTap rich text editor
- **Backend**: NestJS 11 + Prisma ORM + MySQL 8 + Redis
- **Shared**: `@cms-ng/shared` package (`packages/shared/`) for enums and interfaces used by both frontend and backend
- **i18n**: Content-level language support via `ContentLanguage` enum: `SIMPLIFIED_CHINESE`, `TRADITIONAL_CHINESE_HK`, `TRADITIONAL_CHINESE_CANTONESE`, `ENGLISH`

## Development Commands

All root-level commands use Turbo (orchestrates workspaces: `frontend/`, `backend/`, `packages/*`):

```bash
npm run dev          # Start all services (frontend :3000 + backend :3001)
npm run build        # Build all packages (respects Turbo dependency order)
npm run lint         # Lint all packages
npm run test         # Run all tests
npm run db:seed      # Seed DB — runs backend/prisma/seed.ts (file may not exist; check first)
```

Turbo task config (`turbo.json`): `build` and `test` have `dependsOn: ["^build"]` — the shared package is built before backend/frontend tests run.

### Frontend (`frontend/`)

```bash
cd frontend && npm run dev          # Next.js dev server (port 3000)
cd frontend && npm run build        # Production build
cd frontend && npm run test         # Vitest + jsdom
cd frontend && npm run test:watch   # Watch mode
cd frontend && npx vitest run src/lib/article-api.test.ts   # Single file
```

**Test conventions**: Files are `*.test.ts` / `*.test.tsx`. Path alias `@/` resolves to `src/` (configured in `vitest.config.ts` and `tsconfig.json`). Test setup in `src/test/setup.ts` mocks `localStorage`; uses `@testing-library/jest-dom/vitest` matchers.

### Backend (`backend/`)

```bash
cd backend && npm run start:dev     # NestJS dev server with hot reload (port 3001)
cd backend && npm run build         # Production build
cd backend && npm run test          # Jest (unit tests)
cd backend && npm run test:watch    # Watch mode
cd backend && npx jest src/auth/auth.service.spec.ts   # Single file
cd backend && npm run test:e2e      # E2E tests (config: test/jest-e2e.json)
```

**Test conventions**: Unit test files are `*.spec.ts` (not `.test.ts`). Root dir is `src/`. E2E tests live in `backend/test/` and use `*.e2e-spec.ts`. `test-helpers.ts` in `src/common/` provides `createMock<T>()`, `UUID_REGEX`, and a fixed `now` timestamp fixture.

### Database (Prisma)

```bash
cd backend && npx prisma generate                         # Regenerate client after schema changes
cd backend && npx prisma migrate dev --name <name>        # Create + apply migration
cd backend && npx prisma studio                           # Visual DB editor
cd backend && npx prisma migrate reset                    # WARNING: drops all data
```

## Architecture

### Monorepo Layout

```
cms-ng/
├── frontend/
│   └── src/
│       ├── app/           # Next.js App Router: /login, /register, /dashboard/*
│       ├── components/    # UI components (rich-text-editor, role-guard, AI panels)
│       ├── lib/           # API clients: api.ts (base Axios), article-api.ts, story-api.ts, etc.
│       ├── hooks/         # use-role-guard, use-protected-route
│       ├── store/         # Zustand: auth-store.ts (persisted to localStorage)
│       └── types/         # Frontend-specific types (auth.ts, etc.)
├── backend/
│   ├── src/
│   │   ├── auth/          # JWT auth (login, register, guards)
│   │   ├── users/         # User CRUD, role management
│   │   ├── stories/       # Story/topic lifecycle
│   │   ├── articles/      # Article CRUD, versioning, review workflow
│   │   ├── ai/            # AI service + tool registry (see AI Layer below)
│   │   ├── channels/      # Multi-platform publishing (platform adapters)
│   │   ├── trending-topics/ # Hot topic aggregation (Google Trends + RSS)
│   │   ├── common/        # Guards, interceptors, filters, test-helpers
│   │   └── prisma/        # PrismaService singleton
│   ├── prisma/
│   │   ├── schema.prisma  # Single source of truth for DB schema
│   │   └── migrations/
│   └── test/              # E2E tests (jest-e2e.json)
├── packages/shared/src/index.ts  # Shared enums: UserRole, ArticleStatus, Platform,
│                                 #   ContentLanguage, PublishStatus, AgentType
│                                 # Shared interfaces: User, Story, Article, PlatformPublish, etc.
├── docker-compose.yml            # Dev: MySQL :3307, Redis :6379, RSSHub :1200
├── docker-compose.prod.yml       # Prod: adds backend + frontend containers
└── scripts/update-cms-ng.sh      # One-command production deploy/update script
```

### AI Layer

`backend/src/ai/` has two distinct subsystems:

1. **LLM calls** (`ai.service.ts` + `providers/`): Provider-agnostic architecture — `AIService` is a facade that delegates to a `ChatCompletionProvider` (injected via `CHAT_PROVIDER` DI token). Available providers: `DeepSeekProvider` (default), `KimiProvider`, `OpenAIProvider` — all extend `OpenAICompatibleProvider`. Switch via `AI_PROVIDER` env var. Exposes operations: rewrite, expand, condense, polish, generate-headlines, generate-excerpt, chat, generate-draft, fact-check, research-kit, review-report, SEO optimize. All operations are logged to the `AIOperation` table.

2. **Tool registry** (`tools/`): `AIToolsService` is a plugin registry implementing `ToolExecutor` / `ToolDefinition` interfaces. Current tool: `TavilySearchTool`. To add a new tool, implement the `ToolExecutor` interface and register it in `AIToolsService`'s constructor. Tools are exposed to the LLM via function-calling when `SEARCH_PROVIDER=tavily`.

`SEEDREAM_API_KEY` enables image generation via the Seedream (Doubao) API, handled directly in `ai.service.ts`.

### Platform Publishing (Channels)

`backend/src/channels/platforms/` uses an adapter pattern: `platform.adapter.ts` defines the interface, `adapters/` contains per-platform implementations (Facebook, Instagram, X, etc.), and `platform-registry.ts` maps `Platform` enum values to adapter instances. Articles go through `PlatformPublish` records with per-platform adapted title/content/excerpt.

### Trending Topics

`trending-topics.service.ts` aggregates hot topics from two sources: Google Trends (`google-trends-api` package) and RSS feeds (`rss-parser` with `https-proxy-agent` for proxy support). RSSHub (in `docker-compose.yml` at `:1200`) provides a local RSS aggregator that the service can consume from.

**代理开关**: 海外 RSS 源（Google Trends、BBC、Guardian 等）的代理由 `RSS_PROXY_ENABLED` 环境变量控制。设为 `true` 时才会读取 `HTTP_PROXY` 走代理（开发环境大陆需要），设为 `false` 则直连（生产环境新加坡不需要）。本地 RSSHub 源始终不走代理。

### Key Backend Conventions

- Each domain module (auth, stories, articles, etc.) has: `<module>.module.ts`, `<module>.controller.ts`, `<module>.service.ts`, `dto/`, and `*.spec.ts` test files co-located.
- `PrismaService` extends `PrismaClient` and is provided globally via `PrismaModule`.
- Use `@cms-ng/shared` enums rather than redefining status/role values in either app.
- The shared package must be built (`cd packages/shared && npm run build`) before backend/frontend can import from it. Turbo's `^build` dependency handles this automatically during `npm run build` / `npm run test`.

### Key Frontend Conventions

- App Router routes: `app/login`, `app/register`, `app/dashboard/` (with nested `articles/`, `stories/`, `review/`, `profile/` segments, each with their own `page.tsx` + `layout.tsx`).
- Server Components by default; add `'use client'` only when needed (event handlers, hooks, browser APIs).
- All API calls go through `src/lib/api.ts` — an Axios instance that attaches the JWT from `localStorage` and redirects to `/login` on 401.
- Domain-specific API modules (`article-api.ts`, `story-api.ts`, `topic-api.ts`, `channel-api.ts`, `review-api.ts`) wrap the base `api` client.
- `auth-store.ts` uses Zustand with `persist` middleware (localStorage) + a `_hasHydrated` flag to avoid flash-of-login-state on page load.
- **Next.js 16 has breaking changes**: see `frontend/AGENTS.md`. Read `node_modules/next/dist/docs/` before writing Next.js-specific code.

## Environment Setup

### Backend (`backend/.env`)

```env
DATABASE_URL="mysql://root:root123@localhost:3306/cms_ng"   # or :3307 if using docker-compose MySQL
REDIS_URL="redis://localhost:6379"
PORT=3001
JWT_SECRET="change-me"
JWT_EXPIRES_IN="7d"
UPLOAD_DIR="./uploads"

# AI Provider: 'deepseek' (default) | 'kimi' | 'openai'
AI_PROVIDER="deepseek"
DEEPSEEK_API_KEY="..."
DEEPSEEK_API_BASE="https://api.deepseek.com"
DEEPSEEK_MODEL="deepseek-v4-pro"
# KIMI_API_KEY="..."          # when AI_PROVIDER=kimi
# KIMI_API_BASE="https://api.kimi.com/coding/v1"
# KIMI_MODEL="kimi-for-coding"
# OPENAI_API_KEY="..."        # when AI_PROVIDER=openai
# OPENAI_API_BASE="https://api.openai.com/v1"
# OPENAI_MODEL="gpt-4o"

# Tavily web search (used by AI tool registry and SEARCH_PROVIDER=tavily)
TAVILY_API_KEY="..."
TAVILY_SEARCH_DEPTH="advanced"
SEARCH_PROVIDER="tavily"   # 'tavily' (recommended, all providers) | 'kimi' (AI_PROVIDER=kimi only)

# Seedream image generation
SEEDREAM_API_KEY="..."
SEEDREAM_API_BASE="https://ark.cn-beijing.volces.com/api/v3"
SEEDREAM_MODEL="doubao-seedream-5-0-260128"

# RSS 代理开关: 'true' (大陆开发) | 'false' (海外生产环境)
RSS_PROXY_ENABLED="false"
HTTP_PROXY="http://127.0.0.1:7890"
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### Infrastructure

Two MySQL options — pick one:
- **Existing `mysql8` container** on port `3306`: connect with `DATABASE_URL=mysql://root:root123@localhost:3306/cms_ng`. Do not add MySQL to `docker-compose.yml`.
- **docker-compose MySQL** on port `3307`: `docker-compose up -d mysql` maps host `3307 → container 3306`. Use `DATABASE_URL=mysql://root:root123@localhost:3307/cms_ng`.

Redis: `docker-compose up -d redis` (port `6379`).
RSSHub: `docker-compose up -d rsshub` (port `1200`) — optional, used by trending-topics for RSS ingestion.

## Important Notes

- **Node version**: v23.9.0. Some packages log engine warnings but function correctly.
- **Prisma Client**: Always run `npx prisma generate` after modifying `schema.prisma` before running backend code.
- **AI-generated content**: AI never auto-publishes. All AI output requires human editor review and approval before publication.
- **Article status workflow**: `DRAFT → WRITING → AI_OPTIMIZING → PENDING_REVIEW → IN_REVIEW → APPROVED → PUBLISHED` (can be sent back to `REVISION` from review states). Editors and admins can approve; reporters can only submit for review.
- **Production deploy**: `docker-compose.prod.yml` builds backend + frontend containers. `scripts/update-cms-ng.sh` is a one-command deploy script (backup → pull → build → migrate → restart).
