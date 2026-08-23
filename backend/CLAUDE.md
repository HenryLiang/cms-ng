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
- **Env validation**: `ConfigModule.forRoot` in `app.module.ts` runs the manual `validateEnv()` at boot (see "Env Validation at Boot" below — not Zod). Required vars (`DATABASE_URL`, `JWT_SECRET`) cause a fast-fail; optional vars (SMTP, billing, COS) are validated lazily by their modules.

## Env Validation at Boot

`backend/src/config/env.validation.ts` uses a **manual `validateEnv()` function** (a `REQUIRED_VARS` list of `DATABASE_URL`, `JWT_SECRET` plus targeted hand-written checks) run via NestJS `ConfigModule.forRoot({ validate })` — **not Zod**. If any required var is missing or invalid, the app fails fast with a readable error message instead of a mysterious runtime crash. It also enforces: `JWT_SECRET` ≥ 16 chars, `DATABASE_URL` must start with `mysql://`, and `AI_PROVIDER` must be one of `deepseek`/`gemini`/`kimi`/`openai` with its matching API key present. Two optional media-search vars get **boot-time format checks when present** (still presence-optional — absent means degrade, not fail-fast): `AI_VISION_PROVIDER` must be one of `gemini`/`kimi`/`openai` (deepseek has no vision; vision is config-isolated from the text `AI_PROVIDER`), and `ELASTICSEARCH_NODE` must be an http(s) URL when `ELASTICSEARCH_ENABLED=true`. `TRUST_PROXY`, when present, is restricted to `loopback` (host nginx), `1` (Compose proxy), or `2` (an outer proxy plus Compose proxy, only with direct ingress blocked) so arbitrary forwarding chains cannot be enabled accidentally. All connection strings in validation error messages are credential-redacted via `redactConnectionString` (public repo — CI logs are world-readable). Remaining optional vars (SMTP, billing keys) are validated lazily at their respective modules. Note: `zod` is declared in `backend/package.json` but is neither installed nor used — a dead-dependency candidate for removal.

## AI Layer

`backend/src/ai/` has two distinct subsystems:

1. **LLM calls** (`ai.service.ts` + `providers/`): Provider-agnostic architecture — `AIService` is a facade that delegates to a `ChatCompletionProvider` (injected via `CHAT_PROVIDER` DI token). Available providers: `DeepSeekProvider` (default), `GeminiProvider`, `KimiProvider`, `OpenAIProvider` — all extend `OpenAICompatibleProvider`. Switch via `AI_PROVIDER` env var. Gemini uses Google's OpenAI-compatible Chat Completions endpoint. Exposes operations: rewrite, expand, condense, polish, generate-headlines, generate-excerpt, generate-story-suggestions, chat, generate-draft, fact-check, research-kit, review-report, SEO optimize. All operations are logged to the `AIOperation` table via the injected `AIOperationLogger` (`backend/src/common/ai-operation-logger.ts`), which wraps each call in `aiLog.run(...)`.

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

**Kill switch (紧急杀戮开关)**: `POST /auto-publish/kill-switch` (admin-only, `@Roles ADMIN`) toggles a global pause on the auto-publish pipeline. Backed by the `KillSwitch` singleton table (`schema.prisma`, fixed id `auto-publish`). **MySQL is the SOLE source of truth** — `isKillSwitchActive` (`auto-publish-scheduler.service.ts`) reads the DB directly. When `enabled=true`, the scheduler skips **newly-triggered** runs (cron-fire check + `runTask` entry check); it does NOT interrupt runs already in flight — the article batch loop has no per-step kill-switch check, so a started run processes its entire batch. New runs are a silent skip (`return`, no Run record), not a fail-fast.

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

SMTP-based email notifications are configured via `SMTP_*` env vars and sent **inline via `nodemailer` directly in `auto-publish/pipeline/pipeline.service.ts`** (a run-summary email; there is no dedicated `MailerService`, and the pipeline `NotificationStep` only logs — actual email happens at the run level after all articles complete). No review-assignment or other operational email exists. All SMTP vars are optional — the app boots without them and surfaces errors only when a module attempts to send mail.

## In-App Notifications

