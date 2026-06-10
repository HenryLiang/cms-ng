---
name: "cms-ng-agent-bridge"
description: "调度 CMS-NG 后端 HTTP API 跑主链路 - 选题-分稿-写稿-AI协作-编辑审核-多平台发布,以及 AutoPublish 任务管理。Use when the user asks to: 提选题、分稿给记者、润色/改写/扩写/精简/出头条/出摘要/事实核查/SEO/审稿报告、提交审核、审核决策、平台适配并发 WordPress、查看/触发 AutoPublishTask、统计运行结果。Skip for purely read-only newsroom queries that do not touch the editorial pipeline."
---

# cms-ng-agent-bridge

> 适用项目:**01创作大脑 (CMS-NG)** —— `claudeCodeSpaces/newcms`
> 目标:让 Agent(Codex / Claude Code / 自研脚本)通过 HTTP API 调度主链路

## 适用场景

当用户希望 Agent 协助或代替人工完成: **选题 → 分稿 → 写稿 → AI 协作 → 审核 → 多平台发布**。具体而言:

- "帮我围绕 X 热点生成 3 个选题"
- "把今天这份稿子润色到港媒风格,然后准备发 WordPress + 小红书"
- "看一下待审核稿件里哪些可能有问题"
- "把这条 AutoPublishTask 跑一遍,失败的话把日志拉给我看"

## 必读前提

| 项 | 说明 |
|---|---|
| **后端可达** | `${CMS_NG_API_URL}`(默认 `http://localhost:3001`),如 `https://cms-ng-api.example.com` |
| **鉴权** | Agent 必须持有一个**有效的 access token**(JWT)。详见「鉴权」一节 |
| **角色** | `REPORTER` 可提选题/写稿/提交审核;`EDITOR`/`ADMIN` 多了分稿/审核/发布权。Token 里的 role 决定能做什么 |
| **共享类型** | 枚举来自 `@cms-ng/shared`,不重新定义。出错时优先看后端返回的 `error.code` |

## 协议约定

### Base URL 与 Header

```
Base:    ${CMS_NG_API_URL}     # 默认 http://localhost:3001
Header:  Authorization: Bearer <accessToken>
Header:  Content-Type: application/json
```

### 响应信封

后端 NestJS 实际返回结构(注意:**不是所有端点都严格包 `ApiResponse`**,后端直返数据对象;失败时通过 HTTP 4xx/5xx + JSON body 表达):

成功(典型):
```json
{ "id": "...", "title": "...", "status": "DRAFT", ... }   // 端点直返数据
```

失败(典型):
```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```
或 NestJS ValidationPipe:
```json
{
  "statusCode": 400,
  "message": ["title should not be empty"],
  "error": "Bad Request"
}
```

**建议 Agent 侧统一判错**:
- HTTP `2xx` → 成功,`data` 即 body
- HTTP `401` → token 失效,刷新或重新登录
- HTTP `403` → 角色不足,换高权限 actor 或告知用户
- HTTP `400`/`404`/`409` → 读 `message` 字段,字段校验/状态机违规居多

## 鉴权(非交互登录)

**方案 A:复用现有 `POST /auth/login`**(推荐,零后端改动):

```bash
curl -s -X POST "$CMS_NG_API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"editor@hk01.com","password":"..."}'
# → { "accessToken": "...", "user": {...} }
```

把 `accessToken` 存到 `CMS_NG_TOKEN` 环境变量即可。`scripts/agent/login.sh` 会自动完成这件事。

**方案 B:从 Web 端复制** —— 用户在浏览器登录后,从 DevTools `localStorage` 的 `cms-ng-auth` 中提取 `accessToken` 注入 Agent。

**方案 C:长过期 CLI token**(可选增强)—— 后端 `JwtAuthGuard` 已经支持任意有效 JWT,只要给 reporter/editor 颁一个 `JWT_EXPIRES_IN=30d` 的 token,Agent 就能长时间运行。

**刷新**: `POST /auth/refresh` body `{ "token": "<过期的accessToken>" }`,返回新 accessToken。

**当前用户**: `GET /auth/me` → 用于验证 token 有效性 + 拿回 `userId`/`role`。

## 主链路端点(主索引)

