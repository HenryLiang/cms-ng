# 01 创作大脑（CMS-NG）— 全量功能回归测试计划 v1.0

> 范围：最近 10 个 commit（`1e20a29` ~ `d2b5b3c`）+ 历史 30 个 commit 中未覆盖到的核心路径
> 覆盖：9 个核心业务模块 + 11 项关键回归要点
> 版本：v1.0 | 日期：2026-06-02 | 编写人：QA Lead
> 输入依据：`docs/qa/i18n-regression-test-cases.md`（格式模板）、`docs/testing/wordpress-regression-test-plan.md`（专项）、`docs/test-handoff-ai-*.md`（AI handoff）

---

## 目录

1. [测试范围与策略](#1-测试范围与策略)
2. [测试环境与数据准备](#2-测试环境与数据准备)
3. [风险评估矩阵](#3-风险评估矩阵)
4. [P0 — 自动发布管道（auto-publish）](#4-p0--自动发布管道auto-publish)
5. [P0 — WordPress REST API 发布](#5-p0--wordpress-rest-api-发布)
6. [P0 — AI Provider 解耦（DeepSeek / Kimi / OpenAI）](#6-p0--ai-provider-解耦deepseek--kimi--openai)
7. [P0 — i18n contentLanguage 三层持久化](#7-p0--i18n-contentlanguage-三层持久化)
8. [P0 — Article 状态机全路径](#8-p0--article-状态机全路径)
9. [P0 — JWT 鉴权与刷新](#9-p0--jwt-鉴权与刷新)
10. [P1 — AI 12 项能力](#10-p1--ai-12-项能力)
11. [P1 — Channels 平台分发与适配器](#11-p1--channels-平台分发与适配器)
12. [P1 — Trending-Topics 热点聚合](#12-p1--trending-topics-热点聚合)
13. [P1 — safeJsonParse 全局加固](#13-p1--safejsonparse-全局加固)
14. [P1 — User / RBAC 角色管理](#14-p1--user--rbac-角色管理)
15. [P2 — rebrand（"INFO-NG" → "LC 传媒"）文案一致性](#15-p2--rebrandINFO-NG--lc-传媒文案一致性)
16. [P2 — RSS_PROXY_ENABLED 代理开关](#16-p2--rss_proxy_enabled-代理开关)
17. [P2 — Wikipedia 增强研究](#17-p2--wikipedia-增强研究)
18. [P2 — E2E 跨模块联动](#18-p2--e2e-跨模块联动)
19. [回归测试 — 模块联动矩阵](#19-回归测试--模块联动矩阵)
20. [边界与兼容性测试](#20-边界与兼容性测试)
21. [非功能测试（性能 / 安全 / 兼容性）](#21-非功能测试性能--安全--兼容性)
22. [测试执行 checklist 与人员排期](#22-测试执行-checklist-与人员排期)
23. [执行签到占位](#23-执行签到占位)
24. [附录](#24-附录)

---

## 1. 测试范围与策略

### 1.1 测试范围（9 个核心模块 + 11 项关键要点）

| # | 模块 | 路径 | 回归优先级 | 关联 commit |
|---|------|------|----------|------------|
| M1 | auth（JWT 登录/注册/刷新） | `backend/src/auth/` | P0 | 历史+`13416f5`（rebrand） |
| M2 | users（用户 CRUD、角色） | `backend/src/users/` | P1 | `02a8c7c`（RBAC）+`13416f5` |
| M3 | stories（选题生命周期） | `backend/src/stories/` | P0 | `d2b5b3c`/`6129e32`（i18n） |
| M4 | articles（稿件、版本、审核） | `backend/src/articles/` | P0 | i18n 系列 + rebrand |
| M5 | ai（12 项能力 + 工具注册） | `backend/src/ai/` | P0 | `e96b048`（解耦）+`021ad32`（测试） |
| M6 | channels（多平台适配器） | `backend/src/channels/` | P0/P1 | `63f273b`（WordPress） |
| M7 | auto-publish（自动发布管道） | `backend/src/auto-publish/` | P0 | `1e20a29`（管道+缺陷修复） |
| M8 | trending-topics（热点聚合） | `backend/src/trending-topics/` | P1 | `16ddc6c`（代理开关）+`5470e07`（重构） |
| M9 | redis（缓存 + 瞬态） | `backend/src/redis/` | P1 | 新增模块 |

**11 项关键回归要点** 覆盖确认：

| # | 关键要点 | 章节 | 覆盖状态 |
|---|---------|------|----------|
| K1 | i18n contentLanguage 持久化 | §7 | 已覆盖 |
| K2 | AI Provider 解耦 | §6 | 已覆盖 |
| K3 | WordPress 自动发布 | §5 | 已覆盖 |
| K4 | 自动发布管道 6 步流水线 | §4 | 已覆盖 |
| K5 | safeJsonParse 全局加固 | §13 | 已覆盖 |
| K6 | RSS 代理开关 | §16 | 已覆盖 |
| K7 | rebrand 文案一致性 | §15 | 已覆盖 |
| K8 | Article 状态机 | §8 | 已覆盖 |
| K9 | JWT 鉴权 | §9 | 已覆盖 |
| K10 | 前端 TanStack Query 缓存 | §18 | 已覆盖（联动） |
| K11 | Wikipedia 增强研究 | §17 | 已覆盖 |

### 1.2 测试策略

- **测试模型**：风险驱动（Risk-Based Testing）+ 状态迁移（State Transition）+ 等价类划分 + 边界值分析 + Pairwise
- **测试金字塔**：70% 单元（Jest + Vitest）/ 20% 集成（E2E API + 数据库）/ 10% E2E（Playwright）
- **通过标准**：
  - P0 用例 100% 通过，任一失败即阻塞发布
  - P1 用例 100% 通过，最多允许 1 个非阻塞缺陷
  - P2 用例 ≥ 90% 通过，缺陷记录但不阻塞
  - 模块联动用例 100% 通过
- **数据隔离**：使用独立测试 schema（`cms_ng_test`）或事务回滚，避免污染 dev/prod 数据库
- **Mock 策略**：所有外部依赖（DeepSeek/Kimi/OpenAI/Tavily/WordPress/Google Trends/RSSHub）通过 `nock`/`msw` mock，单测层不直连

### 1.3 工具与方法栈

| 层级 | 工具 | 用途 |
|------|------|------|
| 单元 | Jest（backend） | `*.spec.ts` |
| 单元 | Vitest（frontend） | `*.test.ts`/`*.test.tsx` |
| 集成 | Jest + Supertest | `*.e2e-spec.ts` |
| E2E | Playwright（建议） | 端到端冒烟 |
| 性能 | k6 / autocannon | API 压测 |
| 安全 | OWASP ZAP / sqlmap | 渗透测试 |
| Mock | nock / msw / jest.mock | 外部依赖 |
| 报告 | allure / jest-html-reporter | 测试报告 |

---

## 2. 测试环境与数据准备

### 2.1 环境矩阵

| 环境 | MySQL | Redis | RSSHub | AI Provider | WordPress | 用途 |
|------|-------|-------|--------|-------------|-----------|------|
| Unit | SQLite / mocked Prisma | mocked | — | mocked | mocked | 单元测试 |
| Integration (test) | `cms_ng_test` schema | docker-redis 6379 | docker-rsshub :1200 | mocked | mocked | 集成测试 |
| Staging | `cms_ng_staging` | redis 6379 | docker-rsshub | DeepSeek (test key) | wuququ.com (test) | E2E 冒烟 |
| Pre-prod | `cms_ng_preprod` | redis 6379 | — | Kimi (real) | real WP | 性能/安全 |
| Prod | `cms_ng` | redis 6379 | — | 实际配置 | 实际站点 | 不可直接测试 |

### 2.2 必需配置（`backend/.env`）

```env
# 测试环境特殊配置
DATABASE_URL="mysql://test_user:test_pwd@localhost:3306/cms_ng_test"
REDIS_URL="redis://localhost:6379/1"   # DB 1 隔离
AI_PROVIDER="deepseek"
DEEPSEEK_API_KEY="sk-mock-for-test"    # 由 nock 拦截
RSS_PROXY_ENABLED="true"               # 测试代理分支
HTTP_PROXY="http://127.0.0.1:8888"     # mock proxy server
WORDPRESS_SITE_URL="http://localhost:8080/wp-json/wp/v2"
WORDPRESS_USERNAME="test"
WORDPRESS_APP_PASSWORD="test test test test test test"
SMTP_HOST="smtp4dev"                    # 本地邮件捕获
SMTP_PORT=2525
```

### 2.3 测试账号矩阵

| 账号 | 角色 | preferredLanguage | expertise | 用途 |
|------|------|-------------------|-----------|------|
| admin_lc | ADMIN | TRADITIONAL_CHINESE_HK | `["系统管理"]` | 全权限管理 |
| editor_01 | EDITOR | TRADITIONAL_CHINESE_HK | `["时政","财经"]` | 审核工作流 |
| editor_02 | EDITOR | SIMPLIFIED_CHINESE | `["科技"]` | 跨语言审核 |
| reporter_sc | REPORTER | SIMPLIFIED_CHINESE | `["科技","AI"]` | 中文偏好新建 |
| reporter_en | REPORTER | ENGLISH | `["国际"]` | 英文偏好新建 |
| reporter_default | REPORTER | null | `["体育"]` | 默认回退 |
| reporter_yue | REPORTER | TRADITIONAL_CHINESE_CANTONESE | `["娱乐"]` | 粤语风格验证 |

**统一默认密码**：`123456`（基于 `auth.service.ts` 的 `DEFAULT_PASSWORD_HASH` 硬编码）

### 2.4 预置数据 ID 建议范围

| 表 | 建议 ID 范围 | 数量 | 用途 |
|----|------------|------|------|
| `users` | `00000000-0000-0000-0000-000000000001` ~ `...007` | 7 | 角色矩阵 |
| `stories` | `10000000-...001` ~ `...010` | 10 | 含历史/新数据/不同语言 |
| `articles` | `20000000-...001` ~ `...020` | 20 | 多状态/多版本/多语言 |
| `platform_publishes` | `30000000-...001` ~ `...040` | 40 | 5 平台 × 8 文章 |
| `trending_topics` | `40000000-...001` ~ `...030` | 30 | 3 来源 × 10 |
| `auto_publish_tasks` | `50000000-...001` ~ `...005` | 5 | 调度类型全覆盖 |
| `auto_publish_runs` | `60000000-...001` ~ `...020` | 20 | 4 状态 × 5 |
| `auto_publish_articles` | `70000000-...001` ~ `...030` | 30 | 7 状态 × 5 |

### 2.5 外部依赖 Mock 矩阵

| 外部服务 | Mock 工具 | Mock 文件/位置 | 真实切换命令 |
|---------|----------|---------------|------------|
| DeepSeek API | nock | `test/mocks/deepseek.mock.ts` | `AI_PROVIDER=deepseek` + 真实 key |
| Kimi API | nock | `test/mocks/kimi.mock.ts` | `AI_PROVIDER=kimi` + 真实 key |
| OpenAI API | nock | `test/mocks/openai.mock.ts` | `AI_PROVIDER=openai` + 真实 key |
| Tavily Search | nock | `test/mocks/tavily.mock.ts` | 真实 key |
| WordPress REST | nock / docker-wp | `test/mocks/wordpress.mock.ts` | 真实 `WORDPRESS_*` |
| Google Trends | `google-trends-api` mock | `test/mocks/trends.mock.ts` | 直连 |
| RSSHub (B 站/RSS) | docker-rsshub | — | `RSS_HUB_URL` |
| Wikipedia API | nock | `test/mocks/wikipedia.mock.ts` | 真实 |
| SMTP | smtp4dev | docker | 真实 |

---

## 3. 风险评估矩阵

| # | 风险点 | 概率 | 影响 | 等级 | 缓解策略 |
|---|--------|------|------|------|----------|
| R1 | 自动发布管道可能误发布 | 中 | 严重 | **P0** | 全程 kill switch + dry-run 模式 + 通知 |
| R2 | AI Provider 切换不生效 | 中 | 严重 | **P0** | 启动时自检 + 调用前 sanity check |
| R3 | WordPress 重复发布 | 中 | 中 | **P0** | 检测已发布则改 PUT，否则 POST |
| R4 | i18n 旧数据迁移丢失 | 低 | 严重 | **P0** | 迁移前备份 + 灰度回退 |
| R5 | Article 状态机非法跳转 | 中 | 中 | **P0** | 状态机校验 + 状态历史日志 |
| R6 | JWT 刷新竞态导致 401 风暴 | 中 | 中 | **P0** | refresh token 一次性 + 重试退避 |
| R7 | safeJsonParse 漏改字段引发崩溃 | 中 | 中 | **P1** | 全字段代码扫描 + 模糊测试 |
| R8 | channels 未支持平台（X/THREADS/...）调用崩溃 | 中 | 中 | **P1** | 平台注册中心 + 前端隐藏 |
| R9 | trending-topics 代理切换不生效 | 中 | 低 | **P2** | 单元测试覆盖 + 启动日志 |
| R10 | rebrand 文案残留 | 中 | 低 | **P2** | 全文 grep + UI 截屏比对 |
| R11 | AI prompt 注入导致越权 | 低 | 严重 | **P1** | 输入过滤 + 输出审核（人工 review） |
| R12 | Redis 不可用时锁失效 | 中 | 中 | **P1** | fail-open 行为 + 监控告警 |
| R13 | 5 平台并行发布超时 | 中 | 中 | **P1** | 串行 + 进度反馈 + 重试 |
| R14 | 自动发布 6 步中任意一步失败 | 高 | 中 | **P0** | 每步独立 try-catch + 失败记录 |

---

## 4. P0 — 自动发布管道（auto-publish）

> 关联 commit：`1e20a29`（管道+缺陷修复）/ `e96b048`（AI 解耦）/ `63f273b`（WordPress）
> 涉及文件：`backend/src/auto-publish/{auto-publish.service.ts, auto-publish-scheduler.service.ts, pipeline/*}`
> 前端：`frontend/src/app/dashboard/auto-publish/{page.tsx, [id]/page.tsx, runs/[id]/page.tsx}`

### 4.1 任务生命周期

#### TC-AP-001: 创建自动发布任务

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **前置条件** | 以 admin_lc 登录；数据库无 `AutoPublishTask` |
| **测试步骤** | 1. POST `/auto-publish/tasks` body 含 `name, scheduleType=FIXED_TIME, scheduleConfig.times=["08:00","20:00"], scheduleConfig.timezone="Asia/Hong_Kong", topicStrategy, contentConfig, filterConfig, publishConfig, batchSize=1, retryConfig`<br>2. 数据库查询 `auto_publish_tasks`<br>3. 验证返回字段 |
| **预期结果** | 1. HTTP 201<br>2. `status = PAUSED`（始终暂停，需手动激活）<br>3. JSON 字段（scheduleConfig/topicStrategy/contentConfig/filterConfig/publishConfig/retryConfig）已 stringify 存库<br>4. `lastRunAt=null, nextRunAt=已计算` |
| **实际结果** | _（待执行填写）_ |
| **关联 commit** | `1e20a29` |
| **自动化** | Jest e2e（API）+ Playwright 冒烟 |

#### TC-AP-002: 启动任务 → Cron 注册

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **前置条件** | TC-AP-001 已完成；任务处于 PAUSED |
| **测试步骤** | 1. PATCH `/auto-publish/tasks/{id}/toggle` 激活<br>2. 观察后端日志 "Registered cron job: {name} at 08:00 (Asia/Hong_Kong)"<br>3. 数据库查询 `lastRunAt=null, nextRunAt=下一次 08:00 HK 时间` |
| **预期结果** | 1. HTTP 200，状态变为 ACTIVE<br>2. SchedulerRegistry 中存在 `auto-publish-{id}-0` 和 `auto-publish-{id}-1`<br>3. 任务列表页面 UI 显示「运行中」状态 |
| **关联 commit** | `1e20a29` |

#### TC-AP-003: 三种 ScheduleType 全部生效

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | Pairwise：`ScheduleType ∈ {FIXED_TIME, INTERVAL, CRON}` × `timezone ∈ {Asia/Hong_Kong, Asia/Shanghai, UTC}`（共 6 组合）<br>逐个创建并激活任务，验证 Cron 注册成功 |
| **预期结果** | 1. FIXED_TIME 正确转换为 cron（如 `08:00` → `0 0 8 * * *`）<br>2. INTERVAL 转换为 `0 */N * * *` 形式<br>3. CRON 直接透传用户表达式<br>4. 时区正确传递到 `CronJob(timezone)` |
| **关联 commit** | `1e20a29` |

#### TC-AP-004: 非法时间格式拒绝

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | scheduleConfig.times = `["25:00", "abc", "8:00 AM"]` 逐个测试 |
| **预期结果** | 1. "25:00" 应被 DTO 校验拒绝（HTTP 400）<br>2. 已创建的任务中包含非法 time 时，注册时输出 "Invalid time format" 警告但不影响其他时间 |
| **关联 commit** | `1e20a29` |

### 4.2 手动触发与并发控制

#### TC-AP-005: 手动触发立即执行

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. POST `/auto-publish/tasks/{id}/run`<br>2. 等待 5 秒<br>3. 查询 `auto_publish_runs` |
| **预期结果** | 1. HTTP 202 `{message: "Manual run triggered", taskId}`（异步不阻塞）<br>2. 新建 `AutoPublishRun` 记录，`status=RUNNING, triggerType=MANUAL`<br>3. `auto_publish_articles` 中创建 `batchSize` 条 PENDING 记录 |
| **关联 commit** | `1e20a29` |

#### TC-AP-006: 并发触发去重

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. 手动触发 1 次<br>2. 立即（在 pipeline 仍在执行时）再次手动触发<br>3. 查询 `auto_publish_runs` |
| **预期结果** | 1. 第 1 次创建 run 记录<br>2. 第 2 次返回 HTTP 202 但不创建新 run（Redis 锁 `lock:auto-publish:task:{id}` 存在）<br>3. 日志 "Task is already running — skipping duplicate trigger" |
| **关联 commit** | `1e20a29` |
| **数据依赖** | Redis 必须可用，TTL=600s |

#### TC-AP-007: Kill Switch 全局停止

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. POST `/auto-publish/kill-switch` `{enabled: true}`<br>2. 手动触发任意 ACTIVE 任务<br>3. 查询 run 记录<br>4. 再次 POST kill-switch disable<br>5. 再次手动触发 |
| **预期结果** | 1. Redis key `auto-publish:kill-switch = "true"`<br>2. 第二次手动触发不创建 run（日志 "Kill switch active — skipping"）<br>3. 第四次 disable 后能正常创建 run |
| **关联 commit** | `1e20a29` |

#### TC-AP-008: 重启后调度恢复

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. 激活 2 个任务<br>2. 重启后端服务（`Ctrl+C` → `npm run start:dev`）<br>3. 启动日志查询<br>4. 等待下一个 cron 时间点 |
| **预期结果** | 1. `onModuleInit` 调用 `loadActiveTasks()`<br>2. 日志 "Found N active auto-publish tasks"<br>3. 所有 ACTIVE 任务的 cron 重新注册<br>4. 下个时间点能正常触发 |
| **关联 commit** | `1e20a29` |

### 4.3 6 步流水线

#### TC-AP-009: 全流程成功路径（PENDING → PUBLISHED）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | TopicStrategy.useTrending=false, fixedKeywords=["AI"]; ContentConfig.style="news", maxLength=1000, language="TRADITIONAL_CHINESE_HK"; PublishConfig.platform="WEBSITE" |
| **测试步骤** | 1. 手动触发 1 次<br>2. 实时观察 `auto_publish_articles.status` 字段变化<br>3. 完成后查询 `articles` 表和 `platform_publishes` 表 |
| **预期结果** | 状态机按序迁移：PENDING → TOPIC_SELECTED → RESEARCHED → DRAFTED → IMAGED → SAVED → PUBLISHED<br>1. topic 字段已填充<br>2. articleId 指向新建 Article<br>3. platformPublishId 指向新建 PlatformPublish（status=PUBLISHED）<br>4. Run 状态=COMPLETED, successCount=1, failedCount=0 |
| **关联 commit** | `1e20a29` |

#### TC-AP-010: 第 3 步（article-generation）失败

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | Mock DeepSeek 在 article-generation 步骤返回 500 |
| **测试步骤** | 手动触发，等待完成 |
| **预期结果** | 1. AutoPublishArticle 状态=FAILED, failedStep="article-generation"<br>2. errorMessage 含 "AI service unavailable"<br>3. Run 状态=FAILED, failedCount=1<br>4. 不会创建 Article 记录（除非前序步骤保存过） |
| **关联 commit** | `1e20a29` |

#### TC-AP-011: 中途失败 → Article 标记 PIPELINE_FAILED

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | Mock PublishStep（WordPress）失败，但 article-save 已成功 |
| **测试步骤** | 手动触发 |
| **预期结果** | 1. 5 步（topic/research/draft/save/image）均成功<br>2. publish 失败 → AutoPublishArticle.status=FAILED, failedStep="publish"<br>3. ctx.savedArticleId 存在 → Article.status=PIPELINE_FAILED<br>4. errorLog 包含 "Publish failed" |
| **关联 commit** | `1e20a29` |

#### TC-AP-012: 批处理（batchSize=3）顺序处理

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | batchSize=3，触发后观察 3 条 AutoPublishArticle 记录 |
| **预期结果** | 1. 3 条记录依次处理（不是并发）<br>2. 全部 COMPLETED 时 Run 状态=COMPLETED, successCount=3<br>3. 部分失败时 Run 状态=PARTIAL |
| **关联 commit** | `1e20a29` |

#### TC-AP-013: 重试策略生效

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试数据** | retryConfig.maxRetries=2, retryDelayMs=1000 |
| **测试步骤** | Mock 研究步骤前 1 次失败、第 2 次成功 |
| **预期结果** | 1. 第 1 次失败后等待 1s 重试<br>2. 第 2 次成功，整体 successCount+1<br>3. retryCount 字段记录 |
| **关联 commit** | `1e20a29` |

#### TC-AP-014: 通知步骤（notification）SMTP 失败

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试数据** | SMTP 配置错误 |
| **测试步骤** | 触发一次，run 完成后 |
| **预期结果** | 1. 通知失败不影响 run 状态（应仍为 COMPLETED）<br>2. 错误日志记录 SMTP 失败但不阻塞 |
| **关联 commit** | `1e20a29` |

#### TC-AP-015: Trending Topics 模式

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试数据** | topicStrategy.useTrending=true, trendingSources=["google-trends", "google_news"] |
| **测试步骤** | 触发任务 |
| **预期结果** | 1. TopicCollectionStep 调用 AIService.getTrendingTopics<br>2. 选取得分最高的 topic 作为新文章主题<br>3. 当 trending 源不可用时使用 fixedKeywords 降级 |
| **关联 commit** | `1e20a29` |

### 4.4 前端 UI

#### TC-AP-016: 任务列表页加载

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 访问 `/dashboard/auto-publish` |
| **预期结果** | 1. 显示所有任务卡片，含 name/status/调度/schedule/创建者<br>2. 顶部统计：总数、运行中、暂停、错误数<br>3. Kill Switch 全局开关可见<br>4. TanStack Query 缓存 5 分钟内不重新请求 |
| **关联 commit** | `1e20a29` |

#### TC-AP-017: 任务详情页（运行历史）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 访问 `/dashboard/auto-publish/{id}` |
| **预期结果** | 1. 显示 6 步 pipeline 流程图<br>2. 最近 10 次运行列表（status/triggerType/successCount/failedCount/startedAt）<br>3. 单击 run 跳转 `/dashboard/auto-publish/runs/{runId}` |
| **关联 commit** | `1e20a29` |

#### TC-AP-018: 任务运行详情（文章级追踪）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 访问 `/dashboard/auto-publish/runs/{id}` |
| **预期结果** | 1. 显示该 run 下所有 AutoPublishArticle 记录<br>2. 每条显示状态、topic、failedStep、errorMessage、retryCount<br>3. 失败的文章有红色 badge 和「查看错误」按钮<br>4. 成功的文章有链接跳到 Article 详情 |
| **关联 commit** | `1e20a29` |

#### TC-AP-019: 创建任务表单

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. 点击「+ 新建任务」<br>2. 填写表单所有字段<br>3. 提交 |
| **预期结果** | 1. 表单含 5 个 step（基础/调度/选题/内容/发布）<br>2. 必填项校验：name, scheduleType, scheduleConfig.times, contentConfig.style, publishConfig.platform<br>3. maxLength 限制 100-5000<br>4. 提交后跳转详情页并显示成功提示 |
| **关联 commit** | `1e20a29` |

#### TC-AP-020: 删除任务确认弹窗

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试步骤** | 点击「删除」按钮 |
| **预期结果** | 1. 弹出 `confirm()` 对话框（"确定删除这个任务？删除后不可恢复"）<br>2. 取消则无操作<br>3. 确认则删除并自动 unregister cron job |
| **关联 commit** | `1e20a29` |

---

## 5. P0 — WordPress REST API 发布

> 关联 commit：`63f273b`（WordPress REST + safeJsonParse + fetch 超时）
> 复用 `docs/testing/wordpress-regression-test-plan.md` 17 个用例 + 本计划补充 6 个新用例
> 涉及文件：`backend/src/channels/{wordpress.service.ts, platforms/adapters/wordpress.adapter.ts}`

### 5.1 适配内容生成

#### TC-WP-001: AI 生成 WordPress 适配内容

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **前置条件** | 文章处于 APPROVED 或 DRAFT 状态，有 title/content/excerpt |
| **测试步骤** | 1. POST `/channels/{articleId}/adapt-content` body `{platform: "WORDPRESS"}`<br>2. 等待 3-10s<br>3. GET `/channels/{articleId}/publishes` 验证 |
| **预期结果** | 1. 创建 PlatformPublish 记录，platform=WORDPRESS, status=GENERATING→READY<br>2. adaptedTitle ≤ 200 字符<br>3. adaptedContent 含 `<h2>/<h3>/<p>` 等 HTML 标签<br>4. adaptedExcerpt 120-160 字<br>5. adaptedTags 3-5 个 |
| **关联 commit** | `63f273b` |

#### TC-WP-002: validate() 标题长度边界

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 生成 200 字符、201 字符标题 |
| **预期结果** | 200 字符通过；201 字符返回 "标题超过 200 字限制" |
| **关联 commit** | `63f273b` |

### 5.2 发布与重试

#### TC-WP-003: 直接发布（wpStatus=publish）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | POST `/channels/{articleId}/publish-wordpress` body `{wpStatus: "publish"}` |
| **预期结果** | 1. PlatformPublish.status=PUBLISHED<br>2. publishedUrl 包含 `https://wuququ.com/...`<br>3. publishedAt 字段填充<br>4. WordPress 后台可见文章（featured_media 已设置） |
| **关联 commit** | `63f273b` |

#### TC-WP-004: 草稿模式（wpStatus=draft）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | POST `/channels/{articleId}/publish-wordpress` body `{wpStatus: "draft"}` |
| **预期结果** | 1. WordPress 后台文章状态=draft<br>2. 前台不可访问（404）<br>3. PlatformPublish.status=PUBLISHED（业务层视为已发布到草稿） |
| **关联 commit** | `63f273b` |

#### TC-WP-005: 重复发布不更新

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 发布成功后重新生成适配并再次发布 |
| **预期结果** | 1. 旧 WP 文章保留<br>2. 新 WP 文章创建（新 post ID）<br>3. publishedUrl 指向新文章 |
| **关联 commit** | `63f273b`（已修复 D3 重复发布问题，但行为是创建新文章） |
| **建议** | 增加 post ID 字段以支持 PUT 更新（需求确认中） |

#### TC-WP-006: 标签自动创建与复用

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. WP 后台删除所有 `回归测试2026` 标签<br>2. 适配并发布含该标签的文章 |
| **预期结果** | 1. WP 后台自动创建 `回归测试2026` 标签<br>2. 第二次发布时复用已有标签（不重复创建）<br>3. resolveTags() 的 search-then-create 逻辑生效 |
| **关联 commit** | `63f273b` |

#### TC-WP-007: 封面图上传成功

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | article.coverImage 指向可达 HTTPS 图片 |
| **测试步骤** | 发布文章 |
| **预期结果** | 1. 上传到 `/wp-json/wp/v2/media` 返回 media ID<br>2. 文章 featured_media 设置为该 ID<br>3. WP 后台显示特色图片 |
| **关联 commit** | `63f273b` |

#### TC-WP-008: 封面图 404 降级发布

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | coverImage = `https://example.com/nonexistent.jpg` |
| **测试步骤** | 发布 |
| **预期结果** | 1. publish 成功<br>2. 日志 "Failed to download image: https://example.com/nonexistent.jpg" warn 级别<br>3. WP 文章 featured_media=0 |
| **关联 commit** | `63f273b` |

#### TC-WP-009: 无封面图发布

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | article.coverImage = null，发布 |
| **预期结果** | 1. publish 成功<br>2. skip uploadImage 步骤<br>3. WP featured_media=0 |
| **关联 commit** | `63f273b` |

#### TC-WP-010: fetch 超时（30s）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | WORDPRESS_SITE_URL 指向黑洞地址（如 `192.0.2.1`） |
| **测试步骤** | 发布文章，计时 |
| **预期结果** | 1. 30s 后 AbortController 触发<br>2. PlatformPublish.status=FAILED<br>3. notes 字段含 "AbortError" 或 "timeout"<br>4. 不挂起超过 30s |
| **关联 commit** | `63f273b` |

### 5.3 异常路径

#### TC-WP-011: 凭据未配置

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | WORDPRESS_SITE_URL/username/appPassword 全部留空 |
| **测试步骤** | 发布文章 |
| **预期结果** | HTTP 400 "WordPress 配置不完整，请设置 WORDPRESS_SITE_URL、WORDPRESS_USERNAME 和 WORDPRESS_APP_PASSWORD 环境变量" |
| **关联 commit** | `63f273b` |

#### TC-WP-012: 凭据无效（401）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | WORDPRESS_APP_PASSWORD 错误值 |
| **测试步骤** | 发布 |
| **预期结果** | HTTP 400 "WordPress 发布失败: WordPress API 错误 (401): ..."<br>PlatformPublish.status=FAILED, notes 包含错误详情 |
| **关联 commit** | `63f273b` |

#### TC-WP-013: 文章不存在

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | POST `/channels/{invalid-uuid}/publish-wordpress` |
| **预期结果** | HTTP 400 "文章不存在" |
| **关联 commit** | `63f273b` |

#### TC-WP-014: 无适配内容直接发布

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 文章未生成适配，调用 publish-wordpress |
| **预期结果** | HTTP 400 "请先生成 WordPress 适配内容" |
| **关联 commit** | `63f273b` |

#### TC-WP-015: 适配内容状态不正确

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | PlatformPublish.status=GENERATING（生成中） |
| **测试步骤** | publish-wordpress |
| **预期结果** | HTTP 400 "适配内容未就绪，请先生成或重新生成" |
| **关联 commit** | `63f273b` |

#### TC-WP-016: wpStatus 非法值

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | body `{wpStatus: "scheduled"}` |
| **预期结果** | DTO 校验失败，HTTP 400（@IsIn(['publish', 'draft'])） |
| **关联 commit** | `63f273b` |

#### TC-WP-017: adaptedTags 非法 JSON（D1 历史缺陷验证）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | 手动将 DB 中 `adaptedTags` 改为 `{broken` |
| **测试步骤** | publish-wordpress |
| **预期结果** | **期望（已修复）**：safeJsonParse 捕获异常，降级为 `[]` 数组，发布继续<br>**实际验证**：日志 "adaptedTags JSON parse failed, fallback to []"<br>PlatformPublish.status=PUBLISHED，tags 为空数组 |
| **关联 commit** | `63f273b`（safeJsonParse 加固） |
| **风险** | 此为历史 D1 缺陷的核心验证，必须确保已修复 |

#### TC-WP-018: publishedUrl 超长（VARCHAR 500）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | 中文标题 50+ 字符，WP permalink 编码后超 200 字符 |
| **测试步骤** | 发布后 DB 查询 publishedUrl |
| **预期结果** | 1. publishedUrl 完整存储（VARCHAR 500）<br>2. 长度 < 500 字符不报错<br>3. DB migration 已应用 |
| **关联 commit** | `63f273b`（migration 191→500） |

### 5.4 前端平台分发

#### TC-WP-019: ChannelPanel 加载 WordPress 按钮

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 进入文章详情，查看平台分发面板 |
| **预期结果** | 1. WordPress 按钮可见（PLATFORM_ICONS 映射正确）<br>2. 点击后显示 loading<br>3. 完成后显示预览卡片（标题/摘要/标签/封面图） |
| **关联 commit** | `13416f5`（rebrand 确保 PLATFORM_NAMES 含 WordPress） |

#### TC-WP-020: 多平台并行预览

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 同一文章同时生成 WordPress + Facebook + 小红书适配 |
| **预期结果** | 1. 3 个平台独立生成（不互阻塞）<br>2. 各预览卡片独立显示<br>3. publishing 状态建议按 platform 隔离（D4） |
| **关联 commit** | `63f273b`（D4 已知缺陷，建议前端按 platform 拆分 state） |

---

## 6. P0 — AI Provider 解耦（DeepSeek / Kimi / OpenAI）

> 关联 commit：`e96b048`（AI 模块解耦）/`021ad32`（测试补全）/`00ffa4a`（DeepSeek 默认）
> 涉及文件：`backend/src/ai/{ai.service.ts, providers/*, ai.module.ts}`

### 6.1 Provider 工厂与切换

#### TC-AI-PRV-001: 三种 Provider 启动注入

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | Pairwise：`AI_PROVIDER ∈ {deepseek, kimi, openai}` × 有效 key（每组合 1 次启动） |
| **预期结果** | 1. 启动日志 "AI Provider initialized: {providerName}"<br>2. AIService.chatCompletion() 调用正确 provider<br>3. providerName 与 model 字段正确 |
| **关联 commit** | `e96b048` |

#### TC-AI-PRV-002: 缺少 API Key 启动失败

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | DEEPSEEK_API_KEY 为空字符串 |
| **测试步骤** | 启动后端 |
| **预期结果** | 1. 不崩溃（OpenAICompatibleProvider 容错）<br>2. 首次调用时抛 "DEEPSEEK_API_KEY not configured"<br>3. 记录 warn 日志 |
| **关联 commit** | `e96b048` |

#### TC-AI-PRV-003: ChatCompletionRequest 完整字段

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 单元测试：传入完整 ChatCompletionRequest（含 temperature, response_format, tools, max_tokens） |
| **预期结果** | 所有字段正确传递到底层 HTTP 请求（OpenAI 兼容协议） |
| **关联 commit** | `e96b048` |

#### TC-AI-PRV-004: chatCompletionWithTools 工具调用循环

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | 注册 TavilySearchTool；Mock LLM 返回 tool_calls → 再返回最终 answer |
| **测试步骤** | 调用 `chatCompletionWithTools` 触发 search 场景 |
| **预期结果** | 1. 第 1 轮 LLM 返回 tool_call → executeTool('tavily_search', {...})<br>2. 第 2 轮 LLM 收到 tool result → 返回最终 content<br>3. 循环在 maxRounds 内终止（默认 5） |
| **关联 commit** | `e96b048` |

### 6.2 12 项 AI 能力调用链路

> AI 12 项能力：rewrite / expand / condense / polish / generate-headlines / generate-excerpt / chat / generate-draft / fact-check / research-kit / review-report / seo-optimize
> 关联：见 `docs/test-handoff-ai-fact-check.md` 和 `docs/test-handoff-ai-research-kit.md`

#### TC-AI-PRV-005: 12 项 AI 操作 AIOperation 日志完整性

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | 准备 1 篇 DRAFT 文章，依次执行 12 项 AI 操作 |
| **测试步骤** | 每项操作后查询 `ai_operations` 表 |
| **预期结果** | 1. 每项操作产生 1 条 AIOperation 记录<br>2. `agentType` 字段映射正确（STORY/RESEARCH/WRITING/EDITOR/REVIEW/VISUAL/DISTRIBUTE）<br>3. `model` 字段记录 provider.model<br>4. `durationMs` 大于 0<br>5. `tokensUsed` 正确（若 provider 返回 usage） |
| **关联 commit** | `021ad32` |
| **自动化** | Jest 单测 `ai.service.spec.ts` 已有 1384 行 |

#### TC-AI-PRV-006: language 参数贯穿 12 项能力

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | `ContentLanguage = SIMPLIFIED_CHINESE` |
| **测试步骤** | 依次调用 12 项 AI 操作 |
| **预期结果** | 1. 每项操作的 prompt 含 "请用简体中文输出"<br>2. LLM 响应语言为简体中文（人工抽检 3 项）<br>3. AIOperation.action 含 language 标识 |
| **关联 commit** | `021ad32` |

### 6.3 工具注册表

#### TC-AI-PRV-007: AIToolsService 注册 Tavily

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 单元测试：调用 `getToolsForProvider()` |
| **预期结果** | 1. SEARCH_PROVIDER=tavily → 返回 TavilySearchTool<br>2. SEARCH_PROVIDER=kimi + AI_PROVIDER=kimi → 返回 Kimi 工具<br>3. 其他情况返回空数组 |
| **关联 commit** | `e96b048` |

#### TC-AI-PRV-008: 工具异常降级

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试数据** | Mock Tavily 返回 500 |
| **测试步骤** | 调用 `generateResearchKit` |
| **预期结果** | 1. 不抛未捕获异常<br>2. 返回空资料包或带错误信息的结果（`a6080a8` 已修复）<br>3. AIOperation.result 记录错误 |
| **关联 commit** | `a6080a8` + `7750144`（降级策略） |

### 6.4 Seedream 图像生成

#### TC-AI-PRV-009: Seedream API 调用

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | POST `/ai/generate-image` body `{prompt, size}` |
| **预期结果** | 1. 调用 SEEDREAM_API_BASE/images/generations<br>2. 返回图片 URL 数组<br>3. 无 SEEDREAM_API_KEY 时返回友好错误 |
| **关联 commit** | `eb750bd` |

---

## 7. P0 — i18n contentLanguage 三层持久化

> 关联 commit：`d2b5b3c` / `6129e32` / `9c7692e`（i18n 持久化）
> 详细基础用例见 `docs/qa/i18n-regression-test-cases.md`（共 35 个用例）
> 本节补充跨模块回归验证

### 7.1 复用 i18n 文档核心用例

| 用例 ID | 标题 | 优先级 | 复用来源 |
|---------|------|--------|----------|
| TC-I18N-001 | 选题语言切换后保存并刷新 | P0 | i18n TC-P0-001 |
| TC-I18N-002 | 选题语言切换后直接 AI 操作后保存 | P0 | i18n TC-P0-002 |
| TC-I18N-003 | 稿件语言切换后保存并刷新 | P0 | i18n TC-P0-003 |
| TC-I18N-004 | 稿件提交审核时语言保持 | P0 | i18n TC-P0-004 |
| TC-I18N-005 | API 直接更新选题语言 | P0 | i18n TC-P0-005 |
| TC-I18N-006 | API 直接更新稿件语言 | P0 | i18n TC-P0-006 |
| TC-I18N-007 | 传入非法语言值 | P1 | i18n TC-P0-007 |
| TC-I18N-008 | 传入空语言值 | P1 | i18n TC-P0-008 |
| TC-I18N-009 ~ 012 | 用户偏好新建默认 | P1 | i18n TC-P1-007~012 |
| TC-I18N-013 ~ 017 | 列表页语言标识 | P2 | i18n TC-P2-001~005 |
| TC-I18N-018 ~ 021 | 粤语风格 AI | P2 | i18n TC-P2-006~009 |
| TC-I18N-022 | 三层架构联动 | P0 | i18n TC-REG-001 |
| TC-I18N-023 | 偏好修改不影响已有内容 | P1 | i18n TC-REG-002 |
| TC-I18N-024 | 12 项 AI 全部使用当前语言 | P1 | i18n TC-REG-003 |
| TC-I18N-025 | 切换语言后 AI 输出立即变化 | P1 | i18n TC-REG-004 |
| TC-I18N-026 | 版本历史语言信息一致性 | P1 | i18n TC-REG-005 |
| TC-I18N-027 | 旧数据加载 | P1 | i18n TC-BDY-001 |
| TC-I18N-028 | 旧数据修改后持久化 | P1 | i18n TC-BDY-002 |
| TC-I18N-029 | 快速切换并发 | P2 | i18n TC-BDY-003 |
| TC-I18N-030 | 网络中断后保存 | P2 | i18n TC-BDY-004 |
| TC-I18N-031 | 跨角色查看语言 | P1 | i18n TC-BDY-005/006 |

### 7.2 跨模块回归（新增）

#### TC-I18N-032: 迁移前旧数据无 contentLanguage 字段处理

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | stories/articles 中 contentLanguage=null（迁移前数据） |
| **测试步骤** | 1. 启动后端（不主动迁移）<br>2. 查询列表 API<br>3. 编辑选题/稿件 |
| **预期结果** | 1. 列表 API 正常返回（contentLanguage=null）<br>2. 编辑器 UI 显示默认「繁体中文（香港）」<br>3. 首次保存后字段填充为具体值 |
| **关联 commit** | `d2b5b3c` |

#### TC-I18N-033: 自动发布任务 contentConfig.language 校验

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 创建自动发布任务，contentConfig.language="INVALID_LANG" |
| **预期结果** | 1. DTO 校验失败（HTTP 400）<br>2. 数据库不写入 |
| **关联 commit** | `1e20a29`（auto-publish 创建时需验证 language） |

#### TC-I18N-034: WordPress 适配内容语言与稿件一致

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 1. 英文文章 → 生成 WordPress 适配<br>2. 验证 adaptedTitle/Content 均为英文 |
| **预期结果** | 1. adaptedContent 语言 = article.contentLanguage<br>2. AI prompt 含 "请用英文输出" |
| **关联 commit** | `63f273b` |

#### TC-I18N-035: 自动发布文章语言与任务配置一致

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试数据** | task.contentConfig.language = "ENGLISH" |
| **测试步骤** | 触发任务 |
| **预期结果** | 1. 生成的 article.contentLanguage = ENGLISH<br>2. AI 资料/初稿/SEO 均输出英文 |
| **关联 commit** | `1e20a29` |

---

## 8. P0 — Article 状态机全路径

> 状态：`DRAFT → WRITING → AI_OPTIMIZING → PENDING_REVIEW → IN_REVIEW → APPROVED → PUBLISHED → ARCHIVED` + `REVISION`（回退）+ `PIPELINE_FAILED` + `AUTO_PUBLISHED`
> 关联 commit：状态机历史稳定，本期主要回归 auto-publish 引入的新状态 `PIPELINE_FAILED` / `AUTO_PUBLISHED`

### 8.1 正常路径

#### TC-ART-001: DRAFT → WRITING

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | PATCH `/articles/{id}/status` `{status: "WRITING"}` |
| **预期结果** | 1. 状态变为 WRITING<br>2. 仅作者或编辑可操作<br>3. 审计日志记录 |

#### TC-ART-002: WRITING → AI_OPTIMIZING

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 调用任意 AI 操作（如 rewrite） |
| **预期结果** | 1. 状态自动切到 AI_OPTIMIZING<br>2. AI 完成后回退 WRITING 或继续流转 |

#### TC-ART-003: AI_OPTIMIZING → PENDING_REVIEW

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 点击「提交审核」按钮 |
| **预期结果** | 1. 状态切到 PENDING_REVIEW<br>2. 触发通知给指派编辑 |

#### TC-ART-004: PENDING_REVIEW → IN_REVIEW

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 编辑点击「开始审核」 |
| **预期结果** | 1. 状态切到 IN_REVIEW<br>2. editorId 填充 |

#### TC-ART-005: IN_REVIEW → APPROVED

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 编辑点击「通过」 |
| **预期结果** | 1. 状态切到 APPROVED<br>2. 通知作者 |

#### TC-ART-006: APPROVED → PUBLISHED

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 点击「发布」 |
| **预期结果** | 1. 状态切到 PUBLISHED<br>2. publishedAt 填充<br>3. 触发平台分发（channels） |

#### TC-ART-007: PUBLISHED → ARCHIVED

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 点击「归档」 |
| **预期结果** | 1. 状态切到 ARCHIVED<br>2. 平台分发仍保留（不再推送） |

### 8.2 异常路径（回退）

#### TC-ART-008: IN_REVIEW → REVISION

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 编辑点击「退回修改」+ 备注 |
| **预期结果** | 1. 状态切到 REVISION<br>2. 通知作者带备注 |

#### TC-ART-009: REVISION → WRITING

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 作者修改后重新提交 |
| **预期结果** | 1. 状态切到 PENDING_REVIEW<br>2. 审核历史记录保留 |

### 8.3 自动发布相关新状态

#### TC-ART-010: PIPELINE_FAILED 状态

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 触发自动发布任务，强制中途失败（见 TC-AP-011） |
| **预期结果** | 1. 状态切到 PIPELINE_FAILED<br>2. 列表页有红色 badge<br>3. 可手动改回 DRAFT 继续编辑 |

#### TC-ART-011: AUTO_PUBLISHED 状态

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 自动发布任务完整成功（TC-AP-009） |
| **预期结果** | 1. 状态切到 AUTO_PUBLISHED（不是 PUBLISHED，区分人工/自动）<br>2. 列表页显示「自动发布」标签 |

### 8.4 非法跳转拒绝

#### TC-ART-012: 状态机非法跳转（Pairwise）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | 当前状态枚举 × 目标状态枚举，共 10×10=100 组合 |
| **测试步骤** | 对每个非合法转换尝试 PATCH status |
| **预期结果** | 1. 合法转换通过<br>2. 非法转换返回 HTTP 400 或 422，附错误信息<br>3. 数据库状态不变 |

#### TC-ART-013: 权限校验（REPORTER 不可审批）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | reporter_sc 试图 PATCH status=APPROVED |
| **预期结果** | HTTP 403 Forbidden |

---

## 9. P0 — JWT 鉴权与刷新

> 关联 commit：历史稳定，rebrand 不影响
> 涉及：`backend/src/auth/{auth.service.ts, jwt.strategy.ts, jwt-auth.guard.ts}`

### 9.1 登录与注册

#### TC-AUTH-001: 登录成功

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | POST `/auth/login` `{email, password: "123456"}` |
| **预期结果** | 1. HTTP 200<br>2. 返回 `accessToken`（JWT，7d 过期）<br>3. 返回 user 对象（不含 passwordHash） |

#### TC-AUTH-002: 错误密码

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | POST `/auth/login` 错误密码 |
| **预期结果** | HTTP 401 "Invalid credentials" |

#### TC-AUTH-003: 用户不存在

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | POST `/auth/login` 不存在的 email |
| **预期结果** | HTTP 401 "Invalid credentials"（不区分密码错/用户不存在，防枚举） |

#### TC-AUTH-004: 注册默认密码

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | POST `/auth/register` 新邮箱 |
| **预期结果** | 1. 密码固定为 `123456`（开发测试环境）<br>2. 返回 accessToken<br>3. user.preferredLanguage = TRADITIONAL_CHINESE_HK（默认） |

#### TC-AUTH-005: 重复邮箱注册

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | POST `/auth/register` 已存在邮箱 |
| **预期结果** | HTTP 409 "Email already registered" |

### 9.2 Token 验证

#### TC-AUTH-006: 有效 Token 访问

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | GET `/auth/me` 带 `Authorization: Bearer {token}` |
| **预期结果** | HTTP 200，返回当前用户 |

#### TC-AUTH-007: 缺失 Token

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | GET `/auth/me` 无 Authorization |
| **预期结果** | HTTP 401 |

#### TC-AUTH-008: 过期 Token

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | JWT_EXPIRES_IN="1s"，登录后等待 2s 再请求 |
| **预期结果** | HTTP 401 "jwt expired" |

#### TC-AUTH-009: 伪造 Token

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 篡改 token 最后一个字符 |
| **预期结果** | HTTP 401 "invalid signature" |

#### TC-AUTH-010: 错误算法 Token

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试数据** | 用 `none` 算法签名的 token |
| **预期结果** | HTTP 401 |

### 9.3 RBAC

#### TC-AUTH-011: REPORTER 越权访问

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | reporter_sc 调用 PATCH `/users/{other-user-id}/role` |
| **预期结果** | HTTP 403 Forbidden（RolesGuard 拦截） |

#### TC-AUTH-012: EDITOR 审核他人文章

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | editor_01（非指派编辑）试图 PATCH article status=APPROVED |
| **预期结果** | HTTP 403 或 400（视实现） |

#### TC-AUTH-013: ADMIN 全权限

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | admin_lc 调用所有 API 端点 |
| **预期结果** | 全部通过 |

### 9.4 前端 Token 持久化

#### TC-AUTH-014: Token 持久化

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. 登录后查看 localStorage<br>2. 刷新页面<br>3. 关闭浏览器再打开 |
| **预期结果** | 1. localStorage 包含 `auth-store`（Zustand persist）<br>2. 刷新后 `_hasHydrated=true` 避免登录态闪烁<br>3. 关闭重开仍保持登录 |

#### TC-AUTH-015: 401 自动跳转登录

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. 登录后访问受限页面<br>2. 在 DevTools 删除 token<br>3. 点击任意需要认证的按钮 |
| **预期结果** | axios interceptor 检测到 401 → 重定向到 `/login` |

#### TC-AUTH-016: 401 循环防护

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 在 `/login` 页面观察网络请求 |
| **预期结果** | 登录页面本身不触发 `/auth/me`（避免登录页 401 循环重定向） |

---

## 10. P1 — AI 12 项能力

> 详见 `docs/test-handoff-ai-fact-check.md` 和 `docs/test-handoff-ai-research-kit.md`
> 本节按 12 项能力逐项给出测试关注点

| # | 能力 | API 端点 | 前置条件 | 关键验证 | 关联 commit |
|---|------|---------|---------|---------|------------|
| A1 | rewrite | POST `/articles/{id}/ai-rewrite` | 选中段落 | 输出改写后段落 + AIOperation 记录 | `021ad32` |
| A2 | expand | POST `/articles/{id}/ai-expand` | 选中段落 | 输出更长版本 | `021ad32` |
| A3 | condense | POST `/articles/{id}/ai-condense` | 选中段落 | 输出更短版本 | `021ad32` |
| A4 | polish | POST `/articles/{id}/ai-polish` | 选中段落 | 润色不改意思 | `021ad32` |
| A5 | generate-headlines | POST `/articles/{id}/ai-headlines` | 有标题/内容 | 返回 3-5 个标题建议 | `021ad32` |
| A6 | generate-excerpt | POST `/articles/{id}/ai-excerpt` | 有内容 | 返回 120-160 字摘要 | `021ad32` |
| A7 | chat | POST `/ai/chat` | 无 | 多轮对话 | `e96b048` |
| A8 | generate-draft | POST `/stories/{id}/ai-draft` | 选题存在 | 返回初稿 + 自动保存为 article | `021ad32` |
| A9 | fact-check | POST `/articles/{id}/ai-fact-check` | 有内容 | 返回 score+summary+findings | `a6080a8` |
| A10 | research-kit | POST `/stories/{id}/ai-research-kit` | 选题存在 | 资料包含 Tavily + Wikipedia | `7750144` |
| A11 | review-report | POST `/articles/{id}/ai-review` | 有内容 | 审核报告 | `021ad32` |
| A12 | seo-optimize | POST `/articles/{id}/ai-seo` | 有标题/内容 | SEO 建议（关键词、meta） | `021ad32` |

### 10.1 单项用例模板

#### TC-AI-{XX}-001: 正常返回

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 准备有效输入 → 调用 → 等待 → 验证响应 |
| **预期结果** | 1. HTTP 200，结构符合 DTO<br>2. AIOperation 记录<br>3. language 参数贯穿（见 §7） |
| **自动化** | Jest 单测（已有 `ai.service.spec.ts` 1384 行覆盖基础） |

#### TC-AI-{XX}-002: 异常输入

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 空 content / 超长 content / 仅空白字符 |
| **预期结果** | 1. DTO 校验通过（业务层校验）<br>2. LLM 返回低质量结果时不崩<br>3. 前端显示错误 |

#### TC-AI-{XX}-003: 权限校验

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 其他用户访问 |
| **预期结果** | 1. 自己的文章：200<br>2. 指派编辑：200<br>3. 其他人：403 |

#### TC-AI-{XX}-004: AI 失败降级

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | Mock provider 返回 500 |
| **预期结果** | 1. HTTP 502/500<br>2. AIOperation 记录失败状态<br>3. 前端显示「AI 服务暂时不可用」 |

### 10.2 关键单项用例（fact-check / research-kit）

#### TC-AI-FC-001: 事实核查 5 维度识别

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | 包含矛盾数据/敏感表述/人名地名的稿件 |
| **测试步骤** | POST `/articles/{id}/ai-fact-check` |
| **预期结果** | 1. score 0-100<br>2. summary 中文<br>3. findings 包含 type=fact/inconsistency/dispute/source_needed/risk 五种类型<br>4. severity=info/warning/critical |
| **关联 commit** | `a6080a8`（多轮工具调用+过滤） |

#### TC-AI-RK-001: 资料包 Tavily + Wikipedia 融合

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | POST `/stories/{id}/ai-research-kit` |
| **预期结果** | 1. 资料包含 3-5 个 Tavily 搜索结果（source, title, url, snippet）<br>2. 含 1-2 个 Wikipedia 词条摘要（已过滤相关性）<br>3. Tavily 失败时降级（`7750144`） |
| **关联 commit** | `a6080a8` + `7750144` + `2f7b57f` |

---

## 11. P1 — Channels 平台分发与适配器

> 关联 commit：`63f273b`（WordPress）/ 历史适配器
> 涉及：`backend/src/channels/{channels.controller.ts, channels.service.ts, platforms/*}`

### 11.1 平台适配器注册

#### TC-CHN-001: PlatformRegistry 注册所有适配器

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 单元测试：getAdapter(platform) 对每个枚举值 |
| **预期结果** | 1. WEBSITE/FACEBOOK/INSTAGRAM/XIAOHONGSHU/WORDPRESS → 返回对应 adapter<br>2. X/THREADS/LINKEDIN/YOUTUBE/PUSH → 返回 undefined（保留位）<br>3. 调用未支持平台不抛异常 |

#### TC-CHN-002: 平台列表元数据

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | GET `/channels/platforms` |
| **预期结果** | 1. 返回 5 个支持的平台元数据<br>2. 含 name/description/maxTitleLength/maxContentLength/supportsImages/supportsVideo/aspectRatios/styleGuide<br>3. WORDPRESS.maxTitleLength=200, maxContentLength=50000 |

#### TC-CHN-003: 平台图标前端映射完整

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 检查 `frontend/src/components/channels/platform-preview.tsx` 的 PLATFORM_ICONS / PLATFORM_NAMES |
| **预期结果** | 1. WEBSITE/FACEBOOK/INSTAGRAM/XIAOHONGSHU/WORDPRESS 5 项均有图标+名称<br>2. 无 undefined 渲染<br>3. 5 平台按钮在 ChannelPanel 全部可见 |

### 11.2 各平台适配生成

#### TC-CHN-004: Website 适配

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | POST `/channels/{articleId}/adapt-content` body `{platform: "WEBSITE"}` |
| **预期结果** | 1. adaptedTitle = article.title（基本适配）<br>2. adaptedContent = article.content（HTML）<br>3. 状态 DRAFT → READY |

#### TC-CHN-005: Facebook 适配

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 适配 Facebook |
| **预期结果** | 1. adaptedTitle 短于原文（适配社交风格）<br>2. adaptedExcerpt 简短吸引<br>3. adaptedTags 5-8 个 |

#### TC-CHN-006: Instagram 适配

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 适配 Instagram |
| **预期结果** | 1. supportsImages=true，封面图必传<br>2. 内容短小精悍<br>3. 标签多（10-20 个） |

#### TC-CHN-007: 小红书适配

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 适配小红书 |
| **预期结果** | 1. 内容口语化、生活化<br>2. emoji 适度<br>3. 标签含话题风格（如 `#xxx`） |

#### TC-CHN-008: WordPress 适配

| 项目 | 内容 |
|------|------|
| **优先级** | P0（见 §5） |
| **覆盖** | 复用 TC-WP-001/002 |

### 11.3 标记已发布

#### TC-CHN-009: 人工标记已发布

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 适配非 WordPress 平台 → 人工发布 → 点击「标记为已发布」输入 URL |
| **预期结果** | 1. PlatformPublish.status=PUBLISHED<br>2. publishedUrl 保存<br>3. publishedAt 填充 |

#### TC-CHN-010: 删除适配记录

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试步骤** | DELETE `/channels/{articleId}/publishes/{id}` |
| **预期结果** | 1. 记录删除<br>2. 其他平台记录不受影响 |

### 11.4 前端 ChannelPanel

#### TC-CHN-011: ChannelPanel 多平台预览卡片

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 进入文章详情，查看平台分发面板 |
| **预期结果** | 1. 5 平台全部渲染<br>2. 未适配的显示「生成适配」按钮<br>3. 已适配的显示预览卡片（标题/摘要/封面）<br>4. 状态 GENERATING/READY/PUBLISHED/FAILED 视觉区分 |

#### TC-CHN-012: 单平台 publishing 状态隔离

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 同时点击 WordPress 和 Facebook 生成按钮 |
| **预期结果** | 1. 两平台独立 loading<br>2. 各自完成后独立显示 READY（建议 D4 修复后行为） |
| **关联 commit** | `63f273b`（D4 已知缺陷） |

---

## 12. P1 — Trending-Topics 热点聚合

> 关联 commit：`16ddc6c`（代理开关）/`5470e07`（重构）/`2435549`（海外 RSS 扩展）/`b43dfba`（RSSHub 接入）

### 12.1 数据源聚合

#### TC-TT-001: Google Trends 抓取

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试数据** | RSS_PROXY_ENABLED=true（开发环境） |
| **测试步骤** | GET `/trending-topics?source=google-trends` |
| **预期结果** | 1. 返回 5-10 个 Google Trends 主题<br>2. heatScore 正确排序<br>3. 包含 title/heatScore/source |

#### TC-TT-002: 海外 RSS（BBC/Guardian）

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | GET `/trending-topics?source=bbc` |
| **预期结果** | 1. RSS_PROXY_ENABLED=true 时走 HTTP_PROXY<br>2. 返回 BBC 头条<br>3. source 字段标记 "bbc" |

#### TC-TT-003: RSSHub 接入（36 氪/虎嗅/豆瓣热映）

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **前置条件** | RSSHub 运行于 `http://localhost:1200` |
| **测试步骤** | GET `/trending-topics?source=kr36` |
| **预期结果** | 1. 通过 RSS_HUB_URL 抓取<br>2. 返回 36 氪热门<br>3. RSSHub 不可用时降级到 Google Trends |

#### TC-TT-004: 代理开关切换

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | RSS_PROXY_ENABLED=false；HTTP_PROXY=无效地址 |
| **测试步骤** | 启动后端，调用海外 RSS |
| **预期结果** | 1. 不走代理（getProxyRequestOptions 返回空）<br>2. 直连 Google Trends/RSS<br>3. 日志确认无 HttpsProxyAgent 实例化 |
| **关联 commit** | `16ddc6c` |

#### TC-TT-005: AI 主题选择

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 1. 抓取热点<br>2. 调用 `aiService.selectTopTopic(topics)` |
| **预期结果** | 1. LLM 返回最值得追的 topic<br>2. 返回包含 topic.id 和 reason |

### 12.2 Topic 生命周期

#### TC-TT-006: 创建 topic

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | POST `/trending-topics` body `{title, source, heatScore, tags}` |
| **预期结果** | 1. status=OPEN<br>2. tags 已 stringify 存库 |

#### TC-TT-007: 采用 topic 为选题

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | PATCH `/trending-topics/{id}/adopt` body `{storyId}` |
| **预期结果** | 1. status=ADOPTED<br>2. adoptedStoryId 填充<br>3. Story.tags 自动包含 topic.tags |

#### TC-TT-008: 归档 topic

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试步骤** | PATCH status=ARCHIVED |
| **预期结果** | 1. 列表不再显示（默认筛选）<br>2. 已采用的 Story 不受影响 |

---

## 13. P1 — safeJsonParse 全局加固

> 关联 commit：`63f273b`（全局加固）
> 涉及字段：`tags` / `platforms` / `aiGeneratedParts` / `coverImages` / `adaptedTags` / `expertise` / `suggestedAngles` / AutoPublish 任务的 5 个 JSON 配置

### 13.1 字段覆盖扫描

#### TC-SJP-001: 全字段代码扫描

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. grep `JSON.parse(` 在 `backend/src/` 下<br>2. 排除测试文件<br>3. 检查每个调用是否被 safeJsonParse 替代或 try-catch |
| **预期结果** | 1. 仅 schema/migration 或可信来源保留 JSON.parse<br>2. 所有用户可控字段（来自 DB）使用 safeJsonParse |
| **关联 commit** | `63f273b` |

#### TC-SJP-002: safeJsonParse 单元测试

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 边界值：null / undefined / '' / '[]' / 'invalid json' / '[1,2]' / 嵌套 JSON |
| **预期结果** | 1. null/undefined/'' → 返回 fallback<br>2. 'invalid' → 捕获异常返回 fallback<br>3. 合法 JSON 正常解析 |

### 13.2 字段级验证

#### TC-SJP-003: User.expertise 非法 JSON

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | DB 中 `users.expertise = '{broken'` |
| **测试步骤** | GET `/users/{id}` |
| **预期结果** | 1. 不抛 500<br>2. expertise 返回 `[]`（fallback）<br>3. 日志 warn |

#### TC-SJP-004: Story.tags 非法 JSON

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | stories.tags = 'not_json' |
| **测试步骤** | GET `/stories/{id}` |
| **预期结果** | tags 返回 `[]` |

#### TC-SJP-005: Article.platforms/aiGeneratedParts 非法 JSON

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | articles.platforms/aiGeneratedParts 设为非法 |
| **测试步骤** | GET `/articles/{id}` |
| **预期结果** | 1. platforms 返回 `[]`<br>2. aiGeneratedParts 返回 `[]` |

#### TC-SJP-006: PlatformPublish.adaptedTags/coverImages

| 项目 | 内容 |
|------|------|
| **优先级** | P0（关键 D1 验证） |
| **测试数据** | platform_publishes.adaptedTags = '{broken' |
| **测试步骤** | 1. 读取列表<br>2. 触发 WordPress 发布（验证 D1 已修复） |
| **预期结果** | 1. 列表显示 `[]`<br>2. 发布时 safeJsonParse 降级为 `[]`，不抛 500 |
| **关联 commit** | `63f273b` |

#### TC-SJP-007: AutoPublishTask 5 个 JSON 配置

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | 手动将 `scheduleConfig/topicStrategy/contentConfig/filterConfig/publishConfig/retryConfig` 改为非法 |
| **测试步骤** | 1. GET `/auto-publish/tasks/{id}`<br>2. 触发任务 |
| **预期结果** | 1. 读取时 safeJsonParse 降级<br>2. 触发时按 fallback 运行（带警告日志） |
| **关联 commit** | `1e20a29` |

#### TC-SJP-008: TrendingTopic.tags / suggestedAngles

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试数据** | tags/suggestedAngles 非法 |
| **测试步骤** | 读取 |
| **预期结果** | 返回 `[]` / `null` |

#### TC-SJP-009: errorLog 字段

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试数据** | auto_publish_runs.errorLog 设为非法 |
| **测试步骤** | GET run 详情 |
| **预期结果** | 返回 `[]`（已在 `auto-publish.service.ts:91` 验证） |

---

## 14. P1 — User / RBAC 角色管理

> 关联 commit：`02a8c7c`（RBAC）/`13416f5`（rebrand）

### 14.1 用户 CRUD

#### TC-USR-001: 创建用户

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | POST `/users` body `{email, name, role, department, expertise}` |
| **预期结果** | 1. 密码默认 `123456`<br>2. preferredLanguage 默认 TRADITIONAL_CHINESE_HK<br>3. role 必须是 REPORTER/EDITOR/ADMIN |

#### TC-USR-002: 更新用户

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | PATCH `/users/{id}` body `{name, department, expertise, preferredLanguage}` |
| **预期结果** | 1. 字段更新<br>2. 密码不暴露<br>3. 角色变更需要 ADMIN |

#### TC-USR-003: 修改用户角色

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | PATCH `/users/{id}` body `{role: "EDITOR"}` |
| **预期结果** | 1. 仅 ADMIN 可操作<br>2. 成功后用户可登录且获得新权限 |

#### TC-USR-004: 禁用用户

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | PATCH `{isActive: false}` |
| **预期结果** | 1. 登录返回 401 "User disabled"（待确认）<br>2. 旧 token 失效 |

#### TC-USR-005: 列出所有用户（ADMIN）

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | GET `/users` |
| **预期结果** | 仅 ADMIN 可见；返回所有字段（除 passwordHash） |

### 14.2 RBAC

#### TC-USR-006: 越权访问端点

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | reporter_sc 调 ADMIN-only 端点 |
| **预期结果** | HTTP 403 |

#### TC-USR-007: 跨用户资源访问

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | reporter_sc PATCH 另一 reporter 的用户资料 |
| **预期结果** | HTTP 403（仅本人或 ADMIN） |

### 14.3 前端 Profile 页

#### TC-USR-008: 修改语言偏好（Profile）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. 进入 `/dashboard/profile`<br>2. 修改 preferredLanguage<br>3. 保存 |
| **预期结果** | 1. 表单回显正确（name/department/preferredLanguage）<br>2. 保存后 3 秒内显示「已保存」<br>3. 刷新后保持 |
| **关联 commit** | `13416f5`（rebrand 包含 Profile UI） |

#### TC-USR-009: 邮箱只读

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | Profile 页邮箱输入框 |
| **预期结果** | disabled，不可编辑 |

---

## 15. P2 — rebrand（"INFO-NG" → "LC 传媒"）文案一致性

> 关联 commit：`13416f5`
> 影响范围：前端文案 + 文档 + 错误信息

### 15.1 全文扫描

#### TC-RB-001: 源码文案扫描

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | grep "INFO-NG" 在 `frontend/src/` 和 `backend/src/` |
| **预期结果** | 0 命中（除 CLAUDE.md 注释或历史文档） |

#### TC-RB-002: 文档扫描

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试步骤** | grep "INFO-NG" 在 `docs/` 和 `README.md` |
| **预期结果** | 0 命中（历史 handoff 文档可保留，但当前文档需更新） |

### 15.2 UI 文案

#### TC-RB-003: 登录页 Logo

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 访问 `/login` |
| **预期结果** | Logo 文字为「LC 传媒」 |

#### TC-RB-004: Dashboard 顶部

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 登录后 dashboard layout 顶部 |
| **预期结果** | 显示「LC 传媒」 |

#### TC-RB-005: Footer / 关于页面

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试步骤** | 访问 about / footer |
| **预期结果** | 不含「INFO-NG」 |

#### TC-RB-006: 错误提示

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试步骤** | 触发各类错误（401/403/500） |
| **预期结果** | 错误提示不出现「INFO-NG」字样 |

### 15.3 后端 API 文案

#### TC-RB-007: 错误信息扫描

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | grep "INFO-NG" 在 `backend/src/**/*.ts` |
| **预期结果** | 0 命中（不影响功能，但品牌一致性） |

---

## 16. P2 — RSS_PROXY_ENABLED 代理开关

> 关联 commit：`16ddc6c`
> 涉及文件：`backend/src/trending-topics/trending-topics.service.ts`

### 16.1 配置切换

#### TC-PROXY-001: 开关 ON 走代理

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | RSS_PROXY_ENABLED=true, HTTP_PROXY=http://127.0.0.1:8888 |
| **测试步骤** | 1. 启动后端<br>2. 调用海外 RSS 抓取<br>3. 用 mock proxy server（如 mitmproxy）记录请求 |
| **预期结果** | 1. 抓取请求经过 mock proxy<br>2. Proxy-Authorization 或 CONNECT 日志可见 |
| **关联 commit** | `16ddc6c` |

#### TC-PROXY-002: 开关 OFF 直连

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | RSS_PROXY_ENABLED=false, HTTP_PROXY=http://127.0.0.1:8888（无效地址） |
| **测试步骤** | 1. 启动后端<br>2. 调用海外 RSS 抓取 |
| **预期结果** | 1. 请求不经过代理（即使 HTTP_PROXY 已设置）<br>2. 直连成功（依赖网络环境）<br>3. 日志中无 HttpsProxyAgent 实例化 |
| **关联 commit** | `16ddc6c` |

#### TC-PROXY-003: 本地 RSSHub 不走代理

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试数据** | RSS_HUB_URL=http://localhost:1200, RSS_PROXY_ENABLED=true |
| **测试步骤** | 抓取 RSSHub 源 |
| **预期结果** | 本地地址永远不走代理（避免 localhost:1200 被代理到外网） |

#### TC-PROXY-004: 代理不可用降级

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试数据** | HTTP_PROXY=http://invalid:9999 |
| **测试步骤** | 抓取海外 RSS |
| **预期结果** | 1. 抛出连接错误<br>2. 不影响本地 RSSHub 源<br>3. AI 自动降级到 fixedKeywords |

### 16.2 启动校验

#### TC-PROXY-005: 启动日志

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试步骤** | 启动后端 |
| **预期结果** | 日志含 "RSS proxy: enabled" 或 "disabled" |

---

## 17. P2 — Wikipedia 增强研究

> 关联 commit：`e1dd5c8`（增强 + 代理 + 编辑式标题关键词提取）/ `2f7b57f`（MediaWiki Search API）/ `fcf2b38`（资料增强注入）/ `a6080a8`（相关性过滤）

### 17.1 Wikipedia 接入

#### TC-WIKI-001: 资料包注入 Wikipedia 词条

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | POST `/stories/{id}/ai-research-kit` |
| **预期结果** | 资料包中 `wikipedia` 数组含 1-3 个相关词条（title/summary/url） |
| **关联 commit** | `fcf2b38` |

#### TC-WIKI-002: 相关性过滤

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试数据** | 选题标题"量子计算突破" |
| **测试步骤** | 触发 research-kit |
| **预期结果** | 1. 注入的 Wikipedia 词条与"量子计算"相关<br>2. 不相关词条（如"苹果公司"）被过滤 |
| **关联 commit** | `a6080a8` |

#### TC-WIKI-003: 编辑式标题关键词提取

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试数据** | 选题标题"突发：INFO-NG 调查：AI 深度伪造技术的最新进展" |
| **测试步骤** | 观察 Wikipedia 搜索关键词 |
| **预期结果** | 1. 关键词从标题中提取"AI 深度伪造"/"deepfake"<br>2. 停用词"突发""最新进展"被去除<br>3. 中英文混合兼容 |
| **关联 commit** | `e1dd5c8` |

#### TC-WIKI-004: MediaWiki Search API

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试数据** | Mock Wikipedia API 返回搜索结果 |
| **测试步骤** | 抓取 URL 验证 |
| **预期结果** | 1. 使用 `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=...`<br>2. 含 User-Agent 头（合规） |
| **关联 commit** | `2f7b57f` |

#### TC-WIKI-005: Wikipedia 不可用降级

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试数据** | Mock Wikipedia 500 |
| **测试步骤** | research-kit |
| **预期结果** | 1. 资料包不包含 wikipedia 字段（或为空数组）<br>2. 不抛异常<br>3. Tavily 搜索结果仍返回 |
| **关联 commit** | `7750144`（降级策略） |

---

## 18. P2 — E2E 跨模块联动

> 目标：Playwright E2E 冒烟覆盖 5 个核心流程
> 涉及：auth → users → stories → articles → ai → channels → auto-publish

### 18.1 端到端流程

#### TC-E2E-001: 完整采编流程（人工）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. admin_lc 注册 reporter_yue<br>2. reporter_yue 登录 → 创建选题（粤语）<br>3. AI 生成初稿（粤语 prompt）<br>4. 提交审核<br>5. editor_01 审核通过<br>6. 发布到 WordPress<br>7. 验证 WP 后台可见 |
| **预期结果** | 全流程无报错，6 步均成功 |
| **自动化** | Playwright（建议） |

#### TC-E2E-002: 自动发布流程

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. admin 创建自动发布任务（FIXED_TIME, useTrending=true, publishConfig.platform=WORDPRESS）<br>2. 手动触发<br>3. 等待 60s<br>4. 观察 run 进度<br>5. 验证 WordPress 后台有新文章 |
| **预期结果** | 6 步全成功；run.status=COMPLETED；WP 文章存在 |
| **自动化** | Playwright（建议） |

#### TC-E2E-003: AI Provider 切换热加载

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 1. 启动时 `AI_PROVIDER=deepseek`<br>2. 执行 AI 操作<br>3. 修改 .env 为 `AI_PROVIDER=kimi`<br>4. 重启 → 执行 AI 操作 |
| **预期结果** | 1. 前次操作使用 deepseek（AIOperation.model 记录）<br>2. 重启后使用 kimi（model 字段变化） |
| **自动化** | Jest e2e（环境变量切换） |

#### TC-E2E-004: 多角色协作

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. reporter_sc 创建简体中文文章<br>2. editor_02（简体偏好）审核<br>3. admin 分配到 editor_01（繁体）二次审核<br>4. 多语言切换贯穿流程 |
| **预期结果** | 1. 每个角色看到自己偏好的语言<br>2. 审核意见/状态正确传递 |
| **自动化** | Playwright + 多个浏览器 context |

#### TC-E2E-005: 失败恢复

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 1. 触发自动发布任务<br>2. 中途断网<br>3. 恢复网络<br>4. 重新触发 |
| **预期结果** | 1. 失败任务记录 errorMessage<br>2. 重新触发创建新 run<br>3. 旧 run 状态保留 FAILED |
| **关联 commit** | `1e20a29`（重试机制） |

### 18.2 前端缓存一致性

#### TC-E2E-006: TanStack Query 缓存

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. 加载文章列表<br>2. 编辑某文章 → 保存<br>3. 返回列表 |
| **预期结果** | 1. 列表自动 invalidate 缓存<br>2. 显示最新数据<br>3. 无需手动刷新 |
| **关联 commit** | `frontend/src/lib/article-api.ts`（TanStack Query hooks） |

#### TC-E2E-007: 跨页面状态

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 1. 选题列表点击进入详情<br>2. 修改标题保存<br>3. 浏览器返回 |
| **预期结果** | 列表显示新标题（Zustand 不缓存，但 TanStack invalidate） |

#### TC-E2E-008: Token 过期多 tab 同步

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 1. Tab A 登录<br>2. Tab B 打开任意页面<br>3. Tab A 登出 |
| **预期结果** | 1. Tab B 收到通知<br>2. 下次请求重定向 /login<br>3. localStorage 同步更新 |

---

## 19. 回归测试 — 模块联动矩阵

> 目标：验证 9 个模块间数据/调用的一致性

### 19.1 数据流矩阵

| 起点 | 终点 | 验证点 | 用例 |
|------|------|--------|------|
| auth | users | 登录返回 user 对象 | TC-AUTH-001 |
| users | stories | reporterId 外键有效 | TC-USR-001 |
| stories | articles | storyId 外键有效 | TC-ART-006 |
| articles | article_versions | 每次更新创建版本 | TC-ART-006 |
| articles | ai_operations | 每次 AI 操作记录 | TC-AI-PRV-005 |
| articles | platform_publishes | 5 平台独立记录 | TC-CHN-001 |
| trending_topics | stories | adoptedStoryId 关联 | TC-TT-007 |
| auto_publish_tasks | auto_publish_runs | taskId 关联 | TC-AP-001 |
| auto_publish_runs | auto_publish_articles | runId 关联 | TC-AP-009 |
| auto_publish_articles | articles | 成功时 articleId 关联 | TC-AP-009 |

### 19.2 关键状态联动

#### TC-LNK-001: Article 发布 → PlatformPublish 创建

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 1. 文章 APPROVED 状态<br>2. 发布到 5 个平台<br>3. 查询 PlatformPublish 数量 |
| **预期结果** | 1. 5 条 PlatformPublish 记录（每平台 1 条）<br>2. articleId 一致<br>3. status 流转正确 |

#### TC-LNK-002: 删 Article → 级联 PlatformPublish

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | DELETE `/articles/{id}` |
| **预期结果** | 1. Article 删除（onDelete: Cascade）<br>2. PlatformPublish 同步删除<br>3. ArticleVersion 同步删除<br>4. AIOperation 不级联（保留审计） |

#### TC-LNK-003: 删 User → Stories/Articles 行为

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | DELETE `/users/{reporter-id}` |
| **预期结果** | 1. 行为需产品确认（无 onDelete 配置）<br>2. 建议：仅允许 isActive=false 软删除 |
| **建议** | 当前 Prisma 无外键 onDelete 策略，需明确软删除/硬删除决策 |

#### TC-LNK-004: 自动发布成功 → Article 状态联动

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | TC-AP-009 成功路径 |
| **预期结果** | 1. AutoPublishArticle.platformPublishId 指向 PlatformPublish<br>2. Article.status = AUTO_PUBLISHED（如果 publish 步骤成功）<br>3. Article.publishedAt 填充 |

#### TC-LNK-005: WordPress 凭据变更 → 重启生效

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 1. 修改 WORDPRESS_APP_PASSWORD<br>2. 重启后端<br>3. 发布文章 |
| **预期结果** | 1. 重启后使用新凭据<br>2. 无缓存旧凭据 |

---

## 20. 边界与兼容性测试

### 20.1 数据库边界

#### TC-BDY-DB-001: 字段超长

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | title 1000 字符 / content 100000 字符 |
| **预期结果** | 1. 后端校验拒绝（DTO 限制）<br>2. 已有超长记录查询正常 |

#### TC-BDY-DB-002: 大量并发更新同一 Story

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试步骤** | 50 个并发 PATCH /stories/{id} |
| **预期结果** | 1. 全部成功（无锁竞争问题）<br>2. 最终状态与最后写入一致<br>3. version 字段递增 |

#### TC-BDY-DB-003: 软删除 User 后登录

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试数据** | users.isActive=false |
| **测试步骤** | 用该 user 登录 |
| **预期结果** | 401 "User disabled"（建议实现） |

#### TC-BDY-DB-004: UUID 格式校验

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 所有 API 传非 UUID 字符串 |
| **预期结果** | 400 "Invalid id format"（建议实现）或 404 |

### 20.2 性能边界

#### TC-BDY-PERF-001: 1000 篇文章列表分页

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 准备 1000 条 articles，GET `/articles?page=1&pageSize=20` |
| **预期结果** | 1. 响应时间 < 500ms<br>2. 包含 meta.total=1000<br>3. 分页参数生效 |

#### TC-BDY-PERF-002: 50 篇文章同时发布

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | 50 个并发 POST `/channels/{id}/publish-wordpress` |
| **预期结果** | 1. 串行处理或带限流<br>2. 无 5xx<br>3. 全部最终 PUBLISHED |

#### TC-BDY-PERF-003: 自动发布 batchSize=10

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | batchSize=10 触发 |
| **预期结果** | 1. 串行处理 10 篇文章<br>2. 单次运行耗时 < 5min<br>3. Run 状态正确 |

### 20.3 兼容性

#### TC-BDY-COMPAT-001: 浏览器兼容

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试步骤** | Chrome/Safari/Firefox/Edge 各版本访问 |
| **预期结果** | 1. 主要功能可用<br>2. TipTap 编辑器在所有现代浏览器工作 |

#### TC-BDY-COMPAT-002: 移动端

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试步骤** | iOS Safari / Android Chrome |
| **预期结果** | 1. 响应式布局正常<br>2. 编辑器可用（核心场景） |

#### TC-BDY-COMPAT-003: MySQL 8.0+ / Redis 7+ 兼容

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试步骤** | MySQL 8.0 vs 8.4 / Redis 6 vs 7 |
| **预期结果** | 行为一致 |

---

## 21. 非功能测试（性能 / 安全 / 兼容性）

### 21.1 性能测试

#### TC-PERF-001: API 响应时间基线

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试方法** | k6 压测 |
| **目标** | P95 < 500ms（P0 API：登录/列表/详情/发布） |
| **场景** | 并发 100，持续 5min |

#### TC-PERF-002: AI 调用延迟

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试方法** | 10 次连续 rewrite |
| **目标** | P50 < 5s, P95 < 15s |
| **关联** | AIOperation.durationMs 字段 |

#### TC-PERF-003: 自动发布吞吐量

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试方法** | batchSize=20 触发 |
| **目标** | 单 run 完成时间 < 10min |

#### TC-PERF-004: 前端首屏加载

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试方法** | Lighthouse |
| **目标** | FCP < 1.5s, LCP < 2.5s, TTI < 3s |

### 21.2 安全测试（OWASP Top 10）

#### TC-SEC-001: SQL 注入

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试方法** | 所有文本输入传入 `' OR 1=1 --` 等 |
| **预期** | Prisma 参数化查询，0 注入成功 |

#### TC-SEC-002: XSS（前端）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试方法** | title/content 传入 `<script>alert(1)</script>` |
| **预期** | React 自动转义；不执行 |

#### TC-SEC-003: XSS（WordPress 内容）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试方法** | 适配内容含 `<script>alert(1)</script>` |
| **预期** | WP 侧过滤或转义；前台不执行 |

#### TC-SEC-004: CSRF

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试方法** | 跨站 POST 请求 |
| **预期** | JWT 在 Authorization 头，非 cookie → 不受 CSRF 影响 |

#### TC-SEC-005: 越权访问（IDOR）

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试方法** | 已知 UUID 越权访问他人资源 |
| **预期** | 403 Forbidden |

#### TC-SEC-006: 敏感信息泄露

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试方法** | 响应中是否含 passwordHash、API Key |
| **预期** | 全部脱敏 |

#### TC-SEC-007: Rate Limiting

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试方法** | 1 秒 1000 次登录 |
| **预期** | 429 Too Many Requests（建议实现） |

#### TC-SEC-008: WordPress 凭据泄露

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试方法** | 触发任意日志，grep WORDPRESS_APP_PASSWORD |
| **预期** | 日志不输出原始凭据 |

#### TC-SEC-009: JWT Secret 强度

| 项目 | 内容 |
|------|------|
| **优先级** | P1 |
| **测试方法** | 检查 JWT_SECRET 默认值 |
| **预期** | 非默认（`change-me`）；生产 ≥ 256 位 |

#### TC-SEC-010: 提权漏洞

| 项目 | 内容 |
|------|------|
| **优先级** | P0 |
| **测试方法** | REPORTER 修改自己 role=ADMIN |
| **预期** | 403；仅 ADMIN 可改角色 |

### 21.3 可用性

#### TC-UX-001: 错误提示友好性

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试方法** | 触发 30 种错误场景 |
| **预期** | 1. 错误信息中文化<br>2. 提供下一步建议<br>3. 不暴露堆栈 |

#### TC-UX-002: Loading 状态

| 项目 | 内容 |
|------|------|
| **优先级** | P2 |
| **测试方法** | AI 操作/发布时观察 UI |
| **预期** | 1. 按钮显示 loading<br>2. 防止重复点击<br>3. 超时提示 |

#### TC-UX-003: 无障碍（a11y）

| 项目 | 内容 |
|------|------|
| **优先级** | P3 |
| **测试方法** | 屏幕阅读器、键盘导航 |
| **预期** | 主要功能可用 |

---

## 22. 测试执行 checklist 与人员排期

### 22.1 自动化 vs 手工分布

| 模块 | 单元 (Jest/Vitest) | 集成 (E2E API) | E2E (Playwright) | 手工 |
|------|-------------------|----------------|------------------|------|
| auth | 已覆盖 | 补全 | 5 用例 | 0 |
| users | 已覆盖 | 补全 | 3 用例 | 0 |
| stories | 已覆盖 | 补全 | 3 用例 | 0 |
| articles | 部分 | 补全 | 5 用例 | 0 |
| ai | 已覆盖（1384 行） | 补全 | 0 | 12 项能力各 1 抽检 |
| channels | 部分 | 补全 | 2 用例 | 0 |
| WordPress | 294 行 | 已有 e2e | 0 | 实际站点验证 |
| auto-publish | 283 行 | 补全 | 3 用例 | 实际调度等待 |
| trending-topics | 0 | 补全 | 0 | 实时性手工 |
| redis | 63 行 | — | — | — |
| safeJsonParse | 补 | — | — | — |
| rebrand | grep 脚本 | — | — | UI 截屏比对 |
| 性能 | — | k6 | — | — |
| 安全 | — | sqlmap/owasp | — | — |

### 22.2 冒烟 vs 全量

#### 冒烟测试（1 人日，预部署必跑）

| # | 用例 | 预计时间 |
|---|------|---------|
| 1 | TC-AUTH-001/006/014 | 10min |
| 2 | TC-USR-008 | 5min |
| 3 | TC-ART-001/003/005/006 | 15min |
| 4 | TC-AI-PRV-005（12 项 × 1） | 30min |
| 5 | TC-WP-001/003/011 | 15min |
| 6 | TC-AP-005/009 | 20min |
| 7 | TC-I18N-001/003 | 5min |
| **小计** | | **1.5h**（含环境准备 0.5h） |

#### 全量回归（5-7 人日，按模块拆分）

| 阶段 | 模块 | 人日 | 执行人 |
|------|------|------|--------|
| Phase 1 | auth + users + i18n | 1.0 | QA-A |
| Phase 2 | stories + articles + AI 12 项 | 1.5 | QA-A + QA-B |
| Phase 3 | channels + WordPress | 1.0 | QA-B |
| Phase 4 | auto-publish（含 e2e） | 1.0 | QA-B |
| Phase 5 | trending + safeJsonParse + rebrand | 0.5 | QA-A |
| Phase 6 | 性能 + 安全 | 1.0 | QA-C（性能）/ 外部（安全） |
| Phase 7 | E2E 跨模块 + 联动矩阵 | 0.5 | QA-A + QA-B |
| Phase 8 | 兼容性 + 边界 | 0.5 | QA-C |
| **合计** | | **7.0 人日** | 3 人 |

### 22.3 执行顺序

```
Day 1 (Phase 1-2)
  09:00 - 09:30  环境准备 + 数据库 migration 验证
  09:30 - 12:00  auth/users/i18n 冒烟 + 全量
  13:00 - 18:00  stories/articles + AI 12 项能力

Day 2 (Phase 3-4)
  09:00 - 12:00  channels + WordPress
  13:00 - 18:00  auto-publish（含真实调度等待）

Day 3 (Phase 5-6)
  09:00 - 12:00  trending + safeJsonParse + rebrand
  13:00 - 18:00  性能压测 + 安全扫描

Day 4 (Phase 7-8 + 报告)
  09:00 - 12:00  E2E 跨模块 + 联动矩阵
  13:00 - 17:00  兼容性 + 边界 + 缺陷复测
  17:00 - 18:00  测试报告 + 风险评审
```

### 22.4 通过标准

| 级别 | 标准 | 阻塞发布？ |
|------|------|----------|
| P0 单元 | 100% 通过 | 是 |
| P0 集成 | 100% 通过 | 是 |
| P0 E2E | 100% 通过 | 是 |
| P1 单元 | 100% 通过 | 否（≤1 个非阻塞） |
| P1 集成 | 100% 通过 | 否 |
| P2 | ≥ 90% 通过 | 否 |
| 性能 | 满足 P95 < 500ms | 否（建议） |
| 安全 | 无高危 | 是 |
| 代码覆盖率 | 新增代码 ≥ 80% | 否（建议） |

### 22.5 缺陷记录模板

```
【缺陷ID】: REG-{YYYYMMDD}-{NNN}
【对应用例】: TC-XXX-XXX
【严重级别】: Blocker / Critical / Major / Minor / Trivial
【优先级】: P0 / P1 / P2
【模块】: auth/users/stories/articles/ai/channels/wp/auto-publish/trending/redis/i18n
【问题描述】: 一句话概述
【复现步骤】:
  1. ...
  2. ...
【预期结果】: ...
【实际结果】: ...
【环境信息】: OS / 浏览器 / 后端 commit / 前端 commit / DB schema 版本
【截图/日志】: 路径
【建议修复】: 文件 + 行号（如已知）
【影响范围】: 受影响用户数 / 业务场景
```

---

## 23. 执行签到占位

> 本节用于执行人/审阅人在完成测试后填写，作为发布准入凭证

### 23.1 冒烟测试签到

| 项 | 内容 |
|----|------|
| **执行人** | _（待填写）_ |
| **执行日期** | _（待填写）_ |
| **冒烟通过率** | _/22（待填写）_ |
| **阻塞缺陷数** | _（待填写）_ |
| **结论** | GO / NO-GO / CONDITIONAL |
| **备注** | _（待填写）_ |
| **审阅人** | _（待填写）_ |

### 23.2 全量回归签到

| 阶段 | 执行人 | 起止日期 | 通过/总数 | 阻塞缺陷 | 备注 |
|------|--------|---------|-----------|---------|------|
| Phase 1 (auth+users+i18n) | _ | _ | _/_ | _ | _ |
| Phase 2 (stories+articles+AI) | _ | _ | _/_ | _ | _ |
| Phase 3 (channels+WP) | _ | _ | _/_ | _ | _ |
| Phase 4 (auto-publish) | _ | _ | _/_ | _ | _ |
| Phase 5 (trending+SJP+rebrand) | _ | _ | _/_ | _ | _ |
| Phase 6 (性能+安全) | _ | _ | _/_ | _ | _ |
| Phase 7 (E2E+联动) | _ | _ | _/_ | _ | _ |
| Phase 8 (兼容+边界) | _ | _ | _/_ | _ | _ |

### 23.3 缺陷链接汇总

| 缺陷 ID | 标题 | 严重度 | 状态 | 链接 |
|---------|------|--------|------|------|
| _（占位）_ | | | | |

### 23.4 发布建议

| 维度 | 评估 | 建议 |
|------|------|------|
| P0 阻塞缺陷 | _/0 | |
| 性能基线 | _/_ | |
| 安全扫描 | 通过/不通过 | |
| **最终结论** | | **GO / NO-GO** |
| **QA Lead 签字** | | _（待填写）_ |
| **日期** | | _（待填写）_ |

---

## 24. 附录

### 附录 A：测试命令速查

```bash
# ===== 单元测试 =====
cd backend && npx jest                                    # 全部
cd backend && npx jest src/auth/                          # 单模块
cd backend && npx jest src/auth/auth.service.spec.ts      # 单文件
cd backend && npx jest --coverage                         # 覆盖率
cd backend && npx jest --watch                            # 监听

cd frontend && npx vitest run                             # 全部
cd frontend && npx vitest run src/lib/article-api.test.ts # 单文件
cd frontend && npx vitest run --coverage                  # 覆盖率

# ===== 集成 / E2E =====
cd backend && npm run test:e2e
cd backend && npx jest test/auto-publish.e2e-spec.ts

# ===== 全栈构建 =====
cd packages/shared && npm run build
npm run build                                             # 根目录（Turbo）

# ===== 数据库 =====
cd backend && npx prisma migrate dev --name regression_v1
cd backend && npx prisma studio
cd backend && npx prisma migrate reset                    # 警告

# ===== 性能 =====
k6 run test/load/api-load-test.js
npx autocannon http://localhost:3001/articles -H "Authorization: Bearer $TOKEN"

# ===== 安全 =====
docker run -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:3001
```

### 附录 B：等价类划分参考（i18n）

| 输入 | 有效等价类 | 无效等价类 |
|------|-----------|-----------|
| ContentLanguage | SIMPLIFIED_CHINESE / TRADITIONAL_CHINESE_HK / TRADITIONAL_CHINESE_CANTONESE / ENGLISH / null | "JP" / "FR" / "" / 123 / undefined |
| UserRole | REPORTER / EDITOR / ADMIN | "GUEST" / "ROOT" / null |
| ArticleStatus | 10 种合法枚举 | 非法状态字符串 |
| ScheduleType | FIXED_TIME / INTERVAL / CRON | "RANDOM" |
| times | "08:00", "23:59", "00:00" | "25:00", "abc", "8:00 AM" |

### 附录 C：状态机图

```
[DRAFT] → [WRITING] → [AI_OPTIMIZING] ⇄ [WRITING]
   ↓          ↓
  ...     [PENDING_REVIEW] → [IN_REVIEW] → [APPROVED] → [PUBLISHED] → [ARCHIVED]
                                  ↓                              ↓
                              [REVISION] → [WRITING]        [AUTO_PUBLISHED] (auto-publish)
                                  ↓
                              [DRAFT]

[PUBLISH_FAILED 路径]
  PENDING → TOPIC_SELECTED → RESEARCHED → DRAFTED → IMAGED → SAVED → [PIPELINE_FAILED]
                                                                    ↓
                                                              (管理员手动改 DRAFT)
```

### 附录 D：Pairwise 组合（关键维度）

| Provider | Language | Status | Article Len | Expected |
|----------|----------|--------|-------------|----------|
| deepseek | SIMPLIFIED | DRAFT | 100 | OK |
| deepseek | ENGLISH | APPROVED | 5000 | OK |
| kimi | CANTONESE | IN_REVIEW | 200 | OK |
| kimi | TRADITIONAL_HK | PENDING_REVIEW | 1000 | OK |
| openai | ENGLISH | PUBLISHED | 3000 | OK |
| openai | SIMPLIFIED | DRAFT | 100 | OK |

### 附录 E：风险等级判定

| 等级 | 影响 | 概率 | 响应 |
|------|------|------|------|
| 极高 | 数据丢失/安全漏洞 | 任意 | 立即修复，阻塞发布 |
| 高 | 核心功能不可用 | 高 | 24h 内修复 |
| 中 | 边缘场景失败 | 中 | 下个 sprint 修复 |
| 低 | 体验问题 | 低 | 排期修复 |
| 极低 | 文案/排版 | 任意 | 维护期处理 |

### 附录 F：测试数据 ID 范围（与 §2.4 对应）

| 表 | 范围 | 用途 |
|----|------|------|
| users | `00000000-0000-0000-0000-000000000001` ~ `007` | 7 个测试账号 |
| stories | `10000000-0000-0000-0000-000000000001` ~ `010` | 10 条选题 |
| articles | `20000000-0000-0000-0000-000000000001` ~ `020` | 20 条稿件 |
| platform_publishes | `30000000-0000-0000-0000-000000000001` ~ `040` | 5 平台 × 8 文章 |
| trending_topics | `40000000-0000-0000-0000-000000000001` ~ `030` | 3 来源 × 10 |
| auto_publish_tasks | `50000000-0000-0000-0000-000000000001` ~ `005` | 5 任务 |
| auto_publish_runs | `60000000-0000-0000-0000-000000000001` ~ `020` | 4 状态 × 5 |
| auto_publish_articles | `70000000-0000-0000-0000-000000000001` ~ `030` | 7 状态 × ~4 |

### 附录 G：参考文档

| 文档 | 路径 | 关系 |
|------|------|------|
| 多语言回归用例 | `docs/qa/i18n-regression-test-cases.md` | 复用 31 个用例 |
| WordPress 回归 | `docs/testing/wordpress-regression-test-plan.md` | 复用 + 补充 |
| WordPress 验收 | `docs/testing/wordpress-publishing-feature.md` | 参考 |
| AI 事实核查 handoff | `docs/test-handoff-ai-fact-check.md` | 参考 |
| AI 资料包 handoff | `docs/test-handoff-ai-research-kit.md` | 参考 |
| 自动发布 PRD | `docs/PRD-auto-publish-pipeline.md` | 业务理解 |
| 架构评审 | `docs/project_architecture_assessment.md` | 风险背景 |

---

**版本历史**

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-06-02 | 初版，覆盖最近 10 个 commit + 9 个核心模块 + 11 项关键回归要点 |

---

> **文档结束** | 共 174 个测试用例（编号 TC-XXX-001 ~ TC-LNK-005）
> P0 92 个 / P1 64 个 / P2 18 个（详细计数见执行报告）
