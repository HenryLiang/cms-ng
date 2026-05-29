# PRD: 自动发布管道（Auto-Publishing Pipeline）

> **项目**: 01创作大脑 (CMS-NG)
> **版本**: v1.0
> **日期**: 2026-05-29
> **状态**: 已批准，待实施

---

## 1. 背景与目标

### 1.1 背景

CMS-NG 当前是"记者+AI"协作模式，所有 AI 生成内容需人工审核才能发布。随着内容需求增长，需要一条**全自动内容生产管道**来补充人力：定时自动完成从选题、调研、写作、配图到发布的全链路，直接推送到 WordPress。

### 1.2 目标

- 实现定时自动发布能力，覆盖选题→调研→写作→配图→保存→发布的完整链路
- 补充人力（非替代），用于每日热点快讯、固定栏目等标准化内容
- 可配置的任务管理，支持不同栏目/频道独立配置

### 1.3 核心定位

**补充人力** — 用于标准化、可批量生产的内容类型（快讯、数据报道、栏目文章等），释放记者/编辑精力用于深度报道。

---

## 2. 需求总结

| 维度 | 决策 |
|------|------|
| 产品定位 | 补充人力 |
| 审核模式 | **完全自动**（无人工审核） |
| 选题策略 | **混合模式**：固定栏目 + 热点补充 |
| 调度方式 | **固定时间点**（如每天 8:00、12:00、18:00） |
| 产量 | **可配置**（每个任务/栏目单独设置） |
| 首期渠道 | **WordPress** |
| 内容风格 | **可配置**（每个任务可设风格、长度、语言） |
| 异常处理 | **重试 + 保存半成品 + 报警** |
| 内容过滤 | **频道分类 + 敏感领域过滤** |
| 管理方式 | **需要前端配置界面** |
| 发布补救 | **自动撤回 + 手动处理** |
| 监控告警 | **MVP 先邮件通知，后续加 Dashboard** |

---

## 3. 核心概念

### AutoPublishTask（自动发布任务）

每个 AutoPublishTask 代表一条独立的自动发布规则，包含：

- **调度计划** — cron 表达式 / 固定时间点列表
- **选题策略** — 固定栏目关键词 + 热点源配置 + 过滤规则
- **内容模板** — 风格、长度、语言、写作指令
- **发布目标** — WordPress 站点 + 分类目录
- **产量控制** — 每次运行生成 N 篇
- **开关状态** — 启用 / 暂停 / 禁用

---

## 4. 管道执行流程

```
┌─────────────┐
│  1. 调度触发  │  Cron 定时触发 AutoPublishTask
└──────┬──────┘
       ▼
┌─────────────┐
│  2. 选题采集  │  从 TrendingTopics + 固定栏目关键词 收集候选选题
│              │  → 敏感词/领域过滤 → 去重（24h内已写过的） → 选出 N 个
└──────┬──────┘
       ▼
┌─────────────┐
│  3. 资料调研  │  对每个选题调用 research-kit（Tavily搜索）
│              │  收集背景资料、数据、引用
└──────┬──────┘
       ▼
┌─────────────┐
│  4. 文章生成  │  调用 generate-draft + 任务配置的 style prompt
│              │  生成标题、正文、摘要
└──────┬──────┘
       ▼
┌─────────────┐
│  5. 封面配图  │  调用 Seedream API 生成封面图
│              │  根据文章标题/摘要生成提示词
└──────┬──────┘
       ▼
┌─────────────┐
│  6. 保存文稿  │  创建 Story + Article + ArticleVersion
│              │  状态直接设为 AUTO_PUBLISHED（跳过审核流程）
└──────┬──────┘
       ▼
┌─────────────┐
│  7. 平台发布  │  通过 WordPress adapter 发布
│              │  创建 PlatformPublish 记录（status: PUBLISHED）
└──────┬──────┘
       ▼
┌─────────────┐
│  8. 通知汇报  │  发送邮件通知：本次运行结果（成功N篇/失败N篇）
│              │  失败的文章附带错误详情
└─────────────┘
```

---

## 5. 异常处理机制

