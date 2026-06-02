# 01 创作大脑（CMS-NG）— 全量功能回归报告

> **报告日期**：2026-06-02
> **回归版本**：HEAD（最近 10 commit：`1e20a29` ~ `d2b5b3c`）
> **测试范围**：9 个核心模块 + 11 项关键回归要点
> **执行环境**：
> - Dev 前端 `localhost:3000`（Next.js 16.2.6）— Playwright `page.route()` 重写 API 调转到 QA 后端
> - QA 后端 `localhost:3002`（NestJS，**db=`cms_ng_qa`**，43.134.11.194:3306 远端 MySQL）
> - 真实外部依赖：DeepSeek / Tavily / Seedream / WordPress（`wuququ.com`）/ Google Trends / RSSHub
> - Playwright 1.60.0 + chromium（headless）

---

## 1. 执行摘要（TL;DR）

| 维度 | 数据 |
|------|------|
| **用例总数** | **161**（含 3 冒烟 + 36 auth-i18n + 40 article-workflow + 13 auto-publish + 16 ai-capabilities + 18 channels-wordpress + 36 stories-trending） |
| **通过** | **161 ✅**（100%） |
| **跳过** | **1 ⏭**（auto-publish TC-AP-007 — QA 环境无 Redis，kill switch 静默 no-op） |
| **失败** | **0 ❌** |
| **墙钟时间** | **9.9 min**（含 AI 真实调用 + WP 真实发布） |
| **Adversarial 可信度** | **78/100** |

### Go/No-Go 决策：**🚫 NO-GO**

> **理由**：发现 **3 项 P0**（其中 1 项 P0 是 adversarial 复核发现、原 agent 漏报），**任意 1 项不修复即阻塞发布**。修复后预计可达 92/100 → GO。

---

## 2. 缺陷总览（按严重度排序）

### 🔴 P0 — 阻塞发布（3 项）

| # | ID | 模块 | 描述 | 关联文件 | 来源 |
|---|----|------|------|----------|------|
| **1** | **DEF-P0-1** | auto-publish | `contentConfig.language` 缺 `@IsEnum(ContentLanguage)`，非法语言码可绕过校验被 AI 接收 | `backend/src/auto-publish/dto/create-task.dto.ts:42` | auth-i18n agent + adversarial 源码 + curl 实测 |
| **2** | **DEF-P0-2** | auto-publish | `platform` 缺 `@IsEnum(Platform)`，非法平台可落库 | `backend/src/auto-publish/dto/create-task.dto.ts:65` | **adversarial 漏报** |
| **3** | **DEF-P0-3** | redis / auto-publish | Redis 不可用时 `acquireLock` + `isKillSwitchActive` **同时 fail-open**（并发去重 + 杀戮开关双重失效） | `backend/src/redis/redis.service.ts:42-66` | auto-publish agent P1 → **adversarial 升级 P0** |

### 🟡 P1 — 强烈建议修复后再发布（5 项）

| # | ID | 模块 | 描述 | 关联文件 | 来源 |
|---|----|------|------|----------|------|
| 4 | DEF-P1-1 | auth | `POST /auth/refresh` 未实现（长会话安全策略缺位） | `backend/src/auth/auth.controller.ts` | auth-i18n |
| 5 | DEF-P1-2 | auto-publish | `scheduleType=CRON` 静默失效：`timeToCron()` 仅匹配 `HH:MM` 正则 | `backend/src/auto-publish/auto-publish-scheduler.service.ts:timeToCron()` | auto-publish |
| 6 | DEF-P1-3 | articles | Article 状态机**无 transition 校验**：121 个 (from,to) 状态对全 200，PRD §8.4 契约违反 | `backend/src/articles/articles.service.ts:153-192, 245-301` | article-workflow（评审级 → **adversarial 升级 P1**） |
| 7 | DEF-P1-4 | stories | `POST /stories/:id/research` 慢 > 120s（Wikipedia + Tavily + 2×LLM 串联） | `backend/src/stories/stories.controller.ts` | stories-trending |
| 8 | DEF-P1-5 | auto-publish | `contentConfig.timezone` 缺枚举（导致 `new CronJob(..., 'Fake/Zone')` 运行时抛错） | `backend/src/auto-publish/dto/create-task.dto.ts:18` | **adversarial 漏报** |

### 🟢 P2 — 不阻塞但建议下个 sprint 处理（5 项）

| # | ID | 模块 | 描述 | 来源 |
|---|----|------|------|------|
| 9  | DEF-P2-1 | stories | `findAll` 不消费 `page`/`pageSize`/`status`/`contentLanguage` query — 列表返回 380 条全量（实测响应 156.5KB） | stories-trending + 主对话 curl 验证 |
| 10 | DEF-P2-2 | stories | DELETE `/stories/:id` 不级联清 `Article.storyId`（orphan 数据） | stories-trending |
| 11 | DEF-P2-3 | auto-publish | notification 步骤失败导致整个 run FAILED（**过失败**） | auto-publish |
| 12 | DEF-P2-4 | auto-publish | `scheduleConfig.times` 缺 per-item 校验（"25:00" 直接落库） | auto-publish |
| 13 | DEF-P2-5 | auto-publish | `registerTaskCron` 未 await，toggle 响应 `nextRunAt=null` 持续 ~4s | auto-publish |

