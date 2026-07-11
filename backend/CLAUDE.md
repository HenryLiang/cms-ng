# Backend Guidance

This file loads when Claude works with files under `backend/`. It covers backend conventions, architecture, and subsystem details for CMS-NG.

## Key Backend Conventions

- Each domain module (auth, stories, articles, etc.) has: `<module>.module.ts`, `<module>.controller.ts`, `<module>.service.ts`, `dto/`, and `*.spec.ts` test files co-located.
- `PrismaService` extends `PrismaClient` and is provided globally via `PrismaModule`.
- Use `@cms-ng/shared` enums rather than redefining status/role values in either app.
- The shared package must be built (`cd packages/shared && npm run build`) before backend/frontend can import from it. Turbo's `^build` dependency handles this automatically during `npm run build` / `npm run test`.
- **JSON string arrays**: Schema fields like `tags`, `platforms`, `aiGeneratedParts`, `coverImages`, `adaptedTags`, and `expertise` are stored as JSON strings (`@default("[]")`), not native arrays (zero `Json`-type fields exist in the schema). Always use `safeJsonParse<T>(value, fallback: T): T` from `backend/src/common/json.utils.ts` to parse them safely (returns fallback on null/undefined OR parse failure). `safeJsonParse` is **backend-only** — `@cms-ng/shared` does not export it; the frontend must implement its own try/catch parse.
- **API responses**: Use the `ApiResponse<T>` generic interface from `@cms-ng/shared` for standardized responses: `{ success: boolean, data?: T, error?: { code, message }, meta?: { page?, pageSize?, total? } }` (each `meta` inner field is independently optional).
- **Swagger/OpenAPI**: Controllers and DTOs are decorated with `@ApiTags`, `@ApiOperation`, `@ApiProperty` etc. Swagger UI is available at `/api-docs` in dev (non-production). Keep decorators in sync with actual behavior.
- **Env validation**: `ConfigModule.forRoot` in `app.module.ts` runs the manual `validateEnv()` at boot (see "Env Validation at Boot" below — not Zod). Required vars (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`) cause a fast-fail; optional vars (SMTP, billing, COS) are validated lazily by their modules.

## Env Validation at Boot

`backend/src/config/env.validation.ts` uses a **manual `validateEnv()` function** (a `REQUIRED_VARS` list of `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` plus targeted hand-written checks) run via NestJS `ConfigModule.forRoot({ validate })` — **not Zod**. If any required var is missing or invalid, the app fails fast with a readable error message instead of a mysterious runtime crash. It also enforces: `JWT_SECRET` ≥ 16 chars, `DATABASE_URL` must start with `mysql://`, and `AI_PROVIDER` must be one of `deepseek`/`kimi`/`openai` with its matching API key present. Optional vars (SMTP, billing keys) are validated lazily at their respective modules. Note: `zod` is declared in `backend/package.json` but is neither installed nor used — a dead-dependency candidate for removal.

## AI Layer

`backend/src/ai/` has two distinct subsystems:

1. **LLM calls** (`ai.service.ts` + `providers/`): Provider-agnostic architecture — `AIService` is a facade that delegates to a `ChatCompletionProvider` (injected via `CHAT_PROVIDER` DI token). Available providers: `DeepSeekProvider` (default), `KimiProvider`, `OpenAIProvider` — all extend `OpenAICompatibleProvider`. Switch via `AI_PROVIDER` env var. Exposes operations: rewrite, expand, condense, polish, generate-headlines, generate-excerpt, generate-story-suggestions, chat, generate-draft, fact-check, research-kit, review-report, SEO optimize. All operations are logged to the `AIOperation` table via the injected `AIOperationLogger` (`backend/src/common/ai-operation-logger.ts`), which wraps each call in `aiLog.run(...)`.

2. **Tool registry** (`tools/`): `AIToolsService` is a plugin registry implementing `ToolExecutor` / `ToolDefinition` interfaces. Current tool: `TavilySearchTool`. To add a new tool, implement the `ToolExecutor` interface and register it in `AIToolsService`'s constructor. Tools are exposed to the LLM via function-calling inside the private `performSearch` helper (used by research-kit/fact-check) when `SEARCH_PROVIDER` is not `kimi`; the `kimi` branch additionally requires the active provider to be `KimiProvider`.

Seedream (Doubao) image generation is handled directly in `ai.service.ts` and is enabled by `SEEDREAM_API_KEY` (with `SEEDREAM_API_BASE` and `SEEDREAM_MODEL`, all read in the `AIService` constructor). `KimiProvider` reads `KIMI_MODEL` (default `kimi-for-coding`) and forces `temperature=1` when `model === 'kimi-k2.6'`.

## Platform Publishing (Channels)

`backend/src/channels/` has two layers:

1. **Platform adapters** (`platforms/`): Adapter pattern — `platform.adapter.ts` defines the interface and `platform-registry.ts` maps `Platform` enum values to adapter instances. Currently registered adapters: **Website, Facebook, Instagram, Xiaohongshu (小红书), WordPress** (`adapters/*.adapter.ts`). The `Platform` enum in `@cms-ng/shared` also lists `X`, `THREADS`, `LINKEDIN`, `YOUTUBE`, `PUSH` — these are reserved values with no adapter implementation yet; calling `PlatformRegistry.getAdapter()` returns `undefined` for them. `PlatformRegistry` also exposes `hasAdapter(platform)` and `getSupportedPlatforms()`. Articles go through `PlatformPublish` records with per-platform adapted title/content/excerpt. Per-platform metadata (title/content length limits, media support, aspect ratios, style guides) for **all** platforms — including reserved ones with no adapter — lives in `platforms/constants.ts` as `PLATFORM_METADATA`; adapters pull their `metadata` field from there.

2. **WordPress service** (`wordpress.service.ts`): Dedicated service for WordPress REST API integration (publishing articles to WordPress sites). WordPress is the only platform with BOTH a `PlatformAdapter` (LLM-adapted SEO content + HTML) and a publish service; the other registered platforms (Website, Facebook, Instagram, Xiaohongshu) have adapters only — there is no `facebook.service.ts` etc.

## Auto-Publishing System

Automated content pipeline for scheduled/triggered article publishing without human intervention. Implementation lives in `backend/src/auto-publish/`:

- **`auto-publish.service.ts`** — CRUD over `AutoPublishTask` / `AutoPublishRun` / `AutoPublishArticle` and manual-trigger entry point.
- **`auto-publish-scheduler.service.ts`** — Uses `@nestjs/schedule` to fire tasks on `FIXED_TIME` / `INTERVAL` / `CRON` schedules and hand them to the pipeline.
- **`pipeline/pipeline.service.ts`** + **`pipeline/steps/`** — The pipeline is a sequence of step classes implementing `pipeline/step.interface.ts` (the interface lives one level above `steps/`; implementations are `pipeline/steps/*.step.ts`). The pipeline has 8 steps in order: `BillingCheckStep` (runs first, pre-check, does not advance status) → topic → research → article-generation → article-save → image-generation → publish → `NotificationStep` (runs last, does not advance status). Most steps advance an `AutoPublishArticle` through one stage of the lifecycle below; failures are recorded in `failedStep` and the run continues to the next article.
- **Core entities**: conceptual INTERFACES are in `packages/shared/src/index.ts`, but the backend uses Prisma-generated types directly (the persistence models — source of truth — are `AutoPublishTask`/`AutoPublishRun`/`AutoPublishArticle` in `schema.prisma`; the backend does not import the shared interfaces).
  - `AutoPublishTask` — Task configuration (schedule, topic strategy, content config, filter rules, publish target)
  - `AutoPublishRun` — Execution record for a task run (status, counts, error logs)
  - `AutoPublishArticle` — Individual article tracking through the pipeline
- **Article lifecycle**: `PENDING → TOPIC_SELECTED → RESEARCHED → DRAFTED → SAVED → IMAGED → PUBLISHED` (the article is saved to the DB before images are generated). `ArticleRunStatus` also has `FAILED` (can fail at any step, tracked in `failedStep`) and `WITHDRAWN` (published auto-publish articles can be withdrawn via `POST /auto-publish/articles/:id/withdraw`).
- **Schedule types**: `FIXED_TIME` (specific times), `INTERVAL` (every N hours), `CRON` (cron expressions)
- **Trigger types**: `SCHEDULED` (timer-based) | `MANUAL` (user-initiated)
- **Config components** (defined in `packages/shared/`, but not imported by the backend — `PipelineContext` in `step.interface.ts` re-defines `contentConfig`/`publishConfig` inline):
  - `AutoPublishScheduleConfig` — When to run (times, timezone)
  - `AutoPublishTopicStrategy` — How to select topics (fixed keywords, trending sources)
  - `AutoPublishContentConfig` — Content generation params (style, max length, language, system prompt)
  - `AutoPublishFilterConfig` — Content filters (blocked categories/keywords, allowed channels)
  - `AutoPublishPublishConfig` — Target platform/WordPress site
  - `AutoPublishRetryConfig` — Retry policy on failure

**Kill switch (紧急杀戮开关)**: `POST /auto-publish/kill-switch` (admin-only, `@Roles ADMIN`) toggles a global pause on the auto-publish pipeline. Backed by the `KillSwitch` singleton table (`schema.prisma`, fixed id `auto-publish`). **MySQL is the SOLE source of truth** — `isKillSwitchActive` (`auto-publish-scheduler.service.ts`) reads the DB directly and deliberately does NOT consult Redis (per the issue #48 P0 fix; its own comment says 不读 Redis). When `enabled=true`, the scheduler skips **newly-triggered** runs (cron-fire check + `runTask` entry check); it does NOT interrupt runs already in flight — the article batch loop has no per-step kill-switch check, so a started run processes its entire batch. New runs are a silent skip (`return`, no Run record), not a fail-fast. Redis is written best-effort but is not read by the canonical path (the one retry-path Redis read checks `=== "true"` against a written `"1"` and never matches — dead code).

## Billing & Payments

`backend/src/billing/` manages usage-based billing with the following:

- **Transaction tracking**: `TransactionType` enum covers `TOP_UP`, `AI_LLM`, `AI_IMAGE`, `PUBLISH`, `AUTO_PUBLISH`, `DATA_FETCH`, `REFUND`, `ADJUSTMENT`. Each operation is recorded with unit price, quantity, and balance-after. `DATA_FETCH` is used by the X (twitterapi.io) data source. Related shared enums: `TransactionStatus` (`PENDING`/`COMPLETED`/`FAILED`/`REFUNDED`), `PaymentMethod`, `BillingCategory`. `BillingTransactionRecord` carries an `idempotencyKey` (`@unique`) for safe retry/dedup.
- **Payment integration**: Alipay and WeChat Pay support via `billing/payment/`. Billing is **enabled by default**; set `BILLING_ENABLED=false` to disable (`billing.service.ts` reads `BILLING_ENABLED !== 'false'`).
- **Endpoints**: `POST /billing/estimate` returns cost breakdowns before executing billable operations. Full surface: `GET /billing/{balance,transactions,transactions/team,config,alert,report,top-up/records}`, `POST /billing/{estimate,top-up/manual,top-up/create,refund}`, `PUT /billing/{config/:itemKey,alert}`, and payment callbacks `POST /billing/payment/{alipay,wechat}/notify`.
- **Balance management**: Users have a balance field; `BalanceInfo` includes an `alertThreshold` and recent transaction history.
- Frontend client: `frontend/src/lib/billing-api.ts`.

## Storage (COS)

`backend/src/storage/` provides file upload to 腾讯云 COS (Cloud Object Storage):

- **`CosStorageService`** — Direct COS SDK integration (`put`/PutObject and `delete`/DeleteObject only; **no `GetObject`** — reads happen via public `https://` URLs). Bucket is configured for public-read/private-write so frontend and WordPress can read via `https://` directly.
- **`StorageService`** — The storage interface (`put`/`delete`); `CosStorageService` is the sole implementation, aliased to the `STORAGE_SERVICE` DI token via `useExisting`.
- CORS must be configured on the COS bucket to allow `localhost:3000` (dev) and production frontend domain for GET requests.

## Email Notifications

SMTP-based email notifications are configured via `SMTP_*` env vars and sent **inline via `nodemailer` directly in `auto-publish/pipeline/pipeline.service.ts`** (a run-summary email; there is no dedicated `MailerService`/`NotificationService` module, and the `NotificationStep` only logs — actual email happens at the run level after all articles complete). No review-assignment or other operational email exists. All SMTP vars are optional — the app boots without them and surfaces errors only when a module attempts to send mail.

## Trending Topics

`trending-topics.service.ts` aggregates from **12 hard-coded feeds via `rss-parser`** (with `https-proxy-agent` for proxy support): 1 Google Trends (parsed from its public RSS URL — the `google-trends-api` package is declared but unused, a dead-dependency candidate) + 8 native RSS (sina, people, chinanews, bbc, guardian, nytimes, economist, ft) + 4 RSSHub-proxied (zaobao, 36kr, huxiu, douban-movie). RSSHub (in `docker-compose.yml` at `:1200`) provides a local RSS aggregator the service can consume from. Gotcha: zaobao's native feed is dead since the 2026 redesign (code comment: 早报官方 .com.sg/rss/news.xml 已下线) — it MUST stay on RSSHub.

**代理开关**: 海外源（Google Trends + 5 个海外 native feeds：bbc/guardian/nytimes/economist/ft）的代理由 `RSS_PROXY_ENABLED` 环境变量控制。设为 `true` 时才会读取 `HTTP_PROXY`（或小写 `http_proxy`）走代理（开发环境大陆需要），设为 `false` 则直连（生产环境新加坡不需要）。3 个国内 native feeds（sina/people/chinanews）与全部 4 个 RSSHub feeds 始终直连（`isRSSHub:true` 强制直连）。

**X (Twitter) 数据源** (`trending-topics/twitter.service.ts`): 第三方 **twitterapi.io** REST API（base `https://api.twitterapi.io`，单 `x-api-key` 头认证，无 OAuth，按次付费）。提供两类选题数据：(1) 趋势榜单 `GET /twitter/trends?woeid=<n>`（多 WOEID 可切换，`TWITTERAPI_IO_WOEIDS` 配置）；(2) 热门账号最新推文 `GET /twitter/user/tweets?userName=<handle>`（字段 camelCase：`likeCount`/`retweetCount`/`isReply` 等；归一化时剔除回复与转推）。`TwitterService` 注入 `BillingService`+`RedisService`，归一化到通用条目形状 `{title, description, source, heatScore, tags, articles[]}` 复用 `NewsSourcePanel`。**缓存**：趋势 `x:trends:{woeid}` TTL 600s、账号推文 `x:acct:{handle}` TTL 300s、聚合 `x:accounts:all` TTL 300s（RedisModule 全局，fail-open）。**计费**：仅缓存未命中、实打 twitterapi.io 时扣费（`TransactionType.DATA_FETCH` + `BillingCategory.OTHER` + 定价项 `x_trending_fetch`，默认 0.05/次）；幂等键 `x_fetch:{userId}:{kind}:{dataKey}:{bucket}` 按 TTL 桶防同用户同数据窗口内重复扣费；聚合拉取聚合层一次扣费（非每账号）；余额不足拉取前抛 `InsufficientBalanceException`。**代理**：原生 `fetch` 不读 `HTTP_PROXY`，`TWITTERAPI_IO_PROXY_ENABLED=true` 时显式 `import { ProxyAgent } from 'undici'`（Node 20+ 内置）按请求挂代理——与 RSS 的 `https-proxy-agent`（rss-parser 专用）独立。**watch 清单**：`TwitterWatchAccount` 表（管理员 `@Roles(ADMIN)` CRUD：`GET/POST /trending-topics/x-watch`、`DELETE /trending-topics/x-watch/:id`）+ 前端自由输入任意 @username（`GET /trending-topics/x-accounts/:userName`）。聚合拉取用 `Promise.allSettled` 隔离单账号失败。种子：`backend/prisma/seed-twitter-accounts.ts`（默认账号 + `x_trending_fetch` 计费项）。