`backend/src/notifications/` is the user-scoped in-app notification module. `NotificationsService.publish()` is the single producer interface and supports retry-safe `dedupeKey` values; `GET /notifications`, `PATCH /notifications/:id/read`, and `PATCH /notifications/read-all` power the dashboard bell. Producers currently include completed billing deductions, auto-publish run terminal states, and video-generation success/failure. Notification writes are best-effort after the source-of-truth transaction/status update, so a notification outage never rolls back billing or task completion. The frontend polls every 30 seconds and refreshes on window focus; there is no WebSocket/SSE channel.

## Trending Topics

External topic candidates use the adapter/catalog seam in `src/trending-topics/sources/`. `TopicSourceCatalog` dispatches every source through `TopicSourceAdapter`, whose implementations expose server-owned source definitions and normalized `TopicSourcePage` results. `RssTopicSourceAdapter` owns declarative RSS/RSSHub configuration plus special RSS mechanisms (Google Trends fields, aggregate feeds, NHK multi-feed aggregation, Bilibili partition parameters); `TwitterService` and `WikipediaService` implement the same interface for their REST mechanisms. `TrendingTopicsService` only owns curated-topic persistence, adoption, AI suggestions, and legacy-route compatibility shims.

Clients discover sources and their `select`/`date`/`text`/`combobox` parameters with `GET /trending-topics/sources`, then call `GET /trending-topics/sources/:sourceId/items`; both responses use `ApiResponse<T>`. Legacy per-source routes remain during migration. Adding an ordinary RSS/RSSHub feed requires one `RssSourceConfig`; a different mechanism requires one `TopicSourceAdapter` implementation plus registration in `TrendingTopicsModule`, with no source-specific frontend branch. RSSHub remains optional; zaobao MUST stay on RSSHub because its native feed is gone.

**代理开关**: 海外 RSS（Google Trends、BBC/Guardian/NYTimes/Economist/FT/Reuters、NHK）由 `RSS_PROXY_ENABLED` 控制；设为 `true` 时读取 `HTTP_PROXY`（或小写 `http_proxy`）。国内原生源（sina/people/chinanews）与全部 RSSHub 源始终直连。

