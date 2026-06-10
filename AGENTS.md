# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

**01创作大脑 (CMS-NG)** — AI-driven content creation system for Hong Kong 01 media's newsroom. A monorepo covering story discovery, article writing with AI collaboration, editorial review, and multi-platform distribution.

- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + TipTap rich text editor + Lucide icons
- **Backend**: NestJS 11 + Prisma ORM + MySQL 8 + Redis (ioredis)
- **Auth**: JWT via Passport (`@nestjs/passport` + `passport-jwt`)
- **Shared**: `@cms-ng/shared` package (`packages/shared/`) for enums and interfaces used by both frontend and backend
- **i18n**: Content-level language support via `ContentLanguage` enum: `SIMPLIFIED_CHINESE`, `TRADITIONAL_CHINESE_HK`, `TRADITIONAL_CHINESE_CANTONESE`, `ENGLISH`

## Development Commands

All root-level commands use Turbo (orchestrates workspaces: `frontend/`, `backend/`, `packages/*`):

```bash
npm run dev          # Start all services (frontend :3000 + backend :3001)
npm run build        # Build all packages (respects Turbo dependency order)
npm run lint         # Lint all packages
npm run test         # Run all tests
npm run db:seed      # Wired in package.json (runs backend/prisma/seed.ts) but the seed file
                     # is NOT currently committed — the command will fail until it's added.
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
│       ├── components/    # UI components: rich-text-editor, role-guard, AI panels, channels/
│       ├── lib/           # API clients: api.ts (base Axios), article-api.ts, story-api.ts, etc.
│       ├── hooks/         # use-role-guard, use-protected-route
│       ├── store/         # Zustand: auth-store.ts (persisted to localStorage)
│       ├── test/          # Test setup (setup.ts with localStorage mock)
│       └── types/         # Frontend-specific types (auth.ts, etc.)
├── backend/
│   ├── src/
│   │   ├── auth/          # JWT auth (login, register, guards)
│   │   ├── users/         # User CRUD, role management
│   │   ├── stories/       # Story/topic lifecycle
│   │   ├── articles/      # Article CRUD, versioning, review workflow
│   │   ├── ai/            # AI service + tool registry (see AI Layer below)
│   │   ├── channels/      # Multi-platform publishing (platform adapters + WordPress service)
│   │   ├── auto-publish/  # Scheduled/triggered publishing pipeline (see Auto-Publishing below)
│   │   ├── trending-topics/ # Hot topic aggregation (Google Trends + RSS)
│   │   ├── redis/         # RedisService wrapper around ioredis (cache + transient state)
│   │   ├── common/        # Guards, interceptors, filters, test-helpers, json.utils
│   │   ├── types/         # Backend-specific type definitions
│   │   └── prisma/        # PrismaService singleton
│   ├── prisma/
│   │   ├── schema.prisma  # Single source of truth for DB schema
│   │   └── migrations/
│   └── test/              # E2E tests (jest-e2e.json)
├── packages/shared/src/index.ts  # Shared enums: UserRole, ArticleStatus, Platform,
│                                 #   ContentLanguage, PublishStatus, AgentType
│                                 # Shared interfaces: User, Story, Article, PlatformPublish, etc.
├── docker-compose.yml            # Dev: RSSHub :1200 only (MySQL/Redis are external)
├── docker-compose.prod.yml       # Prod: backend + frontend containers; backend reads env from backend/.env via env_file
└── scripts/update-cms-ng.sh      # One-command production deploy/update script
```

### AI Layer

`backend/src/ai/` has two distinct subsystems:

1. **LLM calls** (`ai.service.ts` + `providers/`): Provider-agnostic architecture — `AIService` is a facade that delegates to a `ChatCompletionProvider` (injected via `CHAT_PROVIDER` DI token). Available providers: `DeepSeekProvider` (default), `KimiProvider`, `OpenAIProvider` — all extend `OpenAICompatibleProvider`. Switch via `AI_PROVIDER` env var. Exposes operations: rewrite, expand, condense, polish, generate-headlines, generate-excerpt, chat, generate-draft, fact-check, research-kit, review-report, SEO optimize. All operations are logged to the `AIOperation` table.

2. **Tool registry** (`tools/`): `AIToolsService` is a plugin registry implementing `ToolExecutor` / `ToolDefinition` interfaces. Current tool: `TavilySearchTool`. To add a new tool, implement the `ToolExecutor` interface and register it in `AIToolsService`'s constructor. Tools are exposed to the LLM via function-calling when `SEARCH_PROVIDER=tavily`.

`SEEDREAM_API_KEY` enables image generation via the Seedream (Doubao) API, handled directly in `ai.service.ts`.

