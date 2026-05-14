# 开发计划：选题中心（Story Hub）

## Context

记者工作台已完成，用户可以创建选题、撰写稿件、管理看板。下一个模块是「选题中心」（PRD 模块二，P0 优先级），核心解决"今天写什么"的问题。MVP 范围包括：热点列表（手动录入）、AI 选题推荐（基础版）、一键立项。

**已有基础可复用：**
- 后端 NestJS CRUD 模块模式（stories/articles）
- 前端 API 客户端模式（axios + Bearer token）
- 前端页面结构（侧边栏导航 `/dashboard/stories` 已存在，当前为纯选题列表）
- 数据库 MySQL + Prisma 已就绪
- `.env` 中已配置 Kimi API 占位符（需确认 key 是否有效）

**缺失需新建：**
- AI 抽象层（`backend/src/ai/`）— 调用 Kimi API
- 热点数据模型（`TrendingTopic`）
- AI 选题推荐接口

## 目标

实现选题中心完整功能：
- 后端：热点话题 CRUD + AI 选题推荐 API（调用 Kimi）
- 前端：热点列表页（左侧列表 + 右侧详情/AI 推荐面板）+ 一键创建选题
- 数据库：新增 `TrendingTopic` 表

## 方案

### Phase 1: 数据库变更

**文件**: `backend/prisma/schema.prisma`
- 新增 `TrendingTopic` 模型：
  - `id`, `title`, `description`, `source`, `heatScore`, `tags`, `status`(OPEN/ADOPTED/ARCHIVED)
  - `suggestedAngles String?` — AI 推荐的角度列表（JSON）
  - `createdBy String`, `adoptedStoryId String?`
  - `createdAt`, `updatedAt`
- 运行 `npx prisma migrate dev --name add_trending_topics`
- 运行 `npx prisma generate`

### Phase 2: 后端 — AI 层搭建

新建 `backend/src/ai/` 目录：

1. **`backend/src/ai/ai.module.ts`** — 导出 AIModule
2. **`backend/src/ai/ai.service.ts`** — 核心服务：
   - 封装 Kimi API 调用（chat completions）
   - `generateStorySuggestions(userProfile: {name, expertise, department}, recentTopics: string[])` — 返回 AI 生成的 3-5 个选题建议
   - 每个建议包含：title, description, suggestedAngle, reason
   - 记录 AIOperation 到数据库（复用现有 `AIOperation` 模型）
3. **`backend/src/ai/dto/story-suggestion.dto.ts`** — AI 建议的数据结构

AI Prompt 设计（供参考）：
```
你是一位资深新闻编辑，为香港01媒体的记者提供选题建议。
记者信息：{name}，专长：{expertise}，部门：{department}

请基于当前热点和记者专长，生成 3-5 个选题建议。
每个建议需包含：
- title: 选题标题
- description: 简要描述
- suggestedAngle: 建议的报道角度
- reason: 推荐理由

输出为 JSON 数组格式。
```

### Phase 3: 后端 — TrendingTopic 模块

按已有模块模式（参考 stories/articles）创建：

1. **`backend/src/trending-topics/dto/create-topic.dto.ts`** — title, description, source, heatScore, tags
2. **`backend/src/trending-topics/dto/update-topic.dto.ts`** — PartialType
3. **`backend/src/trending-topics/trending-topics.service.ts`** — CRUD + AI 推荐
   - `findAll()` — 列出所有热点，按 heatScore 排序
   - `create(userId, dto)` — 创建热点
   - `update(id, dto)` — 更新
   - `remove(id)` — 删除
   - `generateAISuggestions(userId)` — 调用 AI 服务生成选题建议
   - `adoptTopic(topicId, storyId)` — 将热点标记为已采纳
4. **`backend/src/trending-topics/trending-topics.controller.ts`** — REST API：
   - `GET /trending-topics` — 热点列表
   - `POST /trending-topics` — 创建热点
   - `PATCH /trending-topics/:id` — 更新
   - `DELETE /trending-topics/:id` — 删除
   - `POST /trending-topics/suggestions` — AI 生成选题建议
   - `POST /trending-topics/:id/adopt` — 采纳热点为选题（一键创建 Story）
5. **`backend/src/trending-topics/trending-topics.module.ts`**

**修改 `backend/src/app.module.ts`** — 导入 AIModule, TrendingTopicsModule

### Phase 4: 前端实现

1. **`frontend/src/lib/topic-api.ts`** — API 客户端函数：
   - `getTopics()`, `createTopic()`, `updateTopic()`, `deleteTopic()`
   - `getAISuggestions()` — 获取 AI 选题建议
   - `adoptTopic(topicId)` — 一键采纳为选题

2. **改造 `frontend/src/app/dashboard/stories/page.tsx`** — 从纯选题列表改造为「选题中心」：
   - 左侧：热点列表（可手动创建/编辑/删除）
   - 右侧：选中热点的详情面板
   - 面板内显示：标题、描述、来源、热度、AI 推荐角度
   - 「+ 创建选题」按钮 — 一键从热点创建 Story
   - 「AI 推荐选题」按钮 — 调用 AI 接口获取个性化建议

3. **新建 `frontend/src/app/dashboard/stories/suggestions/page.tsx`** — AI 推荐结果页（可选，若集成在主页面则不需要）

### Phase 5: 验证

**后端验证（cURL）：**
```bash
# 创建热点
curl -X POST http://localhost:3001/trending-topics -H "Authorization: Bearer <token>" -d '{"title":"香港楼市新政","description":"...","heatScore":95}'
# 获取热点列表
curl http://localhost:3001/trending-topics -H "Authorization: Bearer <token>"
# AI 推荐（需有效 Kimi API Key）
curl -X POST http://localhost:3001/trending-topics/suggestions -H "Authorization: Bearer <token>"
# 一键采纳
curl -X POST http://localhost:3001/trending-topics/<id>/adopt -H "Authorization: Bearer <token>"
```

**前端验证（浏览器）：**
1. 访问 `/dashboard/stories` → 显示热点列表 + AI 推荐按钮
2. 点击「AI 推荐选题」→ 显示 AI 生成的 3-5 个选题建议
3. 点击「采纳」→ 自动创建 Story → 跳转工作台看板
4. 手动创建热点 → 填写表单 → 热点出现在列表中
5. 从热点点击「创建选题」→ 预填充标题/描述 → 创建 Story

## 关键文件列表

- `backend/prisma/schema.prisma`
- `backend/src/ai/ai.module.ts`
- `backend/src/ai/ai.service.ts`
- `backend/src/ai/dto/story-suggestion.dto.ts`
- `backend/src/trending-topics/trending-topics.module.ts`
- `backend/src/trending-topics/trending-topics.service.ts`
- `backend/src/trending-topics/trending-topics.controller.ts`
- `backend/src/trending-topics/dto/create-topic.dto.ts`
- `backend/src/trending-topics/dto/update-topic.dto.ts`
- `backend/src/app.module.ts`
- `frontend/src/lib/topic-api.ts`
- `frontend/src/app/dashboard/stories/page.tsx`（改造）

## 依赖

- `axios`（后端已安装，用于调用 Kimi API）
- 需确认 `backend/.env` 中 `KIMI_API_KEY` 是否已替换为真实 key