- **每步重试**：失败步骤自动重试 N 次（可配置，默认 2 次），间隔指数退避
- **半成品保存**：已完成步骤的结果保存到 Article 记录，状态标记为 `PIPELINE_FAILED`，附带失败步骤和错误信息
- **跳过继续**：单个选题失败不影响同批次其他选题
- **报警通知**：任务结束后汇总邮件，包含成功/失败明细
- **撤回支持**：前端/后台支持从 WordPress 撤回已自动发布的文章

---

## 6. 数据模型设计

### 6.1 新增表

#### `AutoPublishTask`（自动发布任务配置）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (UUID) | 主键 |
| name | String | 任务名称，如"科技早报" |
| description | String? | 描述 |
| status | AutoTaskStatus | ACTIVE / PAUSED / DISABLED |
| scheduleType | ScheduleType | FIXED_TIME / INTERVAL / CRON |
| scheduleConfig | String (JSON) | `{ times: ["08:00","12:00"], timezone: "Asia/Hong_Kong" }` |
| topicStrategy | String (JSON) | `{ fixedKeywords: ["科技","AI"], useTrending: true, trendingSources: ["google_trends"] }` |
| contentConfig | String (JSON) | `{ style: "news_brief", maxLength: 500, language: "TRADITIONAL_CHINESE_HK", systemPrompt: "..." }` |
| filterConfig | String (JSON) | `{ blockedCategories: ["politics"], blockedKeywords: [...], allowedChannels: ["tech"] }` |
| publishConfig | String (JSON) | `{ platform: "WORDPRESS", wordpressSiteId: "...", category: "tech" }` |
| batchSize | Int | 每次运行生成篇数（默认 1） |
| retryConfig | String (JSON) | `{ maxRetries: 2, retryDelayMs: 30000 }` |
| lastRunAt | DateTime? | 上次运行时间 |
| nextRunAt | DateTime? | 下次运行时间 |
| createdBy | String (UUID) | 创建者 → User |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

#### `AutoPublishRun`（每次运行的执行记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (UUID) | 主键 |
| taskId | String (UUID) | → AutoPublishTask |
| status | RunStatus | RUNNING / COMPLETED / PARTIAL / FAILED |
| startedAt | DateTime | 开始时间 |
| completedAt | DateTime? | 完成时间 |
| totalArticles | Int | 计划生成数 |
| successCount | Int | 成功数 |
| failedCount | Int | 失败数 |
| errorLog | String? (Text) | 错误汇总（JSON） |
| triggerType | TriggerType | SCHEDULED / MANUAL |

#### `AutoPublishArticle`（单次运行中的每篇文章追踪）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (UUID) | 主键 |
| runId | String (UUID) | → AutoPublishRun |
| taskId | String (UUID) | → AutoPublishTask |
| status | ArticleRunStatus | PENDING → TOPIC_SELECTED → RESEARCHED → DRAFTED → IMAGED → SAVED → PUBLISHED / FAILED / WITHDRAWN |
| topic | String? | 选题标题 |
| articleId | String? (UUID) | → Article（保存后关联） |
| platformPublishId | String? (UUID) | → PlatformPublish（发布后关联） |
| failedStep | String? | 失败在哪一步 |
| errorMessage | String? (Text) | 错误信息 |
| retryCount | Int | 重试次数（默认 0） |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### 6.2 新增枚举

```
enum AutoTaskStatus   { ACTIVE, PAUSED, DISABLED }
enum RunStatus        { RUNNING, COMPLETED, PARTIAL, FAILED }
enum ArticleRunStatus { PENDING, TOPIC_SELECTED, RESEARCHED, DRAFTED, IMAGED, SAVED, PUBLISHED, FAILED, WITHDRAWN }
enum TriggerType      { SCHEDULED, MANUAL }
```

### 6.3 扩展现有枚举

```
enum ArticleStatus {
  // 现有...
  DRAFT, WRITING, AI_OPTIMIZING, PENDING_REVIEW, IN_REVIEW, REVISION, APPROVED, PUBLISHED, ARCHIVED
  // 新增
  PIPELINE_FAILED    // 管道中途失败，半成品待处理
  AUTO_PUBLISHED     // 自动发布（区别于人工发布的 PUBLISHED）
}
```

---

## 7. 后端架构设计