> 路径相对 `${CMS_NG_API_URL}`。所有写操作需鉴权。`Roles` 标注 = 需要 `EDITOR` 或 `ADMIN`。

### 1. 选题 Stories  ─ `/stories`

| Method | Path | Roles | 说明 |
|--------|------|-------|------|
| POST | `/stories` | 任意登录 | 创建选题(创建者 = reporter) |
| GET | `/stories` | 任意登录 | 列表,支持 `?status=&priority=&reporterId=&editorId=` |
| GET | `/stories/:id` | 任意登录(需 verifyAccess) | 详情 |
| PATCH | `/stories/:id` | 任意登录(需 verifyAccess) | 改字段(status/angle/tags/...) |
| DELETE | `/stories/:id` | 任意登录(需 verifyAccess) | 删除 |
| PATCH | `/stories/:id/assign-editor` | EDITOR/ADMIN | **编辑分稿**,body `{ "editorId": "<userId>" }` |
| POST | `/stories/:id/research` | 任意登录(需 verifyAccess) | AI 生成研究套件(research kit) |
| POST | `/stories/:id/draft` | 任意登录(需 verifyAccess) | 用 researchKit 派生 Article 初稿 |

`CreateStoryDto` 字段:
```ts
{
  title: string;            // 必填
  description?: string;
  angle?: string;
  status?: ArticleStatus;   // 默认 DRAFT
  priority?: number;        // 0-5
  tags?: string[];
  deadline?: string;        // ISO
  contentLanguage?: ContentLanguage;
}
```

### 2. 稿件 Articles  ─ `/articles`

| Method | Path | Roles | 说明 |
|--------|------|-------|------|
| POST | `/articles` | 任意登录 | 从 storyId 派生,创建者 = author |
| GET | `/articles` | 任意登录 | 列表,`?storyId=` 可过滤 |
| GET | `/articles/review-queue` | EDITOR/ADMIN | **编辑待审核队列** |
| GET | `/articles/:id` | 任意登录(需 verifyAccess) | 详情 |
| PATCH | `/articles/:id` | 任意登录(需 verifyAccess) | 改字段(**注意:走完整 PATCH 语义**) |
| DELETE | `/articles/:id` | 任意登录(需 verifyAccess) | 删除 |
| GET | `/articles/:id/versions` | 任意登录(需 verifyAccess) | 历史版本 |
| POST | `/articles/:id/rollback/:version` | 任意登录(需 verifyAccess) | 回滚 |
| PATCH | `/articles/:id/assign-editor` | EDITOR/ADMIN | 分稿给编辑 |
| PATCH | `/articles/:id/review` | EDITOR/ADMIN | **审核决策**,body `{ "decision": "APPROVE" \| "REVISION", "comment": "..." }` |

`CreateArticleDto`:
```ts
{
  storyId: string;          // 必填 UUID
  title: string;            // 必填
  subtitle?: string;
  content: string;          // 必填(可空字符串起步)
  excerpt?: string;
  status?: ArticleStatus;
  tags?: string[];
  contentLanguage?: ContentLanguage;
  coverImage?: string;
}
```

### 3. AI 操作  ─ `/articles/:id/ai-*`(全部 12 个)

| Method | Path | 入参 DTO 关键字段 | 返回 |
|--------|------|------------------|------|
| POST | `/articles/:id/ai-rewrite` | `{ text, instruction?, style?, language? }` style ∈ serious/casual/academic/concise | `{ result }` |
| POST | `/articles/:id/ai-expand` | `{ text, instruction?, language? }` | `{ result }` |
| POST | `/articles/:id/ai-condense` | `{ text, maxLength?, language? }` | `{ result }` |
| POST | `/articles/:id/ai-polish` | `{ text, language? }` | `{ result }` |
| POST | `/articles/:id/ai-headlines` | `{ count?, language? }` **从 article 当前内容生成** | `{ result }`(通常为数组/JSON 字符串) |
| POST | `/articles/:id/ai-excerpt` | `{ maxLength?, language? }` **从 article 当前内容生成** | `{ result }` |
| POST | `/articles/:id/ai-chat` | `{ messages: [{ role, content }], language? }` | `{ result }` |
| POST | `/articles/:id/ai-draft` | `{ instruction?, language? }` **基于 article 当前 content 重生成草稿** | `{ result }` |
| POST | `/articles/:id/ai-fact-check` | `{ language? }` **基于 article 当前 content** | `{ result }` |
| POST | `/articles/:id/ai-review` | `{ language? }` **基于 article 当前 content 出审稿报告** | `{ result }` |
| POST | `/articles/:id/ai-seo` | `{ language? }` **基于 article 当前 content 出 SEO 建议** | `{ result }` |
| POST | `/articles/:id/ai-generate-image` | 见 GenerateImageDto | `{ images: [...] }`(Seedream) |

