# 开发计划：AI 协作创作 (AI Co-creation)

## Context

选题中心（模块二）已完成。下一个模块是 PRD 中的「AI 协作创作」（模块三），核心解决"怎么写"的问题。当前编辑器基于纯 textarea（无富文本），AI 服务仅有 `generateStorySuggestions` 一个方法。

**已有基础可复用：**
- Kimi API 封装层 (`backend/src/ai/ai.service.ts`) — 带错误处理、AIOperation 审计日志
- `AIOperation` 表已支持 `agentType`: STORY/RESEARCH/WRITING/EDITOR/REVIEW/VISUAL/DISTRIBUTE
- `Article` 表已有 `aiGeneratedParts` (JSON 数组) 和 `AI_OPTIMIZING` 状态
- `ArticleVersion` 自动快照机制（内容修改时保存版本）
- 前端编辑器：纯 textarea，标题/副标题/正文/摘要四字段

**PRD 模块三完整功能清单：**
1. 智能资料搜集（多源搜索 → 结构化资料包）
2. 初稿生成（风格选择 → 大纲确认 → 全文生成）
3. 标题实验室（生成标题 + 效果预测）
4. 多平台改写（官网/Facebook/Instagram/推送）
5. 事实核查助手（自动标注事实 + 来源建议 + 一致性检查）
6. 三种交互模式：对话模式 / 快捷模式 / 自动模式

## 目标

在现有纯文本编辑器基础上，实现 AI 协作创作核心能力。MVP 聚焦**快捷模式**（文本操作）和**对话模式**（侧边栏助手），标题生成作为独立工具。初稿生成、资料搜集、事实核查因依赖外部数据源或富文本编辑器，列为 Phase 2。

## 方案

### Phase 1: 后端 — AI 写作服务扩展

扩展 `backend/src/ai/ai.service.ts`，新增文章相关 AI 方法：

**1. `rewriteText(text, instruction, style?)`** — 文本改写
- Prompt："请将以下文字按指定风格改写..."
- 支持风格：严肃新闻 / 轻快报道 / 口语化 / 学术化

**2. `expandText(text, instruction?)`** — 扩写
- Prompt："请基于以下内容扩写，补充细节和数据支撑..."

**3. `condenseText(text, maxLength?)`** — 精简
- Prompt："请将以下内容精简到指定字数以内，保留核心信息..."