### Platform Publishing (Channels)

`backend/src/channels/` has two layers:

1. **Platform adapters** (`platforms/`): Adapter pattern — `platform.adapter.ts` defines the interface and `platform-registry.ts` maps `Platform` enum values to adapter instances. Currently registered adapters: **Website, Facebook, Instagram, Xiaohongshu (小红书), WordPress** (`adapters/*.adapter.ts`). The `Platform` enum in `@cms-ng/shared` also lists `X`, `THREADS`, `LINKEDIN`, `YOUTUBE`, `PUSH` — these are reserved values with no adapter implementation yet; calling `PlatformRegistry.getAdapter()` returns `undefined` for them. Articles go through `PlatformPublish` records with per-platform adapted title/content/excerpt.

2. **WordPress service** (`wordpress.service.ts`): Dedicated service for WordPress REST API integration (publishing articles to WordPress sites).

### Auto-Publishing System

Automated content pipeline for scheduled/triggered article publishing without human intervention. Implementation lives in `backend/src/auto-publish/`:

- **`auto-publish.service.ts`** — CRUD over `AutoPublishTask` / `AutoPublishRun` / `AutoPublishArticle` and manual-trigger entry point.
- **`auto-publish-scheduler.service.ts`** — Uses `@nestjs/schedule` to fire tasks on `FIXED_TIME` / `INTERVAL` / `CRON` schedules and hand them to the pipeline.
- **`pipeline/pipeline.service.ts`** + **`pipeline/steps/`** — The pipeline is a sequence of step classes implementing `step.interface.ts`. Each step advances an `AutoPublishArticle` through one stage of the lifecycle below; failures are recorded in `failedStep` and the run continues to the next article.
- **Core entities** (defined in `packages/shared/`):
  - `AutoPublishTask` — Task configuration (schedule, topic strategy, content config, filter rules, publish target)
  - `AutoPublishRun` — Execution record for a task run (status, counts, error logs)
  - `AutoPublishArticle` — Individual article tracking through the pipeline
- **Article lifecycle**: `PENDING → TOPIC_SELECTED → RESEARCHED → DRAFTED → IMAGED → SAVED → PUBLISHED` (can fail at any step, tracked in `failedStep`)
- **Schedule types**: `FIXED_TIME` (specific times), `INTERVAL` (every N hours), `CRON` (cron expressions)
- **Trigger types**: `SCHEDULED` (timer-based) | `MANUAL` (user-initiated)
- **Config components**:
  - `AutoPublishScheduleConfig` — When to run (times, timezone)
  - `AutoPublishTopicStrategy` — How to select topics (fixed keywords, trending sources)
  - `AutoPublishContentConfig` — Content generation params (style, max length, language, system prompt)
  - `AutoPublishFilterConfig` — Content filters (blocked categories/keywords, allowed channels)
  - `AutoPublishPublishConfig` — Target platform/WordPress site
  - `AutoPublishRetryConfig` — Retry policy on failure

### Trending Topics

`trending-topics.service.ts` aggregates hot topics from two sources: Google Trends (`google-trends-api` package) and RSS feeds (`rss-parser` with `https-proxy-agent` for proxy support). RSSHub (in `docker-compose.yml` at `:1200`) provides a local RSS aggregator that the service can consume from.

**代理开关**: 海外 RSS 源（Google Trends、BBC、Guardian 等）的代理由 `RSS_PROXY_ENABLED` 环境变量控制。设为 `true` 时才会读取 `HTTP_PROXY` 走代理（开发环境大陆需要），设为 `false` 则直连（生产环境新加坡不需要）。本地 RSSHub 源始终不走代理。

### Key Backend Conventions

- Each domain module (auth, stories, articles, etc.) has: `<module>.module.ts`, `<module>.controller.ts`, `<module>.service.ts`, `dto/`, and `*.spec.ts` test files co-located.
- `PrismaService` extends `PrismaClient` and is provided globally via `PrismaModule`.
- Use `@cms-ng/shared` enums rather than redefining status/role values in either app.
- The shared package must be built (`cd packages/shared && npm run build`) before backend/frontend can import from it. Turbo's `^build` dependency handles this automatically during `npm run build` / `npm run test`.
- **JSON string arrays**: Schema fields like `tags`, `platforms`, `aiGeneratedParts`, `coverImages`, `adaptedTags`, and `expertise` are stored as JSON strings (`@default("[]")`), not native arrays. Always use `safeJsonParse<T>()` from `src/common/json.utils.ts` to parse them safely (returns fallback on parse failure).
- **API responses**: Use the `ApiResponse<T>` generic interface from `@cms-ng/shared` for standardized responses: `{ success: boolean, data?: T, error?: { code, message }, meta?: { page, pageSize, total } }`.