> **重要语义差异**:
> - `rewrite/expand/condense/polish` 接收**入参 `text`**(你自己准备),**不读** Article 当前 content。Agent 通常要 `GET /articles/:id` 拿 content → 调 AI → 再 `PATCH /articles/:id` 写回。
> - `headlines/excerpt/draft/fact-check/review/seo` **隐式以 article 当前 content 为输入**,Agent 不需要传 text。
> - **AI 操作绝不自动落盘 Article** —— 后端只会把调用记录写到 `AIOperation` 表,内容回写由调用方负责。
> - **AI 永不自动发布** —— 这是项目硬规则,所有平台发布走第 5 节人工 `channels/*` 端点。

### 4. 审核  ─ `/articles/:id/*`

- `PATCH /articles/:id/review`  body `{ "decision": "APPROVE" | "REVISION", "comment": "..." }`
  - `APPROVE` → `IN_REVIEW`/`PENDING_REVIEW` 状态变 `APPROVED`
  - `REVISION` → 退回 `REVISION`(后续由记者重写后**再次**走 `PATCH /articles/:id` + 改 status 到 `PENDING_REVIEW`,后端没有专门的"提交审核"端点,见下)

**关于"提交审核 / 认领审核"**:
- 后端**没有专门的 `/review/submit` `/review/claim` 端点**。记者/编辑通过 `PATCH /articles/:id` 改 `status` 字段迁移状态。
- Agent 流程:写稿完成 → `PATCH /articles/:id` 设 `status: "PENDING_REVIEW"` → 编辑 GET `/articles/review-queue` → PATCH `/articles/:id/review` 决策。

### 5. 发布渠道 Channels  ─ `/channels`

| Method | Path | Roles | 说明 |
|--------|------|-------|------|
| GET | `/channels/platforms` | 任意登录 | 列出已注册平台 + 元数据 |
| GET | `/channels/:articleId/publishes` | 任意登录(需 verifyAccess) | 列出该 article 的 PlatformPublish 记录 |
| POST | `/channels/:articleId/adapt` | 任意登录(需 verifyAccess) | **生成平台适配** body `{ "platform": "WEBSITE", "customPrompt?": "..." }`(一次一台) |
| PATCH | `/channels/:articleId/publishes/:publishId` | 任意登录(需 verifyAccess) | 改平台适配产物(标题/正文/封面) |
| POST | `/channels/:articleId/publish-wordpress` | 任意登录(需 verifyAccess) | **真发** 到 WordPress,body `{ "wpStatus": "publish" \| "draft" }` |
| DELETE | `/channels/:articleId/publishes/:publishId` | 任意登录(需 verifyAccess) | 删除一条适配记录 |

**已实现适配器**(`GET /channels/platforms` 实时返回): `WEBSITE`, `FACEBOOK`, `INSTAGRAM`, `XIAOHONGSHU`, `WORDPRESS`。其他 `Platform` 枚举值(X/THREADS/LINKEDIN/YOUTUBE/PUSH)保留未实现。

**非 WordPress 平台**:目前没有"一键真发"端点(除 WP),通常流程是: `adapt` 生成产物 → 编辑人工在第三方后台粘贴。要新增平台的真发能力,得在 `backend/src/channels/platforms/adapters/` 加 Adapter,本 skill 不覆盖该改造。

### 6. 自动发布无人值守链  ─ `/auto-publish`

**注意**: `AutoPublishController` 类级 `@Roles(EDITOR, ADMIN)`,所有端点都要求编辑/管理员。