**4. `polishText(text)``** — 润色
- Prompt："请润色以下文字，提升流畅度和专业度..."

**5. `generateHeadlines(articleContent, count?)`** — 标题生成
- Prompt："请根据以下文章内容生成 5 个标题选项..."
- 返回：`{ title: string; style: string; reasoning: string }[]`

**6. `generateExcerpt(articleContent, maxLength?)`** — 摘要生成
- Prompt："请为以下文章生成摘要..."

**7. `chatWithAI(messages, articleContext)`** — 对话式创作助手
- 维护对话上下文（多轮问答）
- 传入当前文章标题、正文作为上下文
- 返回 AI 回复

所有方法遵循已有模式：
- 调用 Kimi API (`moonshot-v1-8k`)
- 记录 `AIOperation` 到数据库
- 失败时返回合理的降级结果（非报错）

### Phase 2: 后端 — Articles 模块新增 AI 端点

`backend/src/articles/articles.controller.ts` 新增：

```
POST /articles/:id/ai-rewrite      → 改写选中文字
POST /articles/:id/ai-expand       → 扩写
POST /articles/:id/ai-condense     → 精简
POST /articles/:id/ai-polish       → 润色
POST /articles/:id/ai-headlines    → 生成标题建议
POST /articles/:id/ai-excerpt      → 生成摘要
POST /articles/:id/ai-chat         → 对话助手（流式/非流式）
```

Controller 接收 `articleId`，从数据库读取文章上下文，调用 `AIService` 对应方法，返回结果。

### Phase 3: 前端 — 快捷模式（文本悬浮菜单）

改造 `frontend/src/app/dashboard/articles/[id]/page.tsx`：

1. **文本选中检测**：在 content textarea 上监听 `mouseup` / `selectionchange`
2. **悬浮菜单**：选中文字时，在光标附近显示浮动工具栏：
   - 按钮：改写、扩写、精简、润色
   - 每个按钮点击后弹出子菜单（风格选择）或直接进入加载状态
3. **结果展示**：AI 返回后，显示"替换" / "插入" / "取消"三个选项
4. **操作记录**：替换/插入后自动触发保存，并记录 `aiGeneratedParts`

交互流程：
```
选中文字 → 弹出 AI 菜单 → 点击"改写" → 选风格 → 显示 loading → 显示结果 → 替换/插入/取消
```

### Phase 4: 前端 — 标题实验室

在编辑器顶部标题区域旁增加"🪄 标题实验室"按钮：
- 点击后调用 `POST /articles/:id/ai-headlines`
- 弹出面板显示 5 个标题建议，每个附带风格标签和推荐理由
- 点击标题直接替换当前标题
- 关闭后面板收起

### Phase 5: 前端 — 摘要生成

在右侧边栏摘要 textarea 旁增加"AI 生成"按钮：
- 点击后根据正文生成摘要
- 一键填入摘要框
- 支持"重新生成"

### Phase 6: 前端 — 对话式 AI 助手（侧边栏）

在编辑器右侧新增"AI 助手"面板（与现有摘要/选题信息并列）：
- 聊天界面：用户输入框 + AI 回复展示
- 上下文：自动传入当前文章标题和正文前 500 字
- 快捷指令按钮："分析选题角度"、"补充数据建议"、"检查逻辑漏洞"
- 聊天记录不持久化（会话级）

### Phase 7: 数据库变更（如需）

检查现有 schema 是否满足需求：
- `aiGeneratedParts` 已存在，可用于追踪 AI 生成内容段落
- `AI_OPTIMIZING` 状态已存在，可用于 AI 处理中的文章状态
- `AIOperation` 已关联 `articleId`，满足审计需求

**可能的新增：**
- `ArticleChatMessage` 模型（如需持久化对话历史）→ **MVP 暂不需要**

### Phase 8: 验证

**后端验证（cURL）：**
```bash
# 改写
curl -X POST http://localhost:3001/articles/<id>/ai-rewrite \
  -H "Authorization: Bearer <token>" \
  -d '{"text":"香港楼市新政推出","instruction":"更正式"}'

# 标题生成
curl -X POST http://localhost:3001/articles/<id>/ai-headlines \
  -H "Authorization: Bearer <token>"
```

**前端验证（浏览器）：**
1. 打开文章编辑器 → 选中正文文字 → 出现 AI 悬浮菜单
2. 点击"润色" → 显示 loading → 显示结果 → 点击"替换" → 文字被替换
3. 点击"🪄 标题实验室" → 显示 5 个标题建议 → 点击替换
4. 右侧"AI 助手" → 输入"帮我分析这个选题的角度" → 收到 AI 回复

## 关键文件列表

- `backend/src/ai/ai.service.ts`（扩展）
- `backend/src/ai/dto/rewrite-text.dto.ts` 等
- `backend/src/articles/articles.controller.ts`（新增 AI 端点）
- `backend/src/articles/articles.service.ts`（新增 AI 相关方法）
- `frontend/src/lib/article-api.ts`（新增 AI API 函数）
- `frontend/src/app/dashboard/articles/[id]/page.tsx`（改造：添加快捷模式、标题实验室、AI 助手）

## 依赖

- 无需新增 npm 包，复用现有 `axios` + Kimi API
- 需确认 `KIMI_API_KEY` 是否有效（当前为占位符）

## 范围裁剪说明

以下 PRD 功能列为 Phase 2（不在本次实现）：
- **智能资料搜集**：需要外部新闻 API / 搜索引擎集成
- **初稿生成（大纲+全文）**：需要更复杂的编辑器（建议模式/修订标记）
- **多平台改写**：需要富文本输出能力（当前纯文本）
- **事实核查助手**：需要事实数据库或搜索验证能力
- **自动模式（系统主动推送）**：需要实时 AI 扫描机制