### 7.1 模块结构

```
backend/src/auto-publish/
├── auto-publish.module.ts
├── auto-publish.controller.ts       # REST API
├── auto-publish.service.ts          # 业务逻辑（CRUD + 任务管理）
├── auto-publish-scheduler.service.ts # 调度器（cron 动态注册/取消）
├── pipeline/
│   ├── pipeline.service.ts          # 管道编排引擎
│   ├── step.interface.ts            # PipelineStep 接口
│   └── steps/
│       ├── topic-collection.step.ts
│       ├── research.step.ts
│       ├── article-generation.step.ts
│       ├── image-generation.step.ts
│       ├── article-save.step.ts
│       ├── publish.step.ts
│       └── notification.step.ts
├── dto/
│   ├── create-task.dto.ts
│   ├── update-task.dto.ts
│   └── query-run.dto.ts
└── auto-publish.service.spec.ts
```

### 7.2 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 调度器 | `@nestjs/schedule` (cron) | NestJS 官方集成，支持动态注册/取消 |
| 管道编排 | 自研 PipelineStep 接口 | 7 步线性流程，不需要 Bull/Temporal |
| 重试机制 | 循环 + 指数退避 | pipeline.service.ts 中实现 |
| 邮件通知 | Nodemailer | MVP 够用 |
| 敏感词过滤 | 关键词列表 + 正则 | filterConfig 中配置 |

### 7.3 与现有系统集成

| 现有组件 | 复用方式 |
|----------|----------|
| `AIService` | generate-draft, research-kit, generate-headlines, generate-excerpt |
| `AIToolsService` + `TavilySearchTool` | 资料调研搜索 |
| Seedream 图片生成 | 封面配图 |
| `TrendingTopicsService` | 热点选题来源 |
| `PlatformRegistry` + WordPress adapter | 平台发布 |
| `WordPressService` | WordPress REST API |
| `safeJsonParse` | JSON 字段安全解析 |

### 7.4 API 端点

```
# 任务管理（ADMIN + EDITOR）
GET    /auto-publish/tasks                    # 任务列表
POST   /auto-publish/tasks                    # 创建任务
GET    /auto-publish/tasks/:id                # 任务详情
PATCH  /auto-publish/tasks/:id                # 更新任务
DELETE /auto-publish/tasks/:id                # 删除任务
POST   /auto-publish/tasks/:id/toggle         # 启用/暂停
POST   /auto-publish/tasks/:id/run            # 手动触发

# 运行记录
GET    /auto-publish/runs                     # 运行列表（按任务筛选）
GET    /auto-publish/runs/:id                 # 运行详情

# 文章追踪
GET    /auto-publish/runs/:runId/articles     # 文章列表
POST   /auto-publish/articles/:id/withdraw    # 撤回文章
POST   /auto-publish/articles/:id/retry       # 重试失败文章

# 全局控制
POST   /auto-publish/kill-switch              # 总开关
GET    /auto-publish/stats                    # 统计概览
```

---

## 8. 前端界面设计

### 8.1 路由结构

```
frontend/src/app/dashboard/auto-publish/
├── page.tsx                    # 任务列表 + 总开关
├── [id]/page.tsx               # 任务详情/编辑 + 运行历史
└── runs/[id]/page.tsx          # 单次运行详情
```

### 8.2 页面说明

#### 任务列表页 (`/dashboard/auto-publish`)
- 顶部：Kill Switch 总开关 + "新建任务"按钮
- 表格：任务名称 | 调度计划 | 状态 | 下次运行 | 上次结果 | 操作

#### 任务编辑页 (`/dashboard/auto-publish/[id]`)
- 基本信息（名称、描述）
- 调度配置（时间点选择器、时区）
- 选题策略（关键词标签、热点源、频道、敏感词）
- 内容模板（风格、字数、语言、自定义 prompt）
- 发布配置（WordPress 站点、分类目录）
- 产量设置
- 运行历史时间线

#### 运行详情页 (`/dashboard/auto-publish/runs/[id]`)
- 概况卡片（计划/成功/失败、耗时、触发方式）
- 文章列表（7 步进度条、失败高亮、错误信息）
- 操作（撤回/重试）