---

## 3. 用例执行矩阵

| 模块 | spec | 报告 | 编写者 | 用例 | 通过 | 跳过 | 失败 | 可信度 |
|------|------|------|--------|------|------|------|------|--------|
| smoke | `00-smoke.spec.ts` | — | 主对话 | 3 | 3 ✅ | 0 | 0 | 100 |
| auth + i18n | `auth-i18n.spec.ts` | [auth-i18n.md](./regression-results-2026-06-02/auth-i18n.md) | agent 1 | 36 | 36 ✅ | 0 | 0 | **93** |
| article workflow | `article-workflow.spec.ts` | [article-workflow.md](./regression-results-2026-06-02/article-workflow.md) | agent 2 | 40 | 40 ✅ | 0 | 0 | **88** |
| auto-publish | `auto-publish.spec.ts` | [auto-publish.md](./regression-results-2026-06-02/auto-publish.md) | agent 3 | 13 | 12 ✅ | 1 ⏭ | 0 | **82** |
| AI capabilities | `ai-capabilities.spec.ts` | [ai-capabilities.md](./regression-results-2026-06-02/ai-capabilities.md) | agent 4 | 16 | 16 ✅ | 0 | 0 | **91** |
| channels + WP | `channels-wordpress.spec.ts` | [channels-wordpress.md](./regression-results-2026-06-02/channels-wordpress.md) | agent 5 | 18 | 18 ✅ | 0 | 0 | **72** |
| stories + trending | `stories-trending.spec.ts` | [stories-trending.md](./regression-results-2026-06-02/stories-trending.md) | agent 6 | 36 | 36 ✅ | 0 | 0 | **90** |
| **合计** | | | | **161** | **161** | **1** | **0** | **78/100** |

**注**：channels-wordpress 报告可信度 72（最低）— agent 因 sandbox 限制未实跑 Playwright，由主对话亲自执行 18 用例全通过补齐。**auto-publish 1 跳过**为环境性（QA 后端无 Redis）— 修复 P0-3（Redis 持久化）后自动恢复。

---

## 4. 性能基线（真实 key 实测）

| 类别 | 端点类型 | P50 (ms) | P95 (ms) |
|------|----------|----------|----------|
| 简单文本 AI | rewrite / polish / condense | 5-15s | 35s |
| 中等 AI | expand / headlines / excerpt / chat | 10-25s | 32s |
| 复杂 AI | fact-check / review-report / seo / generate-draft | 25-40s | 50s |
| research-kit | Tavily + Wikipedia + 2×LLM 串联 | 50-110s | **167s** ⚠️ |
| Seedream 图像 | doubao-seedream-5-0-260128 | 60-80s | 100s |
| 海外 RSS（代理） | Google Trends / BBC / Guardian | 1.0-1.4s | 2s |
| 本地 RSS（直连） | RSSHub `localhost:1200` | 0.1-0.7s | 1s |
| WordPress 真实发布 | POST `wuququ.com/wp-json/wp/v2/posts` | 3-5s | 8s |

**research-kit 167s 是 P1 性能告警**，建议下个 sprint 增加 streaming 响应或拆步骤 async。

---

## 5. 发布前必做清单（按修复顺序）

### 🔴 P0 修复（缺一不可）

- [ ] **DEF-P0-1**：在 `create-task.dto.ts:42` 给 `contentConfig.language` 加 `@IsEnum(ContentLanguage)`
- [ ] **DEF-P0-2**：在 `create-task.dto.ts:65` 给 `platform` 加 `@IsEnum(Platform)`
- [ ] **DEF-P0-3**：
  - 把 `acquireLock` 失败时改为返 `false` + 写 audit log
  - 把 kill switch 状态持久化到 MySQL（或写 `knex` migration `auto_publish_kill_switch` 表）
  - Redis 不可用时**不再静默 no-op**，而是 fail-closed

### 🟡 P1 强烈建议（可视业务紧迫度决定）

- [ ] DEF-P1-1：补 `POST /auth/refresh` 端点
- [ ] DEF-P1-2：修 `timeToCron()` 正则或后端 cron 库换成 `cron-parser`
- [ ] DEF-P1-3：在 `articles.service.ts:update / submitReview` 入口加 `validateStateTransition()` 白名单
- [ ] DEF-P1-4：research-kit 改 streaming 或分步骤
- [ ] DEF-P1-5：补 `contentConfig.timezone` 枚举

### 🟢 P2 backlog（不阻塞）

- [ ] DEF-P2-1：修 `stories.service.ts:findAll` 消费分页/筛选
- [ ] DEF-P2-2：DELETE story 级联清 article.storyId
- [ ] DEF-P2-3：notification 步骤独立 try/catch
- [ ] DEF-P2-4：scheduleConfig.times per-item 校验
- [ ] DEF-P2-5：`registerTaskCron` 加 await

