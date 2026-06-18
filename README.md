# 01创作大脑 (CMS-NG)

AI驱动的内容创作作业系统，面向媒体机构的新闻编辑团队。以"记者 + AI"协作模式为核心，覆盖选题发现、稿件创作、编辑审核到多平台分发的完整内容生产链路。

---

## 技术架构

```
cms-ng/
├── frontend/          # Next.js 16 + React 19 + Tailwind CSS v4
├── backend/           # NestJS 11 + Prisma ORM + MySQL 8
├── packages/shared/   # 前后端共享类型与常量
└── docker-compose.yml # 仅编排 RSSHub（MySQL/Redis 为外部中间件）
```

| 层级        | 技术                                                              |
| ----------- | ----------------------------------------------------------------- |
| 前端框架    | Next.js 16 (App Router), React 19, TypeScript                     |
| 状态管理    | Zustand（auth 持久化） + TanStack Query（服务端状态）             |
| 数据请求    | Axios（统一拦截 401 跳转登录）                                    |
| UI 样式     | Tailwind CSS v4, Lucide Icons, TipTap 富文本编辑器                |
| 后端框架    | NestJS 11, Express                                                |
| ORM         | Prisma 6（MySQL 8，外部实例）                                    |
| 缓存/队列   | Redis（ioredis，外部实例，fail-open）                             |
| RSS 聚合    | RSSHub（dev 通过 compose 起 :1200，prod 走 `RSS_HUB_URL`）       |
| AI 模型     | 可切换 Provider 抽象层：DeepSeek / Kimi / OpenAI（OpenAI 兼容协议）|
| AI 工具     | Tavily 联网搜索（SEARCH_PROVIDER=tavily）                         |
| AI 配图     | Seedream (Doubao) / 火山引擎                                      |
| 认证        | JWT（@nestjs/passport + passport-jwt）                            |
| Monorepo    | npm workspaces + Turbo                                           |

---

## 核心功能模块

| 模块                  | 功能                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------ |
| **记者工作台**  | 创建选题、撰写稿件、管理稿件生命周期、版本对比与回滚                                 |
| **选题中心**    | 热点话题录入、AI 智能选题推荐、12 路 RSS 源聚合 + Google Trends、一键导入为选题      |
| **AI 协作创作** | 改写、扩写、缩写、润色、生成标题/摘要、对话写作、初稿生成、事实核查、AI 审稿、SEO 优化 |
| **编辑审核台**  | 稿件审核工作流（review-queue）、分配编辑、退回修改、版本回滚                         |
| **多平台分发**  | 5 个已实现 adapter：Website / Facebook / Instagram / 小红书 / WordPress REST API     |
| **自动发布管道** | 定时/触发式任务，AI 选稿→研究→写稿→配图→入库→发布，全程可监控可中止（kill-switch）  |
| **计费系统**    | 按量计费（AI LLM / AI 配图 / 发布 / 自动发布），支付宝 & 微信支付充值，余额预警        |
| **对象存储**    | 腾讯云 COS 文件上传（封面图、配图），公开读私有写                                    |
| **管理后台**    | 用户与角色管理（记者 / 编辑 / 管理员）                                               |
| **邮件通知**    | SMTP 通道，审稿/自动发布失败等事件触发                                               |

---

## 快速开始

### 前置依赖

- Node.js >= 20
- 外部 MySQL 8 实例（自管或云 RDS）
- 外部 Redis 实例（自管或云托管）
- Docker & Docker Compose（仅用于 RSSHub 聚合代理及生产应用容器）
- AI Provider 至少一个的 API Key：DeepSeek（默认） / Kimi / OpenAI 三选一

### 1. 克隆与安装

```bash
git clone https://github.com/HenryLiang/cms-ng.git
cd cms-ng
npm install
```

### 2. 启动基础设施

确保以下中间件已可访问：

- **MySQL 8** — 在外部主机/容器/云 RDS 上启动，建好数据库 `cms_ng`（root 用户或专用账号皆可）
- **Redis** — 任意可达的 Redis 实例
- **RSSHub**（可选，用于 trending-topics 抓取国内 RSS 源）：