| Method | Path | Roles | 说明 |
|--------|------|-------|------|
| POST | `/auto-publish/tasks` | EDITOR/ADMIN | 创建任务 |
| GET | `/auto-publish/tasks` | EDITOR/ADMIN | 列任务 |
| GET | `/auto-publish/tasks/:id` | EDITOR/ADMIN | 任务详情 |
| PATCH | `/auto-publish/tasks/:id` | EDITOR/ADMIN | 改配置 |
| DELETE | `/auto-publish/tasks/:id` | EDITOR/ADMIN | 删除 |
| POST | `/auto-publish/tasks/:id/toggle` | EDITOR/ADMIN | 启停(切换 status) |
| POST | `/auto-publish/tasks/:id/run` | EDITOR/ADMIN | **手工触发一次运行**(triggerType=MANUAL) |
| GET | `/auto-publish/runs` | EDITOR/ADMIN | 运行记录列表,`?taskId=&status=` |
| GET | `/auto-publish/runs/:id` | EDITOR/ADMIN | 单次运行详情 |
| GET | `/auto-publish/runs/:runId/articles` | EDITOR/ADMIN | 该 run 跑过的 article 列表 |
| POST | `/auto-publish/articles/:id/withdraw` | EDITOR/ADMIN | 撤下某篇 |
| POST | `/auto-publish/articles/:id/retry` | EDITOR/ADMIN | 重试失败步骤 |
| POST | `/auto-publish/kill-switch` | **ADMIN** | 全局停止,body `{ "enable": false, "reason": "..." }` |
| GET | `/auto-publish/stats` | EDITOR/ADMIN | 统计 |

**AutoPublishTask 跑出来的 Article 状态机**(与主链路不同):
```
PENDING → TOPIC_SELECTED → RESEARCHED → DRAFTED → IMAGED → SAVED → PUBLISHED
                                                              └→ FAILED(failedStep 记录在哪一步挂)
```
终态落 `Article.status = AUTO_PUBLISHED` 或 `PIPELINE_FAILED`(不影响主链路状态机)。

## 状态机(主链路)

```
              ┌──────────────(REVISION 退回)────────┐
              ▼                                    │
DRAFT → WRITING → AI_OPTIMIZING → PENDING_REVIEW → IN_REVIEW
                                                       │
                                                ┌──────┴──────┐
                                                ▼             ▼
                                            APPROVED      REVISION
                                                │
                                                ▼
                                            PUBLISHED → ARCHIVED

AUTO_PUBLISHED / PIPELINE_FAILED — 来自自动发布管线,独立终态
```

**Agent 状态迁移清单**(通过 `PATCH /articles/:id` body `{ "status": "..." }` ):

| from | to | 触发者 | 备注 |
|------|----|-------|------|
| DRAFT | WRITING | reporter | 开始写 |
| WRITING | AI_OPTIMIZING | reporter | 调 AI |
| AI_OPTIMIZING | PENDING_REVIEW | reporter | 提交审核 |
| PENDING_REVIEW | IN_REVIEW | editor(隐式) | 实际由后端审核流程推进,前端列表驱动 |
| IN_REVIEW | APPROVED | editor | PATCH `/review` APPROVE |
| IN_REVIEW | REVISION | editor | PATCH `/review` REVISION |
| APPROVED | PUBLISHED | editor | 平台发布成功落库后 |
| PUBLISHED | ARCHIVED | editor/admin | |

后端 `articles.service.ts` 内部会做迁移合法性校验(可参考 `articles.service.spec.ts` 中状态机相关用例),违规返回 4xx。

## ContentLanguage 与 Platform 枚举(摘自 `@cms-ng/shared`)

```ts
ContentLanguage = "SIMPLIFIED_CHINESE" | "TRADITIONAL_CHINESE_HK" | "TRADITIONAL_CHINESE_CANTONESE" | "ENGLISH"
Platform        = "WEBSITE" | "FACEBOOK" | "INSTAGRAM" | "XIAOHONGSHU" | "WORDPRESS"
                 | "X" | "THREADS" | "LINKEDIN" | "YOUTUBE" | "PUSH"   // 保留值,无适配器
UserRole        = "REPORTER" | "EDITOR" | "ADMIN"
```

## 端到端示例:跑通主链路(curl + jq)

> 假设已设好 `CMS_NG_API_URL`、`CMS_NG_TOKEN`(且 token role = EDITOR)。每步抓出 `id` 供下一步使用。