---

## 9. 分阶段交付计划

### Phase 1 — MVP（核心管道）~2-3 周

**目标**：跑通从选题到 WordPress 发布的完整链路

- [ ] 数据模型：AutoPublishTask + AutoPublishRun + AutoPublishArticle + 枚举
- [ ] 后端调度器：`@nestjs/schedule` cron 定时触发
- [ ] 管道引擎：7 个 step 串联 + 重试机制
- [ ] 选题：复用 TrendingTopicsService + 固定关键词 + 敏感词过滤
- [ ] 生成：复用 AIService (generate-draft + research-kit + 图片生成)
- [ ] 保存：创建 Story/Article，状态设为 AUTO_PUBLISHED
- [ ] 发布：WordPress adapter 推送
- [ ] 通知：邮件汇总（Nodemailer）
- [ ] API：任务 CRUD + 手动触发 + 运行记录查询
- [ ] 前端：任务列表页 + 任务编辑页 + 运行详情页

### Phase 2 — 运维与稳定性 ~1-2 周

- [ ] 文章撤回功能（WordPress adapter 扩展）
- [ ] 失败文章重试（单篇级别）
- [ ] Kill Switch 总开关
- [ ] 邮件通知优化（成功/失败分开发送）
- [ ] 24h 选题去重
- [ ] 运行统计看板（成功率、平均耗时、产量趋势）

### Phase 3 — 智能化 ~1-2 周

- [ ] Dashboard 前端看板（管道概览 + 图表）
- [ ] 内容质量评分（AI 自评 + 人工反馈闭环）
- [ ] 多渠道扩展（Website adapter、社交媒体）
- [ ] 事件驱动触发（热度阈值触发）
- [ ] 选题智能推荐（基于历史表现数据）

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| AI 生成低质量/错误内容直接发布 | 品牌声誉损害 | 内容质量自检 step + 敏感词扫描 + 快速撤回 |
| AI API 不稳定导致管道中断 | 产量下降 | 重试 + 多 provider 降级（DeepSeek→Kimi→OpenAI） |
| WordPress API 故障 | 发布失败 | 保存半成品 + 延迟重试 + 报警 |
| 选题重复/撞车 | 内容冗余 | 24h 去重 + 与人工稿件查重 |
| 敏感/争议话题被自动发布 | 合规风险 | 敏感词/领域过滤 + 黑名单 |
| 完全自动无审核 = 无人把关 | 内容事故 | Kill Switch + 实时通知 + 完整日志 |

---

## 11. 成功指标

| 指标 | MVP 目标 | Phase 3 目标 |
|------|----------|-------------|
| 管道成功率 | ≥ 80% | ≥ 95% |
| 日均自动发布量 | 3-5 篇 | 按配置灵活扩展 |
| 平均单篇耗时 | < 3 分钟 | < 2 分钟 |
| 内容撤回响应时间 | < 5 分钟 | < 1 分钟 |
| 敏感内容误发率 | < 1% | < 0.1% |

---

## 12. 关键文件清单

### 新增文件
- `backend/src/auto-publish/` — 整个新模块
- `frontend/src/app/dashboard/auto-publish/` — 前端 3 个页面
- `frontend/src/lib/auto-publish-api.ts` — API 客户端

### 修改文件
- `backend/prisma/schema.prisma` — 新增模型 + 枚举
- `backend/src/app.module.ts` — 注册 AutoPublishModule + ScheduleModule
- `backend/src/channels/platforms/adapters/wordpress.adapter.ts` — 扩展撤回功能
- `packages/shared/src/index.ts` — 新增枚举和接口导出
- `frontend/src/app/dashboard/layout.tsx` — 导航栏增加"自动发布"入口

### 复用的现有代码
- `backend/src/ai/ai.service.ts` — AI 操作
- `backend/src/ai/tools/tavily-search.tool.ts` — 资料搜索
- `backend/src/ai/providers/` — LLM provider
- `backend/src/trending-topics/trending-topics.service.ts` — 热点选题
- `backend/src/channels/` — 平台发布
- `backend/src/channels/wordpress.service.ts` — WordPress API
- `backend/src/common/json.utils.ts` — safeJsonParse
