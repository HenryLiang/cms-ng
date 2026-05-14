# 01创作大脑 (CMS-NG)

AI驱动的内容创作作业系统，面向香港 01 媒体的新闻编辑团队。以"记者 + AI"协作模式为核心，覆盖选题发现、稿件创作、编辑审核到多平台分发的完整内容生产链路。

---

## 技术架构

```
cms-ng/
├── frontend/          # Next.js 16 + React 19 + Tailwind CSS v4
├── backend/           # NestJS 11 + Prisma ORM + MySQL 8
├── packages/shared/   # 前后端共享类型与常量
└── docker-compose.yml # MySQL + Redis 容器编排
```

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 16 (App Router), React 19, TypeScript |
| 状态管理 | Zustand |
| 数据请求 | TanStack Query (React Query), Axios |
| UI 样式 | Tailwind CSS v4, Lucide Icons |
| 后端框架 | NestJS 11, Express |
| ORM | Prisma (MySQL 8) |
| 缓存/队列 | Redis (ioredis) |
| AI 模型 | Kimi (Moonshot AI) via REST API |
| 认证 | JWT (@nestjs/jwt) |
| Monorepo | npm workspaces + Turbo |

---

## 核心功能模块

| 模块 | 功能 |
|------|------|
| **记者工作台** | 创建选题、撰写稿件、管理稿件生命周期 |
| **选题中心** | 热点话题录入、AI 智能选题推荐、Google Trends 热点聚合与一键导入 |
| **AI 协作创作** | AI 辅助改写、扩写、润色、生成标题/摘要、写作对话 |
| **编辑审核台** | 稿件审核流程、版本对比、退回修改 |
| **多平台分发** | 支持网站、Facebook、Instagram、X (Twitter) 多平台发布 |
| **管理后台** | 用户与角色管理（记者 / 编辑 / 管理员）|

---

## 快速开始

### 前置依赖

- Node.js >= 20
- Docker & Docker Compose（用于 MySQL + Redis）
- Kimi API Key（AI 功能必需）

### 1. 克隆与安装

```bash
git clone https://github.com/HenryLiang/cms-ng.git
cd cms-ng
npm install
```

### 2. 启动基础设施

```bash
docker-compose up -d
```

这将启动：
- MySQL 8 @ `localhost:3307`，数据库 `cms_ng`，root 密码 `root123`
- Redis 7 @ `localhost:6379`

### 3. 配置环境变量

```bash
# 后端
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入你的 Kimi API Key

# 前端
cp frontend/.env.example frontend/.env.local
```

**关键环境变量：**

```env
# backend/.env
DATABASE_URL="mysql://root:root123@localhost:3307/cms_ng"
REDIS_URL="redis://localhost:6379"
KIMI_API_KEY="your-kimi-api-key"
KIMI_API_BASE="https://api.moonshot.cn/v1"
KIMI_MODEL="moonshot-v1-8k"
JWT_SECRET="change-me-in-production"
PORT=3001

# frontend/.env.local
NEXT_PUBLIC_API_URL="http://localhost:3001"
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

---

## 数据库模型

```
User          ──1:N── Story (reporter)
               ──1:N── Article (author)
               ──1:N── AIOperation

Story         ──1:N── Article

Article       ──1:N── ArticleVersion
               ──1:N── AIOperation

TrendingTopic  (热点话题，支持 Google Trends 导入)
```

完整 Schema 见 `backend/prisma/schema.prisma`。

---

## API 端点概览

| 模块 | 基础路径 |
|------|----------|
| 认证 | `POST /auth/login`, `POST /auth/register` |
| 用户 | `GET /users`, `GET /users/:id` |
| 选题 | `GET /stories`, `POST /stories`, `GET /stories/:id` |
| 稿件 | `GET /articles`, `POST /articles`, `GET /articles/:id` |
| 热点 | `GET /trending-topics`, `POST /trending-topics` |
| Google Trends | `GET /trending-topics/google-trends?geo=HK&timeRange=24h` |
| AI | `POST /ai/story-suggestions`, `POST /ai/rewrite`, `POST /ai/polish` 等 |

---

## 项目结构

```
cms-ng/
├── frontend/
│   ├── src/app/              # Next.js App Router 路由
│   │   ├── (dashboard)/      # 仪表板路由组
│   │   │   ├── page.tsx      # 首页 / 工作台
│   │   │   ├── stories/      # 选题中心
│   │   │   ├── articles/     # 稿件管理
│   │   │   └── layout.tsx    # 仪表板布局
│   │   ├── login/page.tsx    # 登录页
│   │   └── register/page.tsx # 注册页
│   ├── src/components/       # React 组件
│   ├── src/lib/              # API 客户端、工具函数
│   ├── src/hooks/            # 自定义 React Hooks
│   └── src/stores/           # Zustand 状态管理
│
├── backend/
│   ├── src/
│   │   ├── auth/             # JWT 认证模块
│   │   ├── users/            # 用户管理
│   │   ├── stories/          # 选题业务逻辑
│   │   ├── articles/         # 稿件业务逻辑
│   │   ├── trending-topics/  # 热点话题 + Google Trends
│   │   ├── ai/               # AI 服务抽象层（Kimi）
│   │   ├── prisma/           # Prisma Service
│   │   └── common/           # 守卫、拦截器、测试工具
│   └── prisma/
│       ├── schema.prisma     # 数据库 Schema
│       └── migrations/       # 迁移文件
│
└── packages/shared/
    └── src/index.ts          # 共享类型、枚举、接口
```

---

## 已集成的外部数据源

- **Google Trends RSS** — 实时热点获取，支持按地区（HK/TW/US/GB/JP/KR/CN/全球）和时间范围筛选

---

## AI 功能

基于 Kimi (Moonshot AI) 提供：

- **选题推荐** — 根据记者专长和近期热点生成个性化选题建议
- **改写** — 调整文章风格或视角
- **扩写** — 扩展段落内容
- **润色** — 优化语言表达
- **生成标题** — 多选项标题生成
- **生成摘要** — 自动提取文章摘要
- **写作对话** — 与 AI 实时协作写作

所有 AI 输出均需人工审核确认，不会自动发布。

---

## 用户角色

| 角色 | 权限 |
|------|------|
| REPORTER（记者）| 创建选题、撰写稿件、使用 AI 辅助工具 |
| EDITOR（编辑）| 审核稿件、分配选题、管理发布流程 |
| ADMIN（管理员）| 用户管理、系统配置、全部权限 |

---

## 许可证

UNLICENSED — 私有项目。