### Key Frontend Conventions

- App Router routes: `app/login`, `app/register`, `app/dashboard/` with nested segments — `articles/`, `stories/`, `review/`, `profile/`, `auto-publish/` — each with their own `page.tsx` + `layout.tsx`.
- Server Components by default; add `'use client'` only when needed (event handlers, hooks, browser APIs).
- All API calls go through `src/lib/api.ts` — an Axios instance that attaches the JWT from `localStorage` and redirects to `/login` on 401.
- Domain-specific API modules wrap the base `api` client: `article-api.ts`, `story-api.ts`, `topic-api.ts`, `channel-api.ts`, `review-api.ts`, `auth-api.ts`, `users-api.ts`, `auto-publish-api.ts`.
- **TanStack Query** (`@tanstack/react-query`) is the canonical data-fetching/caching layer wrapped around the Axios modules — use it for server state, Zustand only for client state.
- `auth-store.ts` uses Zustand with `persist` middleware (localStorage) + a `_hasHydrated` flag to avoid flash-of-login-state on page load.
- **Next.js 16 has breaking changes**: `frontend/AGENTS.md` re-exports `frontend/AGENTS.md`, so when working in `frontend/` that note loads automatically. Read `node_modules/next/dist/docs/` before writing Next.js-specific code.

## Environment Setup

### Backend (`backend/.env`)

```env
DATABASE_URL="mysql://root:root123@localhost:3306/cms_ng"   # external MySQL (any reachable host)
REDIS_URL="redis://localhost:6379"                          # external Redis (any reachable host)
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

MySQL 8 and Redis are **external middleware** — they are no longer part of `docker-compose.yml`. Point the apps at them via env vars:

- **MySQL 8** (external): set `DATABASE_URL` in `backend/.env`. Any reachable MySQL 8 host works — local install, `mysql8` Docker container you manage, cloud RDS, etc. Use the URL form `mysql://USER:PASS@HOST:PORT/cms_ng`.
- **Redis** (external): set `REDIS_URL` the same way. `RedisService` fail-opens to a no-op (warn log only) if the URL is unset or unreachable, so missing Redis won't crash the backend.
- **RSSHub** (containerized, optional): `docker-compose up -d rsshub` runs the only service still in `docker-compose.yml` (port `1200`). Used by `trending-topics` for RSS ingestion. Prod compose does not include RSSHub — point at it via `RSS_HUB_URL` if needed.

`backend/.env` is the **single source of truth** for backend config in both dev and prod. The prod compose (`docker-compose.prod.yml`) injects it into the backend container via `env_file: ./backend/.env`, so the same file you run locally is what runs in production (substitute real secrets, of course). Template: `backend/.env.example`. Both files are gitignored except the `.example`.

## Important Notes

- **Node version**: v23.9.0. Some packages log engine warnings but function correctly.
- **Prisma Client**: Always run `npx prisma generate` after modifying `schema.prisma` before running backend code.
- **AI-generated content**: AI never auto-publishes. All AI output requires human editor review and approval before publication.
- **Article status workflow**: `DRAFT → WRITING → AI_OPTIMIZING → PENDING_REVIEW → IN_REVIEW → APPROVED → PUBLISHED → ARCHIVED` (can be sent back to `REVISION` from review states). Additional states: `PIPELINE_FAILED` (auto-publish pipeline failures), `AUTO_PUBLISHED` (articles published via automation without human review). Editors and admins can approve; reporters can only submit for review.
- **Production deploy**: `docker-compose.prod.yml` builds backend + frontend containers (MySQL/Redis are external). The backend container reads `backend/.env` via `env_file:` — make sure that file exists on the deploy host with real `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `KIMI_API_KEY` (see `backend/.env.example`). `scripts/update-cms-ng.sh` is a one-command deploy script (backup → pull → build → migrate → restart) and validates these vars before running.

## Documentation

`docs/` holds PRDs, architecture reviews, and DB schema notes — start there when reasoning about scope or schema rather than rediscovering from code:

- `PRD-auto-publish-pipeline.md` — auto-publish system PRD
- `architecture-review.md`, `project_architecture_assessment.md` — architecture audits + open tech debt
- `database.md` — DB schema overview
- `ai-image-generation-fsd.md`, `ai-image-generation-interaction.md`, `ai-image-development-tasks.md` — image generation feature spec
- `test-handoff-*.md`, `qa/`, `testing/` — QA handoffs and test plans