```bash
API="$CMS_NG_API_URL"
H="Authorization: Bearer $CMS_NG_TOKEN"

# 1. 记者提选题
STORY_ID=$(curl -sf -X POST "$API/stories" -H "$H" -H "Content-Type: application/json" \
  -d '{
    "title":"2026香港财政预算案重点解读",
    "description":"聚焦派糖与基建",
    "angle":"从中小企业视角看纾困",
    "priority":3,
    "tags":["财政","预算案","2026"],
    "contentLanguage":"TRADITIONAL_CHINESE_HK"
  }' | jq -r '.id')
echo "story=$STORY_ID"

# 2. 编辑分稿给记者(需要 EDITOR/ADMIN 角色)
REPORTER_ID=$(curl -sf "$API/auth/me" -H "$H" | jq -r '.id')   # 演示用,可换真实 reporter
curl -sf -X PATCH "$API/stories/$STORY_ID/assign-editor" -H "$H" -H "Content-Type: application/json" \
  -d "{\"editorId\":\"$REPORTER_ID\"}"

# 3. AI 生成研究套件(基于 story)
RESEARCH=$(curl -sf -X POST "$API/stories/$STORY_ID/research?language=TRADITIONAL_CHINESE_HK" -H "$H")
echo "$RESEARCH" | jq '.researchKit' > /tmp/research-kit.json
RESEARCH_KIT=$(cat /tmp/research-kit.json)

# 4. 从研究套件派生 Article 初稿
DRAFT=$(curl -sf -X POST "$API/stories/$STORY_ID/draft" -H "$H" -H "Content-Type: application/json" \
  -d "{\"researchKit\":$RESEARCH_KIT,\"language\":\"TRADITIONAL_CHINESE_HK\"}")
ARTICLE_ID=$(echo "$DRAFT" | jq -r '.article.id')
echo "article=$ARTICLE_ID"

# 5. 写稿 + 改 status 到 PENDING_REVIEW
curl -sf -X PATCH "$API/articles/$ARTICLE_ID" -H "$H" -H "Content-Type: application/json" \
  -d '{
    "title":"2026财政预算案:中小企业纾困3大重点",
    "content":"<p>...</p>",
    "status":"PENDING_REVIEW",
    "tags":["财政","预算案","2026","中小企业"]
  }' > /dev/null

# 6. 编辑看审核队列 + 决策
curl -sf "$API/articles/review-queue" -H "$H" | jq '.[] | {id, title, status}'
curl -sf -X PATCH "$API/articles/$ARTICLE_ID/review" -H "$H" -H "Content-Type: application/json" \
  -d '{"decision":"APPROVE","comment":"通过"}'

# 7. 平台适配(以 WordPress 为例)
curl -sf -X POST "$API/channels/$ARTICLE_ID/adapt" -H "$H" -H "Content-Type: application/json" \
  -d '{"platform":"WORDPRESS"}'
# 列出产物,挑一条 publishId
curl -sf "$API/channels/$ARTICLE_ID/publishes" -H "$H" | jq

# 8. 真发到 WordPress
curl -sf -X POST "$API/channels/$ARTICLE_ID/publish-wordpress" -H "$H" -H "Content-Type: application/json" \
  -d '{"wpStatus":"publish"}'

# 9. 一并适配其他平台(非 WP:目前只能"适配+人工",没有一键发端点)
for P in WEBSITE FACEBOOK XIAOHONGSHU; do
  curl -sf -X POST "$API/channels/$ARTICLE_ID/adapt" -H "$H" -H "Content-Type: application/json" \
    -d "{\"platform\":\"$P\"}"
done
curl -sf "$API/channels/$ARTICLE_ID/publishes" -H "$H" | jq
```

## 端到端示例:AI 迭代润色

```bash
API="$CMS_NG_API_URL"; H="Authorization: Bearer $CMS_NG_TOKEN"; AID="$ARTICLE_ID"

# 拿当前内容
CUR=$(curl -sf "$API/articles/$AID" -H "$H" | jq -r '.content')

# 调 polish
POLISHED=$(curl -sf -X POST "$API/articles/$AID/ai-polish" -H "$H" -H "Content-Type: application/json" \
  -d "{\"text\":\"$CUR\",\"language\":\"TRADITIONAL_CHINESE_HK\"}" | jq -r '.result')

# 写回
curl -sf -X PATCH "$API/articles/$AID" -H "$H" -H "Content-Type: application/json" \
  -d "{\"content\":\"$POLISHED\"}" | jq '{id, version, status}'
```