```bash
docker-compose up -d rsshub
```

RSSHub 启动于 `localhost:1200`。如果你的部署环境已有独立 RSSHub，可跳过此步并通过 `RSS_HUB_URL` 指向它。

### 环境差异：大陆开发 vs. 海外生产

抓取海外 RSS 源（Google Trends / BBC / Guardian / NYT / FT / Economist）的可达性受地域影响，配置上要做一次选择：

| 环境                         | `RSS_PROXY_ENABLED` | `HTTP_PROXY`              | 行为                                    |
| ---------------------------- | ------------------- | ------------------------- | --------------------------------------- |
| **大陆开发**（你在国内）     | `true`              | `http://127.0.0.1:7890`   | 海外源走本地代理，RSSHub 走直连（局域网） |
| **海外生产**（如新加坡机房） | `false`             | 注释掉或留空              | 全部直连，不消耗代理                    |

切换只改这两行即可，**业务代码不需任何改动**。RSSHub 本地实例始终不走代理（通过 `isRSSHub: true` 标记识别）。

### 3. 配置环境变量

```bash
# 后端
cp backend/.env.example backend/.env
# 编辑 backend/.env：填入 DATABASE_URL / REDIS_URL / JWT_SECRET / 所选 AI Provider 的 API Key

# 前端
cp frontend/.env.example frontend/.env.local
```

**关键环境变量：**

完整模板见 `backend/.env.example`（37 个 key，与 `backend/.env` 一一对应）。下面列出部署时**必改**的项：

```env
# ===== 后端：必改（backend/.env） =====
# 数据库与缓存（外部中间件）
DATABASE_URL="mysql://USER:PASS@HOST:3306/cms_ng"      # 密码含 @ 必须 URL-encode 为 %40
REDIS_URL="redis://HOST:6379"                          # 带密码: redis://:PASS@HOST:6379

# 应用秘钥
JWT_SECRET="change-me-in-production"                    # 32 字节以上随机串
PORT=3001

# AI Provider（任选其一）
AI_PROVIDER="deepseek"                                  # deepseek | kimi | openai
DEEPSEEK_API_KEY="sk-..."                               # AI_PROVIDER=deepseek 时必填
# KIMI_API_KEY="sk-..."                                # AI_PROVIDER=kimi 时必填
# KIMI_API_BASE="https://api.kimi.com/coding/v1"
# KIMI_MODEL="kimi-for-coding"
# OPENAI_API_KEY="sk-..."                              # AI_PROVIDER=openai 时必填

# 联网搜索（AI 工具注册表使用）
TAVILY_API_KEY="tvly-..."                               # SEARCH_PROVIDER=tavily 时必填
SEARCH_PROVIDER="tavily"                                # tavily（推荐）| kimi

# AI 配图（可选）
SEEDREAM_API_KEY="ark-..."
SEEDREAM_API_BASE="https://ark.cn-beijing.volces.com/api/v3"
SEEDREAM_MODEL="doubao-seedream-5-0-260128"

# WordPress REST API 自动发布
WORDPRESS_SITE_URL="https://your-site.com"
WORDPRESS_USERNAME="..."
WORDPRESS_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"  # WP 后台 → 用户 → 应用程序密码

# 邮件通知（可选）
SMTP_HOST="smtp.qq.com"
SMTP_PORT=465
SMTP_USER="..."
SMTP_PASS="..."
SMTP_FROM="..."
NOTIFICATION_EMAIL="..."

# RSS 源代理（大陆开发 / 海外生产）
RSS_PROXY_ENABLED="false"                               # true=大陆开发, false=海外生产
HTTP_PROXY="http://127.0.0.1:7890"                      # 仅在 RSS_PROXY_ENABLED=true 时生效

# RSSHub 实例（dev 走 compose，prod 指向独立部署）
RSS_HUB_URL="http://localhost:1200"

# 上传目录
UPLOAD_DIR="./uploads"

# ===== 前端：必改（frontend/.env.local） =====
NEXT_PUBLIC_API_URL="http://localhost:3001"             # 指向后端，prod 替换为 https 域名
```

### 4. 初始化数据库

