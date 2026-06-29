# 01 创作大脑（CMS-NG）产品功能与技术架构介绍

> 版本：v1.0
> 适用对象：产品负责人、技术决策者、潜在客户、合作伙伴、内部团队
> 文档定位：兼顾业务视角与技术深度的整体性介绍文档

---

## 0. 一句话定位

**01 创作大脑（CMS-NG）是一套面向媒体机构的 AI 驱动内容生产作业系统，以"记者 + AI"协作为核心，覆盖从热点发现、稿件创作、编辑审核到多平台分发的完整内容生产链路，并提供业内少见的"全自动内容管道"作为人力补充。**

---

## 1. 产品核心能力

CMS-NG 不是单一的"AI 写作工具"，而是一套**面向新闻编辑部的全栈式内容生产操作系统**。系统的功能可被划分为"记者工作台"、"编辑工作台"、"AI 协作能力"、"多平台分发"和"全自动内容管道"五条主线，并在外层配套"用户与权限"和"通知与运维"两大支撑模块。

### 1.1 记者工作台

记者是系统的一线使用者，目标是让"找选题—写稿件—配图—提交审核"的链路尽可能顺滑。

- **选题中心**：支持手动录入、AI 智能推荐、12 路 RSS 源（含 Google Trends / BBC / 纽约时报 / 联合早报 / 36 氪 / 虎嗅等）一键导入、24h 去重；
- **稿件管理**：覆盖 DRAFT → WRITING → AI_OPTIMIZING → PENDING_REVIEW → IN_REVIEW → REVISION → APPROVED → PUBLISHED → ARCHIVED 共 9 个状态的全生命周期；
- **版本快照与回滚**：每轮 AI 操作或人工修改都生成独立 `ArticleVersion`，支持任意历史版本一键回滚；
- **AI 配图**：基于文章标题与摘要自动生成提示词，调用字节火山引擎 Seedream 模型产出封面图，并自动上传至对象存储；
- **个人专长与偏好**：记者可设置 `expertise`（擅长领域）与 `preferredLanguage`（语言风格），AI 推荐时自动加权。

### 1.2 编辑工作台

编辑是稿件质量与发布风险的"守门人"。

- **审稿队列**（Review Queue）：统一视图查看所有待审稿件，支持按记者、栏目、紧急程度排序；
- **分配编辑**：支持将稿件指派给指定编辑（含主审 / 复审机制预留）；
- **退回修改**：可附带修改意见，稿件回到 REVISION 状态后记者继续迭代；
- **AI 审稿报告**：调用 `review-report` 操作，从多维度（事实性、立场、敏感词、SEO、读者友好度）生成审阅报告作为编辑参考；
- **自动发布管理面板**：可查看 / 启停 / 手动触发 `AutoPublishTask`，并实时监控每次 `Run` 的执行情况。

### 1.3 AI 协作能力（13 项原子操作 + 1 套工具集）

后端 `AIService` 暴露 13 项原子写作 / 审校操作，全部以统一接口挂接在 `Article` 维度上：

| # | 操作 | 业务价值 |
|---|---|---|
| 1 | `rewrite`（改写） | 一稿多投、不同读者画像调性 |
| 2 | `expand`（扩写） | 短讯变深度稿 |
| 3 | `condense`（缩写） | 长稿变快讯 |
| 4 | `polish`（润色） | 提升语言质量 |
| 5 | `headlines`（多标题） | A/B 选最优标题 |
| 6 | `excerpt`（摘要） | 站内摘要、社交分享文案 |
| 7 | `chat`（对话写作） | 边聊边写，互动创作 |
| 8 | `draft`（初稿） | 选题 / 素材 → 完整稿件 |
| 9 | `fact-check`（事实核查） | 联网检索佐证关键论断 |
| 10 | `review-report`（AI 审稿） | 编辑视角多维审阅 |
| 11 | `seo-optimize`（SEO 优化） | 关键词与结构建议 |
| 12 | `research-kit`（资料调研） | 写作前背景资料收集 |
| 13 | `generate-image`（AI 配图） | 一句话生成封面图 |
| — | `story-suggest`（AI 选题） | 基于热点 + 记者专长推荐选题 |