**newsnow 热榜数据源** (`trending-topics/sources/newsnow/`): 30 个国内热搜/财经快讯/科技社区/国际中文源（百度/抖音/头条/贴吧/快手/虎扑/腾讯/澎湃/财联社×3/华尔街见闻×3/金十/格隆汇/MKT/雪球/AI热榜/IT之家/少数派/掘金/牛客/HackerNews/GitHub Trending/Solidot/参考消息/卫星通讯社/凤凰网/靠谱热搜），抓取器移植自 [ourongxing/newsnow](https://github.com/ourongxing/newsnow)（MIT，vendored/ 目录含 NOTICE 与逐文件偏差注释；上游已冻结，视为稳定快照）。`NewsnowTopicSourceAdapter` 是唯一 `TopicSourceAdapter` 实现，`newsnow-source.registry.ts` 声明式登记每个源（id 统一 `newsnow-` 前缀）；HTTP 层统一 `newsnow-http.client.ts`（ofetch，超时 10s/重试 1 次，`NEWSNOW_PROXY_ENABLED=true` 时对 `NEWSNOW_PROXY_DOMAINS` 域名挂 undici ProxyAgent——大陆开发访问 HackerNews/GitHub 等海外源）。**缓存**：进程内 per-source TTL（快讯 120s/热榜 300s/列表 1800s），缓存命中不外呼防反爬。**fail-open**：单源失败返回 `status:'unavailable'`+warnings，不影响其他源。**开关**：`NEWSNOW_ENABLED`（默认 true）、`NEWSNOW_SOURCES` 白名单（海外机房逐源验证可达性后裁剪）。可达性验证脚本：`npx ts-node scripts/newsnow-smoke.ts`（支持 `--proxy`/`--only=`，串行逐源外呼）。weibo/zhihu/bilibili/36kr/zaobao 与 RSSHub 源重复，newsnow 版未引入；zaobao 仍必须走 RSSHub。注册表每个源带 `listType: hottest|realtime`（名次榜单/快讯时间线），随定义透出给「实时热点」页；条目映射填充 `TopicCandidate.publishedAt`（快讯类源），`fetchedAt` 为真实抓取时刻（缓存命中回传原时刻，非响应时间）。`GET /trending-topics/sources[...]/items` 两端点为方法级 `[STORIES, HOT_TOPICS]` 或门控（实时热点页独立于选题中心开关）。法布财经(fastbull)已转纯客户端渲染（上游冻结未跟进），快讯/要闻两源未引入。冒烟基线（2026-08-23 大陆直连）：30 源中 27 个直连可达，kaopu/mktnews/hackernews 需代理（已在默认 NEWSNOW_PROXY_DOMAINS）。

**X (Twitter) 数据源** (`trending-topics/twitter.service.ts`): 第三方 **twitterapi.io** REST API（base `https://api.twitterapi.io`，单 `x-api-key` 头认证，无 OAuth，按次付费）。提供两类选题数据：(1) 趋势榜单 `GET /twitter/trends?woeid=<n>`（多 WOEID 可切换，`TWITTERAPI_IO_WOEIDS` 配置）；(2) 热门账号最新推文 `GET /twitter/user/tweets?userName=<handle>`（字段 camelCase：`likeCount`/`retweetCount`/`isReply` 等；归一化时剔除回复与转推）。`TwitterService` 注入 `BillingService`，归一化到通用条目形状 `{title, description, source, heatScore, tags, articles[]}` 复用 `NewsSourcePanel`。**缓存**：趋势 `x:trends:{woeid}` TTL 600s、账号推文 `x:acct:{handle}` TTL 300s、聚合 `x:accounts:all` TTL 300s（进程内内存缓存）。**计费**：仅缓存未命中、实打 twitterapi.io 时扣费（`TransactionType.DATA_FETCH` + `BillingCategory.OTHER` + 定价项 `x_trending_fetch`，默认 0.05/次）；幂等键 `x_fetch:{userId}:{kind}:{dataKey}:{bucket}` 按 TTL 桶防同用户同数据窗口内重复扣费；聚合拉取聚合层一次扣费（非每账号）；余额不足拉取前抛 `InsufficientBalanceException`。**代理**：原生 `fetch` 不读 `HTTP_PROXY`，`TWITTERAPI_IO_PROXY_ENABLED=true` 时显式 `import { ProxyAgent } from 'undici'`（Node 20+ 内置）按请求挂代理——与 RSS 的 `https-proxy-agent`（rss-parser 专用）独立。**watch 清单**：`TwitterWatchAccount` 表（管理员 `@Roles(ADMIN)` CRUD：`GET/POST /trending-topics/x-watch`、`DELETE /trending-topics/x-watch/:id`）+ 前端自由输入任意 @username（`GET /trending-topics/x-accounts/:userName`）。聚合拉取用 `Promise.allSettled` 隔离单账号失败。种子：`backend/prisma/seed-twitter-accounts.ts`（默认账号 + `x_trending_fetch` 计费项）。


## Media Library & Search

`backend/src/media/` + `backend/src/search/` form the media-asset subsystem (PRD: `docs/PRD-media-ai-tagging-search.md`):

- **`media/`** - `MediaController` exposes upload / list / get / patch / `POST :id/retag` / delete. `MediaService` owns asset CRUD and orchestrates tagging + search. `MediaTaggingService` runs AI vision auto-tagging via a **separate** `AI_VISION_PROVIDER` (`gemini`/`kimi`/`openai` - deepseek has no vision; vision is config-isolated from the text `AI_PROVIDER`), driven by `tagging-prompt.ts`. `MediaTaggingScheduler` re-tags untagged/pending assets on a schedule. `MediaModule` imports `AIModule` + `BillingModule` + `SearchModule`.
- **`search/`** - `SearchService` wraps Elasticsearch (`media-index.mapping.ts`). The contract is **fail-open**: `indexAsset`/`deleteAsset` writes warn-only and never block the media main flow; `searchMedia` timeout/5xx throws `SearchUnavailableException`, which `MediaService` catches to degrade to MySQL `LIKE` (PRD §7.4). `ensureReady`/`ensureIndex` lazy-self-heal on the next call after a transient outage. Elasticsearch is optional - off by default (`ELASTICSEARCH_ENABLED`); when disabled/unreachable/IK-missing, search silently degrades to `LIKE`.
- **Article AI tags** - `AIService.generateDraft()` returns tags in the same model call used for the draft. Existing articles use `POST /articles/:id/ai-tags` for one-click tagging; generated tags are normalized and merged into the manual `Article.tags` array. Article search indexes title/content/tags with `title^3 > tags^2 > content` and falls back to MySQL title/content/tag `LIKE` when Elasticsearch is unavailable.