```bash
npm run db:migrate   # 创建表结构
npm run db:generate  # 生成 Prisma Client
npm run db:seed      # 可选：插入种子数据
```

### 5. 启动开发服务器

```bash
# 同时启动前后端（推荐）
npm run dev

# 或分别启动
# 终端 1
cd backend && npm run start:dev   # http://localhost:3001

# 终端 2
cd frontend && npm run dev        # http://localhost:3000
```

访问 http://localhost:3000 即可使用。

---

## 开发命令

```bash
# 构建全部
npm run build

# 代码检查
npm run lint

# 运行测试
npm run test

# 一键启动开发环境（推荐，支持 --backend-only / --frontend-only / --no-rsshub / --no-migrate）
npm run dev:start

# 数据库相关
npm run db:generate   # Prisma Client 生成
npm run db:migrate    # 创建并应用迁移
npm run db:studio     # Prisma Studio 可视化数据库
npm run db:seed       # 执行种子脚本
```

### 后端测试

```bash
cd backend
npm run test              # 单元测试
npm run test:watch        # 监听模式
npm run test:cov          # 覆盖率
npm run test:e2e          # E2E 测试
npx jest src/auth/auth.service.spec.ts   # 单文件测试
```

### 前端测试

```bash
cd frontend
npm run test              # Vitest + jsdom
npm run test:watch        # 监听模式
npx vitest run src/lib/article-api.test.ts   # 单文件测试
```

### 全项目 E2E 回归测试（Playwright）

```bash
# 前提：dev 前端 :3000 和 QA 后端 :3002 均已运行（配置不自动启动 webServer）
npx playwright test
```

- 测试文件：`tests/regression/*.spec.ts`（覆盖 smoke / auth / 文章工作流 / AI 能力 / 自动发布 / 多平台分发 / RBAC 等）
- 共享夹具：`tests/regression/_shared/`（QA 后端 :3002，数据写入 `cms_ng_qa` 库，不影响 dev 库）
- 报告：HTML 在 `tests/regression/results/html/`，JSON 摘要在 `tests/regression/results/run-summary.json`

---

## 数据库模型

```
User                 ──1:N── Story (reporter)
                     ──1:N── Article (author)
                     ──1:N── AIOperation

Story                ──1:N── Article
                     ──1:1── TrendingTopic (adoptedTopicId)

Article              ──1:N── ArticleVersion
                     ──1:N── AIOperation
                     ──1:N── PlatformPublish     # 多平台分发记录（per-platform 适配标题/正文/标签）
                     ──1:N── AutoPublishArticle   # 自动发布管道追踪

TrendingTopic        (热点话题，支持 Google Trends / RSS 导入)

AutoPublishTask      ──1:N── AutoPublishRun       # 任务配置 → 执行记录
AutoPublishRun       ──1:N── AutoPublishArticle   # 每次 run 处理多篇稿件
                                              # 文章生命周期：PENDING → TOPIC_SELECTED
                                              #   → RESEARCHED → DRAFTED → IMAGED
                                              #   → SAVED → PUBLISHED（可任一阶段失败）

User                 ──1:N── BillingTransaction    # 计费流水（append-only）
                     ──1:1── BalanceAlert          # 余额预警配置
                     ──1:N── TopUpRecord           # 充值记录

BillingConfig        (各操作单价配置，category + itemKey 唯一)
BillingTransaction   ──1:1── AIOperation           # AI 操作 → 计费流水
                     ──1:1── PlatformPublish       # 平台发布 → 计费流水
                     ──1:1── TopUpRecord           # 充值 → 计费流水
KillSwitch           (紧急杀戮开关单例表，issue #48 P0 修复，MySQL 真源 + Redis 缓存)
```

完整 Schema 见 `backend/prisma/schema.prisma`（15 张表）。

> **重要**：JSON 字符串数组字段（`tags` / `platforms` / `aiGeneratedParts` / `coverImages` / `adaptedTags` / `expertise` 等）以 `JSON` 类型存储为字符串，前后端都通过 `safeJsonParse<T>()`（`backend/src/common/json.utils.ts`）解析，解析失败自动回退到默认值。

---

## API 端点概览