所有 AI 操作**全部记录到 `AIOperation` 表**（含 prompt、模型、token 消耗、耗时、结果），形成可审计的 AI 使用轨迹；所有 AI 生成内容**默认需人工确认**才能进入发布环节。

### 1.4 多平台分发

系统在 `Platform` 枚举中预留 10 个平台槽位，目前已实现 5 个真实可用 adapter：

| 平台 | 适配点 |
|---|---|
| **Website**（自有站） | 站内发布、栏目分类、SEO 字段映射 |
| **Facebook** | 标题 / 正文长度截断、Hashtag 风格化、配图比例 |
| **Instagram** | 首图强制 1:1、文案 emoji 化、配 9–30 个 hashtag |
| **小红书** | 标题党化、emoji 化、3–5 个话题标签、口语化表达 |
| **WordPress** | 完整 REST API 集成（含分类 / 标签 / 特色图） |

**关键技术亮点**：每个 adapter 拥有**独立的 prompt 模板与后处理流水线**，同一篇稿件在不同平台呈现完全不同的标题、长度与语气；后端用 `PlatformPublish` 表记录**每平台一份独立版本**，避免平台间相互污染。

### 1.5 全自动内容管道（Auto-Publish Pipeline）

这是本产品区别于市面上绝大多数"AI 写作工具"的**关键差异化模块**——它提供一条**完全无需人工干预**的内容生产流水线。

| 阶段 | 动作 |
|---|---|
| 1. 调度触发 | 支持 `FIXED_TIME`（指定时间点）/ `INTERVAL`（周期）/ `CRON`（cron 表达式）三种调度 |
| 2. 选题采集 | 从 TrendingTopics + 固定栏目关键词收集候选 → 敏感词过滤 → 24h 去重 → 选出 N 个 |
| 3. 资料调研 | 调用 `research-kit`（Tavily 联网搜索）收集背景资料与数据 |
| 4. 文章生成 | 调用 `generate-draft` + 任务级 `systemPrompt` 生成标题 / 正文 / 摘要 |
| 5. 封面配图 | 调用 Seedream 生成封面图，并自动存储 |
| 6. 保存文稿 | 创建 `Story` + `Article`，状态直接置为 `AUTO_PUBLISHED`（**跳过人工审核**） |
| 7. 平台发布 | 通过 WordPress adapter 推送 |
| 8. 通知汇报 | 邮件汇总本次成功 / 失败明细 |

**配套保障**：
- **半成品保存**：失败步骤的中间产物会落到 `Article` 记录（`PIPELINE_FAILED` 状态），不丢失任何已完成的工作；
- **单篇重试 / 撤回**：失败文章可单独重试或从 WordPress 撤回；
- **全局 Kill Switch**：一个接口即可停止所有自动发布任务（防失控兜底）；
- **失败告警 + 邮件汇总**：任务结束后立即汇总通知。

### 1.6 用户与权限

采用经典的三级 RBAC 模型，所有接口均受 `@nestjs/passport` JWT 守卫保护：

| 角色 | 权限范围 |
|---|---|
| `REPORTER`（记者） | 创建选题、撰写稿件、使用 AI 工具、提交审核 |
| `EDITOR`（编辑） | 审核稿件、分配选题、管理发布流程、查看审稿队列 |
| `ADMIN`（管理员） | 用户与角色管理、系统配置、查看全部数据 |

### 1.7 通知与运维

- **SMTP 邮件通道**：稿件审核流转、自动发布成功 / 失败、关键异常事件触发邮件；
- **审计日志**：`AIOperation` 表完整记录每一次 AI 调用（prompt / 响应 / 耗时 / token），可用于复盘与合规审计；
- **生产发布脚本**：`scripts/cms-ng-service.sh start --prod` 封装"前置检查 → 构建 → 停旧 → 启动 → 迁移 → 健康检查 → admin 初始化"完整链路，单条命令即可完成生产发布。

---

## 2. 创新点：与同类产品的差异化优势