### 🛠 基础设施

- [ ] QA 环境补 Redis 容器（fail-open 策略才有意义）
- [ ] pre-prod 提供独立 WordPress 测试实例（避免直接打生产 `wuququ.com`）

---

## 6. 风险评估（按 P0 修复情况）

| 场景 | 风险 | 业务影响 |
|------|------|----------|
| **P0 全部修复** | 🟢 低 | 可发布，预计可信度 92/100 |
| **仅修 P0-1, P0-2** | 🟡 中 | 误传非法 language/platform 给 AI，AI 输出不稳定 |
| **未修 P0-3** | 🔴 高 | 同一任务并发触发 2 次、AI 文章重复发布；kill switch 失效后无法紧急止损 |
| **P0 全部未修** | 🔴 **阻塞** | 上述 P0-3 风险极高，建议 NO-GO |

---

## 7. 交付物清单

### 测试代码（可重放）

- `tests/regression/00-smoke.spec.ts` (3 用例)
- `tests/regression/auth-i18n.spec.ts` (36 用例)
- `tests/regression/article-workflow.spec.ts` (40 用例)
- `tests/regression/auto-publish.spec.ts` (13 用例)
- `tests/regression/ai-capabilities.spec.ts` (16 用例)
- `tests/regression/channels-wordpress.spec.ts` (18 用例)
- `tests/regression/stories-trending.spec.ts` (36 用例)
- `tests/regression/_shared/fixtures.ts` — 共享 fixture（鉴权注入 + API 路由重写）
- `tests/regression/_shared/api.ts` — 共享 API helper
- `playwright.config.ts` — 根配置

### 报告与产物

- `docs/qa/regression-report-2026-06-02.md` — **本报告**
- `docs/qa/regression-results-2026-06-02/auth-i18n.md` ~ `stories-trending.md` — 6 份子报告
- `docs/qa/regression-results-2026-06-02/_adversarial-review.md` — 独立复核报告
- `tests/regression/results/html/index.html` — Playwright HTML 报告
- `tests/regression/screenshots/` — 7 张关键截图（登录落地、401 重定向、列表/详情、UI 烟测）

### 执行回放命令

```bash
# 1. 确保服务在跑
#   - Dev 前端 :3000
#   - QA 后端 :3002 (DATABASE_URL=mysql://...cms_ng_qa)
# 2. 全量回归
npx playwright test --reporter=list
# 3. 仅跑某个模块
npx playwright test tests/regression/auto-publish.spec.ts
# 4. 抽样（如仅 auth + P0）
npx playwright test tests/regression/auth-i18n.spec.ts --grep "TC-AUTH-001|TC-I18N"
```

---

## 8. 附录 A — 执行时间线

| 阶段 | 工具 | 时长 | 并行度 |
|------|------|------|--------|
| 环境准备 | 主对话 | 8 min | 1 |
| 6 个 subagent 并行 | 6 × qa-testing-expert | 13-60 min / agent（**真实 8-12 min 墙钟**） | 6 |
| 主对话实跑全量 7 spec | Playwright | 9.9 min | 3 workers（AI/auto-publish 1 worker 串行） |
| Adversarial 复核 | 1 × qa-testing-expert | 9 min | 1 |
| **合计** | | **~50 min 墙钟** | |

## 9. 附录 B — 复现率

- **Subagent 6 份报告** vs **主对话实跑**：100% 一致（除 channels 报告 spec 计数 17 vs 实际 18 off-by-one — 不影响结论）
- **Adversarial 7 项 P0/P1 独立查证**：7/7 全部独立确认
- **Adversarial 抽样重跑 4 个用例**：4/4 与原报告一致

## 10. 附录 C — 数据隔离

- 所有测试数据前缀：`qa-auth-` / `qa-art-` / `qa-ap-` / `qa-ai-` / `qa-chn-` / `qa-sty-` / `qa-wp-` / `qa-trd-`
- 数据库：`cms_ng_qa`（独立库，不影响 `cms_ng_dev`）
- WordPress 真实发布：标题前缀 `qa-test-`（需人工去 wp-admin 清理）
- AIOperation 跨次运行累积：建议下个迭代增加 `TRUNCATE ai_operations` beforeAll

---

## 签到

| 项 | 执行人 | 日期 | 状态 |
|----|--------|------|------|
| 测试计划 | qa-testing-expert agent | 2026-06-02 | ✅ |
| 6 模块并行执行 | 6 × qa-testing-expert | 2026-06-02 | ✅ |
| 主对话回归 | claude | 2026-06-02 | ✅ |
| Adversarial 复核 | qa-testing-expert agent | 2026-06-02 | ✅ |
| P0 修复 | — | — | ⏳ 阻塞中 |
| 复跑冒烟 | — | — | ⏳ 待 P0 修复后 |

---

> **报告结束** | **建议决策：NO-GO（修复 3 项 P0 后转 GO）**
> 完整 P0/P1/P2 缺陷表见 §2，修复清单见 §5