后端基础 URL `http://localhost:3001`（dev），所有非 `/auth/login`、`/auth/register` 端点均需 JWT。

| 模块              | 基础路径 / 关键端点                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| 认证              | `POST /auth/login`，`POST /auth/register`                                                              |
| 用户              | `GET /users`，`GET /users/editors`，`GET /users/:id`，`PATCH /users/:id`                               |
| 选题              | `GET /stories`，`POST /stories`，`GET /stories/:id`，`PATCH /stories/:id`                              |
| 稿件 CRUD         | `GET/POST /articles`，`GET/PATCH/DELETE /articles/:id`                                                  |
| 稿件审核          | `GET /articles/review-queue`，`PATCH /articles/:id/assign-editor`，`PATCH /articles/:id/review`        |
| 稿件版本          | `GET /articles/:id/versions`，`POST /articles/:id/rollback/:version`                                    |
| AI 协作           | `POST /articles/:id/ai-{rewrite,expand,condense,polish,headlines,excerpt,chat,draft,fact-check,review,seo,generate-image}` |
| 多平台分发        | `GET /channels/platforms`，`POST /channels/:articleId/adapt`，`POST /channels/:articleId/publish-wordpress`，`GET /channels/:articleId/publishes` |
| 自动发布任务      | `GET/POST /auto-publish/tasks`，`GET /auto-publish/tasks/:id`，`POST /auto-publish/tasks/:id/{toggle,run}` |
| 自动发布执行      | `GET /auto-publish/runs`，`GET /auto-publish/runs/:id`，`GET /auto-publish/runs/:runId/articles`        |
| 自动发布文章      | `POST /auto-publish/articles/:id/{withdraw,retry}`                                                     |
| 自动发布紧急      | `POST /auto-publish/kill-switch`，`GET /auto-publish/stats`                                            |
| 热点聚合          | `GET /trending-topics`，`POST /trending-topics`，`GET /trending-topics/google-trends?geo=HK&timeRange=24h`，`GET /trending-topics/:source` |
| 热点 AI 选题      | `POST /trending-topics/ai-suggestions`，`POST /trending-topics/:id/adopt`                              |
| 计费              | `GET /billing/balance`，`GET /billing/transactions`，`POST /billing/estimate`，`GET /billing/config` |
| 充值与支付        | `POST /billing/top-up`，`POST /billing/payment/alipay/callback`，`POST /billing/payment/wechat/callback` |

---

## 项目结构

```
cms-ng/
├── frontend/
│   ├── src/app/                       # Next.js App Router
│   │   ├── login/page.tsx             # 登录
│   │   ├── register/page.tsx          # 注册
│   │   └── dashboard/                 # 仪表板路由组（auth 保护）
│   │       ├── page.tsx               # 工作台首页
│   │       ├── stories/               # 选题中心
│   │       ├── articles/              # 稿件管理
│   │       ├── review/                # 审核工作台
│   │       ├── auto-publish/          # 自动发布管理
│   │       ├── billing/               # 计费与充值
│   │       ├── profile/               # 个人中心
│   │       └── layout.tsx
│   ├── src/components/                # 通用组件 + 富文本编辑器 + 角色守卫
│   ├── src/lib/                       # API 客户端（api.ts + 各域 wrapper）
│   ├── src/hooks/                     # useRoleGuard, useProtectedRoute
│   ├── src/store/                     # Zustand auth store（localStorage 持久化）
│   └── src/test/                      # Vitest setup
│
├── backend/
│   ├── src/
│   │   ├── auth/                      # JWT 认证（login / register / guards）
│   │   ├── users/                     # 用户 CRUD + 角色管理
│   │   ├── stories/                   # 选题业务
│   │   ├── articles/                  # 稿件 CRUD + 版本 + 审核 + AI 操作
│   │   ├── trending-topics/           # 12 路 RSS 源聚合 + Google Trends
│   │   ├── ai/                        # AI Provider 抽象层 + Tool 注册表
│   │   │   └── tools/                 # 可插拔的 AI 工具（Tavily 等）
│   │   ├── channels/                  # 多平台分发
│   │   │   ├── platforms/adapters/    # Website / Facebook / Instagram / 小红书 / WordPress
│   │   │   ├── platform-registry.ts
│   │   │   └── wordpress.service.ts   # WordPress REST API 客户端
│   │   ├── auto-publish/              # 自动发布管道
│   │   │   ├── pipeline/steps/        # 7 个 step：选稿/研究/写稿/配图/入库/发布
│   │   │   ├── auto-publish-scheduler.service.ts   # @nestjs/schedule 调度
│   │   │   └── auto-publish.controller.ts          # 任务/执行/kill-switch
│   │   ├── billing/                   # 计费系统（流水 / 充值 / 支付宝 / 微信支付 / 余额预警）
│   │   ├── storage/                   # 腾讯云 COS 对象存储
│   │   ├── redis/                     # RedisService（ioredis，fail-open）
│   │   ├── prisma/                    # PrismaService 单例
│   │   └── common/                    # 守卫 / 拦截器 / 过滤器 / 测试工具 / json.utils
│   └── prisma/
│       ├── schema.prisma              # 单一数据源
│       └── migrations/                # 迁移文件
│
├── packages/shared/
│   └── src/index.ts                   # 共享枚举（UserRole/ArticleStatus/Platform/...）与接口
│
├── docker-compose.yml                 # dev：仅编排 RSSHub
├── docker-compose.prod.yml            # prod：backend + frontend 容器，通过 env_file 读 backend/.env
└── scripts/update-cms-ng.sh           # 一键部署脚本（备份→pull→build→migrate→restart）
```