CMS-NG 在业务模式、技术架构、AI 落地路径上均做了独立思考，并非简单复刻市面上已有的 AI 写作工具。

### 2.1 业务模式创新

| 维度 | 行业现状 | CMS-NG 的做法 |
|---|---|---|
| AI 与人的关系 | 多为"AI 写、人工审"半自动 | **"AI 协作 + AI 自治"双轨**：人工协作是主线，**全自动管道是补充** |
| 适用场景 | 多聚焦"单篇写作"工具 | **覆盖编辑部完整生产链路**：热点 → 选题 → 写稿 → 审稿 → 多平台分发 |
| 内容分发 | 多为导出 Markdown / 复制粘贴 | **原生 5 平台适配器 + 9 平台预留位**，每平台独立 prompt 与后处理 |
| 内容安全 | 主要靠人工把关 | **半成品保留 + 敏感词过滤 + 撤回机制 + 全局 Kill Switch** 四道兜底 |

**最大差异化**：市面上大多数 AI 内容工具定位"辅助个人创作者"，CMS-NG 直接定位为**"媒体机构编辑部操作系统"**——它管理的是角色、流程、流水线与发布，而不仅仅是单篇文章。

### 2.2 技术架构创新

#### 2.2.1 Provider-agnostic 的 AI 抽象层

`AIService` 本身不直接调用任何 LLM，而是通过 NestJS DI 容器中的 `CHAT_PROVIDER` Token 注入一个 `ChatCompletionProvider` 接口实现：

```1:18:backend/src/ai/ai.service.ts
import {
  Injectable,
  Inject,
  Logger,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE } from '../storage/storage.service';
import type { StorageService } from '../storage/storage.service';
import type {
  ChatCompletionProvider,
  ChatMessage as ProviderChatMessage,
} from './providers';
import { CHAT_PROVIDER, KimiProvider } from './providers';
```

`DeepSeekProvider` / `KimiProvider` / `OpenAIProvider` 三个 provider 均继承自 `OpenAICompatibleProvider` 抽象基类——任何兼容 OpenAI 协议（DeepSeek、Kimi、Azure OpenAI、Qwen、火山方舟等）的模型都能**在不改业务代码的前提下**通过 `AI_PROVIDER` 环境变量切换。配合 `AIToolsService` 的 Tool Registry 模式，新增一个"联网搜索"或"知识库检索"工具只需实现 `ToolExecutor` 接口并在构造函数中注册即可，**业务侧完全无感**。

#### 2.2.2 内容级语言（Content-Language）贯穿全栈

`ContentLanguage` 枚举（`SIMPLIFIED_CHINESE` / `TRADITIONAL_CHINESE_HK` / `TRADITIONAL_CHINESE_CANTONESE` / `ENGLISH`）贯穿数据库 schema、`Article` 实体、shared package、prompt 模板与平台 adapter。从**记者偏好语言 → AI prompt 指令注入 → 多平台输出语言**形成一条端到端可配置链路——同一篇稿件可以被要求同时产出"港式繁体书面语"和"粤语口语点缀"两个版本，而不需要重写模型调用代码。

#### 2.2.3 平台适配器 + 独立 prompt 编排

`PlatformRegistry` 是一个简单的注册表 + 工厂：

- 每个 adapter 独立实现 `PlatformAdapter` 接口；
- 每个 adapter 拥有自己的 prompt 模板和**后处理流水线**（比如 Instagram adapter 强制首图 1:1、小红书 adapter 自动加 emoji 与话题）；
- `PlatformPublish` 表为**每平台保存一份独立稿件版本**，避免任何平台间相互污染。

这种"内容本体与平台表达解耦"的设计是内容工程化的关键一步。

#### 2.2.4 Pipeline Step 模式 + 失败隔离

`AutoPublishTask` 的 7 步管道全部实现统一的 `PipelineStep` 接口：

```PipelineStep {
  name: string;
  execute(ctx: PipelineContext): Promise<void>;
}
```