## 端到端示例:手工跑一次 AutoPublishTask

```bash
API="$CMS_NG_API_URL"; H="Authorization: Bearer $CMS_NG_TOKEN"

# 列任务
curl -sf "$API/auto-publish/tasks" -H "$H" | jq '.[] | {id, name, status, scheduleType}'

# 挑一个 ACTIVE 的,手工触发
TASK_ID="..."
RUN_ID=$(curl -sf -X POST "$API/auto-publish/tasks/$TASK_ID/run" -H "$H" | jq -r '.id')

# 轮询状态(简单 sleep;Agent 可加重试)
for i in 1 2 3 4 5 6; do
  STATUS=$(curl -sf "$API/auto-publish/runs/$RUN_ID" -H "$H" | jq -r '.status')
  echo "poll $i: $STATUS"
  [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "PARTIAL" ] && break
  sleep 5
done

# 看 article 列表 + 失败 step
curl -sf "$API/auto-publish/runs/$RUN_ID/articles" -H "$H" | jq '.[] | {id, status, failedStep, errorMessage}'
```

## 失败模式速查

| HTTP | 含义 | Agent 处理 |
|------|------|-----------|
| 401 Unauthorized | token 无效/过期 | 调 `/auth/refresh` 或重新 `POST /auth/login` |
| 403 Forbidden | 角色不足 / verifyAccess 失败 | 换高权限 actor,或把任务交回用户 |
| 400 Bad Request | DTO 校验失败 | `message` 字段数组,定位字段后修正 |
| 404 Not Found | id 不存在 | 重新 `GET /articles`(或 `/stories`)列表,同步最新 id |
| 409 Conflict | 状态机迁移非法(常见于 `/articles/:id/review` 决策) | 读 message,走合法迁移 |

## 配套脚本(项目自带)

`scripts/agent/` 下提供了 shell 包装:

| 脚本 | 用途 |
|------|------|
| `scripts/agent/cms-ng.sh` | 统一 wrapper:自动注入 token + base URL,语法 `cms-ng.sh METHOD /path [-d json] [-q 'jq filter']` |
| `scripts/agent/login.sh` | 交互式登录,把 token 写入 `.cms-ng-token` |
| `scripts/agent/install.sh` | 把本 skill 安装到 `$CODEX_HOME/skills/cms-ng-agent-bridge/` |
| `scripts/agent/examples/full-flow.sh` | 端到端跑通主链路的演示 |
| `scripts/agent/examples/ai-iterate.sh` | AI 润色迭代示例 |

## 安装与加载

**方式 1:装到 Codex 全局 skill 目录(推荐)**
```bash
bash scripts/agent/install.sh
# 之后可在 Codex 会话里直接 apply_skill cms-ng-agent-bridge
```

**方式 2:本地读**
```bash
# Codex 会话里:读取 scripts/agent/SKILL.md 的内容作为上下文
```

**方式 3:配置 `.codex/agents/`**(项目内 agent 配置,待你确认规范后接入)

## 已知边界 / 暂不支持

- **非 WP 平台一键真发** —— 后端未提供,需在第三方后台粘贴适配产物
- **批量平台适配** —— `/channels/:articleId/adapt` 一次一台,多平台需循环
- **"提交审核 / 认领审核"专用端点** —— 通过 `PATCH /articles/:id` 改 `status` 间接实现
- **AI 结果自动写回 Article** —— 后端不会自动落盘,Agent 需自己回写
- **Token 长期有效** —— 默认 `JWT_EXPIRES_IN=7d`,Agent 长时间任务需做 refresh

## 引用

- `AGENTS.md` 顶层文档(项目架构、命令、约定)
- `packages/shared/src/index.ts` 枚举与接口定义
- `backend/src/articles/articles.controller.ts` 主链路 Controller
- `backend/src/stories/stories.controller.ts` 选题 Controller
- `backend/src/channels/channels.controller.ts` 发布 Controller
- `backend/src/auto-publish/auto-publish.controller.ts` 无人值守 Controller
- `backend/src/auth/auth.controller.ts` 鉴权 Controller