---

## 已集成的外部数据源

选题中心（`/trending-topics`）聚合 12 路源，原生 RSS 直连 8 路（海外源受 `RSS_PROXY_ENABLED` 开关控制），RSSHub 代理 4 路（国内源）：

| 类别            | 源                            | 抓取路径                                     | 备注                       |
| --------------- | ----------------------------- | -------------------------------------------- | -------------------------- |
| 趋势            | Google Trends                 | `trends.google.com/trending/rss?geo=HK`      | 支持 HK/TW/US/GB/JP/KR/CN 等地区 |
| 原生 RSS        | 新浪                          | `rss.sina.com.cn/news/china/focus15.xml`     |                            |
| 原生 RSS        | 人民网                        | `people.com.cn/rss/politics.xml`             |                            |
| 原生 RSS        | BBC                           | `feeds.bbci.co.uk/news/rss.xml`              | 海外，需代理               |
| 原生 RSS        | 中新网                        | `chinanews.com/rss/scroll-news.xml`          |                            |
| 原生 RSS        | The Guardian                  | `theguardian.com/world/rss`                  | 海外，需代理               |
| 原生 RSS        | The New York Times            | `rss.nytimes.com/services/xml/rss/nyt/World.xml` | 海外，需代理             |
| 原生 RSS        | The Economist                 | `economist.com/latest/rss.xml`               | 海外，需代理               |
| 原生 RSS        | Financial Times               | `ft.com/rss/home/uk`                         | 海外，需代理               |
| RSSHub 代理     | 联合早报                      | `/zaobao/realtime/china`                     | 原站 `.com.sg/rss/` 已下线 |
| RSSHub 代理     | 36 氪                         | `/36kr/news/latest`                          |                            |
| RSSHub 代理     | 虎嗅                          | `/huxiu/article`                             |                            |
| RSSHub 代理     | 豆瓣热映                      | `/douban/movie/playing`                      |                            |

**代理开关**：`backend/.env` 中的 `RSS_PROXY_ENABLED`（`true` 走大陆代理，`false` 直连，海外生产环境建议 `false`）+ `HTTP_PROXY=...`。RSSHub 本地实例始终不走代理。

**RSSHub 实例**：dev 环境 `docker-compose up -d rsshub` 起在 `localhost:1200`；生产可在独立机器部署，通过 `RSS_HUB_URL` 指向它。

---

## AI 功能

后端通过 `AI_PROVIDER` 抽象层切换（默认 `deepseek`）：