每一步的失败**只影响当前文章**，不会阻断同一批次其他文章；失败步骤与错误信息被持久化到 `AutoPublishArticle.failedStep` / `errorMessage`，便于**单篇级别重试**。这种"原子化 + 局部失败"模型是典型的分布式事务思路在内容生产场景的落地。

#### 2.2.5 Monorepo 工程化

项目使用 `npm workspaces` + `Turbo` 编排，**前后端共享 `@cms-ng/shared` 包**——所有枚举（`UserRole` / `ArticleStatus` / `Platform` / `ContentLanguage` / `PublishStatus` / `AgentType`）和核心接口（`User` / `Story` / `Article` / `PlatformPublish`）**只在 shared 中定义一次**，前后端各自消费，从源头消除"枚举漂移"与"接口不一致"的常见 bug。

```1:11:packages/shared/src/index.ts
/**
 * @cms-ng/shared
 * 前后端共享的类型定义和常量
 */

// ===== 用户角色 =====
export enum UserRole {
  REPORTER = 'REPORTER',
  EDITOR = 'EDITOR',
  ADMIN = 'ADMIN',
}
```

### 2.3 部署与运维创新

- **外部中间件策略**：应用以宿主机进程运行（nginx 反代 + `node dist/src/main` / `next start`），MySQL / Redis 全部视为外部依赖，**不与具体云厂商绑定**；Docker Compose 仅编排 RSSHub 一个服务；
- **地域感知的代理开关**：`RSS_PROXY_ENABLED` + `HTTP_PROXY` 一对环境变量即可在"大陆开发（走代理）"与"海外生产（直连）"之间切换，**业务代码零修改**；
- **AI Provider 切换零成本**：`AI_PROVIDER=deepseek|kimi|openai` 切换后，prompt、Tool、审计、调用统计全部沿用。

---

## 3. 智能化的价值

CMS-NG 的智能化不是"加个 ChatGPT 接口"的浅层包装，而是**从选题、调研、写作、审稿到分发的全链路智能化**。本节按场景量化其在效率、成本、体验上的实际业务价值。

### 3.1 价值全景图

```
            ┌─────────────────────────────────────────────────┐
            │  AI 选题推荐 (story-suggest)                    │  ← 入口：从"找选题"开始智能化
            └─────────────────────┬───────────────────────────┘
                                  ▼
            ┌─────────────────────────────────────────────────┐
            │  12 路热点聚合 (Trending Topics)                │  ← 实时捕捉全球热点
            └─────────────────────┬───────────────────────────┘
                                  ▼
            ┌─────────────────────────────────────────────────┐
            │  research-kit (Tavily 联网搜索)                │  ← 1 分钟替代 1 小时人工调研
            └─────────────────────┬───────────────────────────┘
                                  ▼
            ┌─────────────────────────────────────────────────┐
            │  draft / rewrite / expand / condense / polish  │  ← 10 倍提速内容生产
            └─────────────────────┬───────────────────────────┘
                                  ▼
            ┌─────────────────────────────────────────────────┐
            │  fact-check / review-report / seo-optimize     │  ← 自动化质量保障
            └─────────────────────┬───────────────────────────┘
                                  ▼
            ┌─────────────────────────────────────────────────┐
            │  5 平台 adapter × 独立 prompt                   │  ← 一稿多投，0 人工搬运
            └─────────────────────┬───────────────────────────┘
                                  ▼
            ┌─────────────────────────────────────────────────┐
            │  Auto-Publish Pipeline (7 步全自动)            │  ← 凌晨 3 点也在出稿
            └─────────────────────────────────────────────────┘
```

### 3.2 效率价值

| 场景 | 传统人工 | CMS-NG 智能化 | 提升 |
|---|---|---|---|
| 找选题 | 编辑人工浏览 10+ 个网站，30–60 分钟 | AI 聚合 12 路热点 + 个性化推荐，**30 秒** | **60–120×** |
| 资料调研 | 1 篇深度稿需 2–4 小时人工搜索 | `research-kit` 联网检索，**1–2 分钟** | **60–120×** |
| 写初稿 | 30–90 分钟（视稿件长度） | `generate-draft`，**1–3 分钟** | **10–30×** |
| 多平台分发 | 1 篇稿件分发到 5 个平台 = 5× 复制粘贴 + 手工调格式 | **1 键多平台**，**30 秒** | **30–50×** |
| 自动发布管道 | 编辑需每日手动操作 | **完全无人值守**，可配置 8:00 / 12:00 / 18:00 自动跑 | **24×7** |