- **选题推荐** — 根据记者专长和近期热点生成个性化选题建议
- **改写** — 调整文章风格或视角
- **扩写** — 扩展段落内容
- **缩写** — 精炼篇幅
- **润色** — 优化语言表达
- **生成标题** — 多选项标题生成
- **生成摘要** — 自动提取文章摘要
- **写作对话** — 与 AI 实时协作写作
- **AI 初稿** — 根据选题/素材直接生成稿件
- **事实核查** — 联网搜索佐证文章论断
- **AI 审稿** — 编辑视角的多维度审阅报告
- **SEO 优化** — 关键词与结构优化建议
- **AI 配图** — 通过 Seedream（字节火山引擎）按提示词生成封面图

所有 AI 输出均需人工审核确认，不会自动发布。

---

## 用户角色

| 角色             | 权限                                 |
| ---------------- | ------------------------------------ |
| REPORTER（记者） | 创建选题、撰写稿件、使用 AI 辅助工具 |
| EDITOR（编辑）   | 审核稿件、分配选题、管理发布流程     |
| ADMIN（管理员）  | 用户管理、系统配置、全部权限         |

---

## 生产部署

项目自带一键部署脚本 `scripts/update-cms-ng.sh`，封装了 **备份 → 拉代码 → 构建 → 数据库迁移 → 重启 → 验证** 的完整链路。

### 1. 部署前必备

| 必备项 | 说明                                                                 |
| ------ | -------------------------------------------------------------------- |
| Docker 与 Docker Compose v2 | 跑 `docker compose`（不是老的 `docker-compose`）                |
| 外部 MySQL 8 实例           | 已建库 `cms_ng`，账号可远程连接                                  |
| 外部 Redis 实例             | 可选密码，URL 通过 `REDIS_URL` 注入                              |
| `backend/.env` 文件        | 必须含 `DATABASE_URL` / `REDIS_URL` / `JWT_SECRET` / 所选 AI Provider 的 API Key |
| `frontend/.env.local` 文件  | 含 `NEXT_PUBLIC_API_URL=https://your-domain.com`                   |
| 服务器 SSH 免密             | 脚本通过 SSH 推送本地构建产物到远程                               |

> 脚本会先 `grep -E "^${var}="` 校验 `backend/.env` 是否含必要变量，缺失即报错退出。

### 2. 执行部署

```bash
# 在本地仓库根目录
bash scripts/update-cms-ng.sh
```

脚本大致流程：

1. 备份 `backend/.env` + 数据库到 `backups/YYYYMMDD-HHMMSS/`
2. `git pull` 拉取最新代码
3. 构建前后端 Docker 镜像
4. `docker compose -f docker-compose.prod.yml up -d` 启动容器
5. `npx prisma migrate deploy` 应用数据库迁移
6. 探活 backend 容器（最多 30s），失败自动回滚
7. `curl http://localhost:3001/users` 验证 API 5xx-free

### 3. 部署后端点

| 端点                                    | 用途                                              |
| --------------------------------------- | ------------------------------------------------- |
| `http://SERVER_IP:3000`                 | 前端（Next.js）                                   |
| `http://SERVER_IP:3001`                 | 后端 API                                          |
| `http://SERVER_IP:1200`（如本机起）     | RSSHub（prod 通常不与 app 同节点）                |

### 4. 容器编排边界

仓库内 Docker Compose 只编排**应用层**，**不编排数据中间件**：

- `docker-compose.yml`（dev）：仅 `rsshub` 一个服务
- `docker-compose.prod.yml`（prod）：仅 `backend` + `frontend` 两个应用容器；后端通过 `env_file: ./backend/.env` 注入配置（**和 dev 用同一份 `backend/.env`**，只是值不同）

MySQL / Redis / （生产环境的）RSSHub 全部视为外部依赖，部署前先准备好，部署脚本不会去拉起它们。

---

## API 文档（Swagger UI）

开发环境下，后端自动挂载 Swagger UI：

- **地址**：`http://localhost:3001/api-docs`
- **认证**：点击页面顶部 Authorize，粘贴 `/auth/login` 返回的 JWT（无需 "Bearer " 前缀）
- **仅在非生产环境挂载**：生产环境（`NODE_ENV=production`）不注册该路由

---

## 许可证

UNLICENSED — 私有项目。