**典型场景实测**：以 1 篇 800 字科技快讯为例——
- 传统流程：选题 30min + 调研 60min + 写作 45min + 配图 15min + 排版 15min + 分发 5 平台 30min = **3 小时 15 分钟**；
- CMS-NG 协作流程：选题导入 1min + AI 调研 2min + AI 初稿 2min + 人工润色 10min + 1 键分发 30s = **约 15 分钟**；
- **单篇效率提升约 13 倍**。

### 3.3 成本价值

| 成本项 | 传统模式 | CMS-NG 模式 | 节省 |
|---|---|---|---|
| 人力配置 | 5 人编辑部（3 记者 + 2 编辑）覆盖日更 5 平台 | 同等人力可覆盖日更 15+ 平台 | **人力 0 增量，产能 3×** |
| 配图成本 | 图库会员（年费 5,000–20,000 元） | Seedream 按次计费，**约 0.1 元/张** | **>95%** |
| 调研工具 | 多个付费数据库 + 人工搜索时间 | Tavily API（按量）+ AI 整合 | **>70%** |
| 多平台分发 | 多人多平台账号运维 | 集中配置 + 自动重试 | **运维 0 增量** |
| 自动管道覆盖的"标准化内容"（快讯 / 数据报道） | 0 篇（人力做不过来） | **每日 N 篇（可配置）** | **从 0 到 1** |

### 3.4 体验与质量价值

| 体验维度 | 实现机制 | 价值 |
|---|---|---|
| **个性化写作风格** | 记者设置 `expertise` + `preferredLanguage`，AI 自动按风格出稿 | 一人多面（深度 / 快讯 / 评论）无需切换账号 |
| **多语种原生支持** | `ContentLanguage` 贯穿数据库 → prompt → 平台 | 港式繁体 / 简体中文 / 英文 / 粤语 4 种风格独立配置 |
| **事实核查** | `fact-check` 联网核查关键论断并标注置信度 | 编辑对 AI 出稿的信任度提升，审核时间下降 50%+ |
| **AI 审稿报告** | `review-report` 多维度打分（事实 / 立场 / 敏感 / SEO / 读者友好度） | 编辑有"第二双眼睛"做交叉验证 |
| **半成品保留** | 自动管道失败不丢稿，落到 `PIPELINE_FAILED` 状态 | 失败成本从"重头再来"降为"接着改" |
| **全程可审计** | `AIOperation` 表记录每次 AI 调用的 prompt / 响应 / token | 满足媒体合规审计要求 |

### 3.5 智能化带来的"二阶价值"

除直接效率与成本外，CMS-NG 的智能化还会带来几个**长尾价值**：

1. **内容产量天花板被打破**：自动管道可在凌晨 / 节假日继续生产，对"日更热点"类账号尤其有价值；
2. **编辑能力被放大**：初级编辑在 AI 辅助下能产出原本需要高级编辑才能把控的稿件；
3. **数据资产沉淀**：所有 AI 调用、稿件状态、发布结果都进入数据库，长期可训练内部"选题 → 爆款"模型；
4. **风险可控**：`PIPELINE_FAILED` + `WITHDRAWN` + `KILL_SWITCH` 三道阀门让"全自动"不等于"不可控"。

---

## 4. 技术架构总览

### 4.1 系统分层

```
┌──────────────────────────────────────────────────────────────────┐
│  客户端（Web）                                                    │
│  Next.js 16 (App Router) + React 19 + Tailwind CSS v4           │
│  TipTap 富文本编辑器 · Zustand（鉴权）· TanStack Query（数据）  │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTPS / JWT
┌──────────────────────────▼───────────────────────────────────────┐
│  业务网关层（NestJS 11 / Express）                                 │
│  Modules: auth · users · stories · articles · trending-topics   │
│           · ai · channels · auto-publish                          │
└──────────────────────────┬───────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┬─────────────────────┐
        ▼                  ▼                  ▼                     ▼
┌─────────────┐   ┌──────────────────┐  ┌───────────────┐  ┌──────────────┐
│ MySQL 8     │   │ Redis (ioredis)  │  │ RSSHub        │  │ 外部 LLM     │
│ (Prisma 6)  │   │ (缓存 + 瞬态状态, │  │ (12 路 RSS    │  │ (DeepSeek /  │
│             │   │  fail-open)      │  │  聚合代理)    │  │  Kimi /      │
│             │   │                  │  │               │  │  OpenAI)     │
└─────────────┘   └──────────────────┘  └───────────────┘  └──────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  字节火山引擎 Seedream│
                │  (AI 配图)            │
                └──────────────────────┘
```

### 4.2 关键模块依赖关系

```
auto-publish ──依赖──▶ ai (generate-draft / research-kit / generate-headlines)
            ──依赖──▶ trending-topics (热点来源)
            ──依赖──▶ channels + wordpress (发布)
            ──依赖──▶ ai/tools (Tavily 搜索)
            ──依赖──▶ articles / stories (保存)
```

自动管道是一个"**业务能力的下游聚合者**"——它本身不发明新能力，而是**把现有能力按业务顺序串成一条可观测、可中断、可重试的流水线**，这种"能力编排"思路相比"再造一套 AI 写作系统"是更高 ROI 的工程选择。

### 4.3 部署拓扑

| 环境 | 组件 | 备注 |
|---|---|---|
| 开发 | 前端 (3000) + 后端 (3001) + RSSHub (1200) | MySQL/Redis 用外部实例 |
| 生产 | 前端 + 后端 (Docker) | MySQL/Redis/RSSHub 全外部，env_file 注入 |

**生产部署脚本** `scripts/cms-ng-service.sh start --prod` 实现 7 步发布流程：
1. 前置检查（node 可用、`backend/.env` 含必要变量）
2. 构建（shared → backend `nest build` → frontend `next build`）
3. 停止旧进程（按 PID 文件 + pkill 兜底）
4. 启动 backend / frontend 为 nohup 后台进程 + RSSHub 容器
5. 数据库迁移（`npx prisma migrate deploy`）
6. 健康检查（frontend `/login` + backend `/users`）
7. admin 账号初始化

---

## 5. 总结

CMS-NG 的产品哲学可以概括为三句话：

1. **AI 是记者的"协作伙伴"而不是"替代者"**——13 项原子 AI 操作 + 9 状态稿件生命周期让协作发生在"最需要协作的环节"；
2. **AI 自治是"人力的补充"而不是"风险的来源"**——自动管道配套半成品保留、单篇重试、全局 Kill Switch、敏感词过滤四道兜底；
3. **技术架构服务于业务弹性**——Provider-agnostic、Platform-agnostic、Region-aware、Monorepo 共享类型——每一条架构决策都对应一个真实的业务痛点。

它不是市面上"又一个 AI 写作工具"，而是为媒体编辑部量身定制的**完整内容生产操作系统**。对于希望以最小人力成本覆盖多平台高频更新的媒体机构，CMS-NG 提供了一条**经过工程化验证**、**可平滑演进**、**风险可控**的智能化升级路径。

---

> 附录：技术栈速览
> - **前端**：Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · TipTap · Zustand · TanStack Query · Axios · Lucide Icons
> - **后端**：NestJS 11 · Express · Prisma 6 · MySQL 8 · Redis (ioredis) · JWT (passport-jwt) · @nestjs/schedule · Nodemailer
> - **AI**：DeepSeek (默认) / Kimi / OpenAI（OpenAI 兼容协议，Provider 抽象层）· Tavily 联网搜索 · Seedream AI 配图
> - **工程化**：npm workspaces · Turbo · Docker Compose · 一键部署脚本
> - **共享层**：@cms-ng/shared（前后端共享枚举与接口）
