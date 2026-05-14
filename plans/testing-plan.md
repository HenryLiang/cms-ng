# CMS-NG 项目测试计划

## 1. 项目背景与现状

CMS-NG（01创作大脑）是一个 AI 驱动的内容创作系统，采用 monorepo 架构：
- **前端**：Next.js 16 + React 19 + Tailwind CSS v4
- **后端**：NestJS 11 + Prisma ORM + MySQL 8 + Redis
- **共享包**：`@cms-ng/shared` 提供前后端共享类型

### 1.1 当前测试覆盖情况

| 测试层级 | 状态 | 说明 |
|---------|------|------|
| Backend Service 单元测试 | 良好 | 6/6 个 Service 均有测试，覆盖 CRUD + AI 操作 + 异常路径 |
| Backend Controller 测试 | 缺失 | 0/5 个 Controller 有测试 |
| Backend Guard/Strategy/Decorator | 缺失 | JWT 认证中间件无测试 |
| Backend DTO 验证测试 | 缺失 | class-validator 规则未验证 |
| Backend E2E 测试 | 几乎为空 | 仅 1 个根路由测试 |
| Frontend 单元/组件/E2E 测试 | 完全缺失 | 无任何测试框架和测试文件 |

### 1.2 现有测试基础设施

- **Backend**：Jest 30 + ts-jest + @nestjs/testing + supertest
- **Prisma Mock**：`backend/src/prisma/prisma.service.mock.ts`
- **Test Helpers**：`backend/src/common/test-helpers.ts`
- **E2E 配置**：`backend/test/jest-e2e.json`

---

## 2. 测试策略

采用**金字塔模型**，按优先级分层推进：

```
        /\\
       /  \\      E2E 测试（关键用户旅程）
      /____\\
     /      \\    集成测试（Controller + Service + 真实 DB）
    /________\\
   /          \\  单元测试（Service/Utils 已有，需补 Controller/前端）
  /____________\\
```

### 2.1 测试类型定义

| 类型 | 范围 | 目标 | 工具 |
|------|------|------|------|
| 单元测试 | 单个函数/类 | 验证业务逻辑正确性 | Jest (后端) / Vitest (前端) |
| 集成测试 | Controller + Service + DB | 验证接口契约和数据流 | Jest + 测试数据库 |
| E2E 测试 | 完整用户旅程 | 验证核心业务流程 | Playwright |

---

## 3. 后端测试计划

### 3.1 Phase 1: Controller 单元测试（高优先级）

**目标**：为所有 Controller 补充单元测试，验证 HTTP 接口行为、DTO 解析、认证守卫触发。

| 模块 | 文件路径 | 测试重点 |
|------|---------|---------|
| Auth | `src/auth/auth.controller.spec.ts` | 注册/登录接口、DTO 验证错误、JWT 响应格式 |
| Stories | `src/stories/stories.controller.spec.ts` | CRUD 接口、JWT 守卫、`?all=true` 权限参数 |
| Articles | `src/articles/articles.controller.spec.ts` | CRUD 接口、7 个 AI 操作端点、权限校验 |
| TrendingTopics | `src/trending-topics/trending-topics.controller.spec.ts` | CRUD 接口、adopt 操作、Google Trends 接口 |

**技术方案**：
- 使用 `@nestjs/testing` 的 `Test.createTestingModule`
- Service 层使用 `createMock()` mock
- 验证 Guard 触发（通过 `CanActivate` mock 或真实 JWT Guard）
- 验证响应状态码和数据格式

### 3.2 Phase 2: 认证中间件测试（高优先级）

| 组件 | 文件路径 | 测试重点 |
|------|---------|---------|
| JwtAuthGuard | `src/auth/jwt-auth.guard.spec.ts` | 有效 token、过期 token、缺失 token、格式错误 |
| JwtStrategy | `src/auth/jwt.strategy.spec.ts` | payload 验证、用户查找、无效用户 |
| CurrentUser | `src/auth/current-user.decorator.spec.ts` | 装饰器从 request 提取用户信息 |

**技术方案**：
- `JwtAuthGuard`：mock `ExecutionContext`，验证 `canActivate` 返回值和异常
- `JwtStrategy`：mock `AuthService`，验证 `validate` 方法

### 3.3 Phase 3: DTO 验证测试（中优先级）

| DTO 文件 | 测试文件 | 验证规则 |
|---------|---------|---------|
| `login.dto.ts` | `auth/dto/login.dto.spec.ts` | email 格式、密码最小 6 位 |
| `register.dto.ts` | `auth/dto/register.dto.spec.ts` | email、name 最小 2 位、role 枚举 |
| `create-story.dto.ts` | `stories/dto/create-story.dto.spec.ts` | title 必填、status 枚举、tags 数组 |
| `create-article.dto.ts` | `articles/dto/create-article.dto.spec.ts` | storyId UUID、title/content 必填 |
| `ai-operations.dto.ts` | `articles/dto/ai-operations.dto.spec.ts` | selectedText 必填、style 枚举 |

**技术方案**：
- 使用 `class-validator` 的 `validate()` 函数
- 测试有效数据通过、无效数据返回正确错误信息
- 测试边界条件（空字符串、null、undefined）

### 3.4 Phase 4: E2E 测试（高优先级）

**目标**：覆盖核心业务 API 的端到端流程，使用真实数据库或内存数据库。

| 测试文件 | 覆盖场景 |
|---------|---------|
| `test/auth.e2e-spec.ts` | 注册 -> 登录 -> 获取用户信息 -> Token 过期处理 |
| `test/stories.e2e-spec.ts` | 创建选题 -> 列表查询 -> 详情查询 -> 更新 -> 删除 |
| `test/articles.e2e-spec.ts` | 创建稿件（含版本快照）-> 更新（触发新版本）-> AI 操作 -> 删除 |
| `test/trending-topics.e2e-spec.ts` | 创建热点 -> AI 建议 -> adopt 为 Story -> Google Trends 查询 |

**技术方案**：
- 使用 `supertest` + NestJS 测试模块
- 数据库：使用独立测试数据库 `cms_ng_test`，每个测试前清理数据
- AI 调用：使用 `nock` 或 MSW mock Kimi API 响应
- 认证：通过登录接口获取真实 JWT，后续请求携带

**测试数据库配置**：
```bash
# 创建测试数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS cms_ng_test;"
# .env.test
DATABASE_URL="mysql://root:root123@localhost:3306/cms_ng_test"
```

### 3.5 Phase 5: 边界和异常测试（中优先级）

| 风险点 | 测试内容 |
|--------|---------|
| JSON 字段序列化 | tags/platforms/expertise 的 `JSON.stringify`/`JSON.parse` 边界（空数组、null、特殊字符） |
| AI 故障降级 | API 超时/5xx/网络错误时的 fallback 行为 |
| 版本控制逻辑 | content/title 不变时不创建版本、超长内容版本快照 |
| 并发场景 | 同时更新同一文章、同一选题被多人 adopt |
| 权限边界 | editor/admin 的 `?all=true` vs reporter 只能看自己 |

---

## 4. 前端测试计划

### 4.1 测试框架选型

| 工具 | 用途 | 安装命令 |
|------|------|---------|
| Vitest | 单元/集成测试框架 | `npm install -D vitest @vitejs/plugin-react` |
| React Testing Library | 组件测试 | `npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event` |
| jsdom | DOM 环境 | `npm install -D jsdom` |
| MSW | API Mock | `npm install -D msw` |
| Playwright | E2E 测试 | `npm install -D @playwright/test` |

### 4.2 Phase 1: 工具层和状态管理单元测试（高优先级）

| 文件 | 测试文件 | 测试重点 |
|------|---------|---------|
| `lib/api.ts` | `lib/api.test.ts` | Axios 拦截器（Token 附加、401 处理、重定向） |
| `store/auth-store.ts` | `store/auth-store.test.ts` | 登录/注册/登出/持久化、状态变化 |
| `hooks/use-protected-route.ts` | `hooks/use-protected-route.test.ts` | 认证状态变化时的重定向逻辑 |

### 4.3 Phase 2: 页面组件测试（高优先级）

| 页面 | 测试文件 | 测试重点 |
|------|---------|---------|
| `login/page.tsx` | `app/login/page.test.tsx` | 表单验证、提交调用、错误显示、加载状态 |
| `register/page.tsx` | `app/register/page.test.tsx` | 类似登录页 + 姓名字段验证 |
| `dashboard/layout.tsx` | `app/dashboard/layout.test.tsx` | 导航渲染、登出按钮、用户信息 |
| `dashboard/page.tsx` | `app/dashboard/page.test.tsx` | 看板渲染、4 列状态过滤、StoryCard 交互 |
| `dashboard/stories/page.tsx` | `app/dashboard/stories/page.test.tsx` | 热点列表、AI 推荐面板、Google Trends 面板 |
| `dashboard/stories/new/page.tsx` | `app/dashboard/stories/new/page.test.tsx` | 表单提交、验证、跳转 |
| `dashboard/articles/[id]/page.tsx` | `app/dashboard/articles/[id]/page.test.tsx` | 编辑器渲染、AI 浮动菜单、标题实验室 |

**技术方案**：
- MSW 拦截 API 请求，返回 mock 数据
- mock `window.confirm` 用于删除操作
- mock `localStorage` 用于 Token 管理

### 4.4 Phase 3: E2E 测试（中优先级）

| 场景 | 测试文件 | 步骤 |
|------|---------|------|
| 核心创作流程 | `e2e/create-article.spec.ts` | 注册 -> 登录 -> 新建选题 -> 选题详情 -> 新建稿件 -> 编辑器 -> 提交审核 |
| AI 辅助创作 | `e2e/ai-assist.spec.ts` | 进入编辑器 -> 选中文本 -> AI 改写 -> 应用结果 -> 生成标题 -> 生成摘要 |
| 选题中心 | `e2e/topic-center.spec.ts` | 进入选题中心 -> 获取 AI 推荐 -> 采纳选题 -> 查看看板 |
| 认证和权限 | `e2e/auth.spec.ts` | 未登录访问 `/dashboard` 重定向 -> 登录成功跳转 -> Token 过期处理 |

### 4.5 前端测试基础设施配置

**Vitest 配置**（`frontend/vitest.config.ts`）：
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

**测试 Setup 文件**（`frontend/src/test/setup.ts`）：
- 导入 `@testing-library/jest-dom` matchers
- mock `matchMedia`、`IntersectionObserver`、`ResizeObserver`
- MSW server 启动/停止

---

## 5. 实施路线图

### Sprint 1（第 1-2 周）：补齐后端 Controller 和认证测试

- [ ] `auth.controller.spec.ts` — 注册/登录/获取用户信息
- [ ] `jwt-auth.guard.spec.ts` — Token 验证
- [ ] `jwt.strategy.spec.ts` — Payload 验证
- [ ] `stories.controller.spec.ts` — CRUD + 权限
- [ ] `articles.controller.spec.ts` — CRUD + AI 操作
- [ ] `trending-topics.controller.spec.ts` — CRUD + adopt

**验收标准**：
```bash
cd backend && npm run test:cov
# Controller 层覆盖率 >= 80%
```

### Sprint 2（第 3-4 周）：后端 E2E 测试

- [ ] `test/auth.e2e-spec.ts`
- [ ] `test/stories.e2e-spec.ts`
- [ ] `test/articles.e2e-spec.ts`
- [ ] `test/trending-topics.e2e-spec.ts`
- [ ] 配置测试数据库和测试环境

**验收标准**：
```bash
cd backend && npm run test:e2e
# 所有 E2E 测试通过
```

### Sprint 3（第 5-6 周）：前端测试基础设施 + 工具层测试

- [ ] 安装 Vitest + React Testing Library + jsdom + MSW
- [ ] 配置 Vitest + 测试 setup 文件
- [ ] `lib/api.test.ts`
- [ ] `store/auth-store.test.ts`
- [ ] `hooks/use-protected-route.test.ts`

**验收标准**：
```bash
cd frontend && npm test
# 工具层测试全部通过
```

### Sprint 4（第 7-8 周）：前端页面组件测试

- [ ] `login/page.test.tsx`
- [ ] `register/page.test.tsx`
- [ ] `dashboard/layout.test.tsx`
- [ ] `dashboard/page.test.tsx`
- [ ] `dashboard/stories/page.test.tsx`
- [ ] `dashboard/stories/new/page.test.tsx`

### Sprint 5（第 9-10 周）：前端核心功能 + E2E

- [ ] `dashboard/articles/[id]/page.test.tsx`（最复杂页面）
- [ ] 安装配置 Playwright
- [ ] `e2e/auth.spec.ts`
- [ ] `e2e/create-article.spec.ts`
- [ ] `e2e/ai-assist.spec.ts`

---

## 6. 质量指标

| 指标 | 目标 | 当前 | 达成方式 |
|------|------|------|---------|
| 后端 Service 测试覆盖率 | >= 80% | ~70%（估计） | 已有测试，运行 `test:cov` |
| 后端 Controller 测试覆盖率 | >= 80% | 0% | 新增 Controller spec |
| 后端 E2E 核心场景覆盖 | 100% | ~5% | 新增 4 个 E2E 文件 |
| 前端单元测试覆盖率 | >= 70% | 0% | 新增 Vitest + RTL 测试 |
| 前端 E2E 核心流程覆盖 | 100% | 0% | 新增 Playwright 测试 |
| 测试执行时间 | < 60s | 未知 | 并行执行 + 合理 mock |

---

## 7. 关键风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|---------|
| 前端组件高度耦合，难以单元测试 | 中 | 优先测试工具层和状态管理；复杂组件使用 E2E 覆盖 |
| AI 服务调用不稳定，测试易失败 | 中 | AI 相关测试全部 mock Kimi API 响应 |
| 数据库测试数据污染 | 低 | 使用独立测试数据库，每个测试前 truncate |
| 测试维护成本高 | 低 | 遵循 AAA 模式（Arrange-Act-Assert），避免过度 mock |

---

## 8. 附录：关键文件清单

### 已存在的基础设施
- `backend/jest` 配置：内嵌于 `backend/package.json`
- `backend/test/jest-e2e.json`：E2E 测试配置
- `backend/src/prisma/prisma.service.mock.ts`：Prisma Mock 工厂
- `backend/src/common/test-helpers.ts`：通用测试辅助

### 需新增的文件
```
backend/src/auth/auth.controller.spec.ts
backend/src/auth/jwt-auth.guard.spec.ts
backend/src/auth/jwt.strategy.spec.ts
backend/src/stories/stories.controller.spec.ts
backend/src/articles/articles.controller.spec.ts
backend/src/trending-topics/trending-topics.controller.spec.ts
backend/test/auth.e2e-spec.ts
backend/test/stories.e2e-spec.ts
backend/test/articles.e2e-spec.ts
backend/test/trending-topics.e2e-spec.ts

frontend/vitest.config.ts
frontend/src/test/setup.ts
frontend/src/lib/api.test.ts
frontend/src/store/auth-store.test.ts
frontend/src/hooks/use-protected-route.test.ts
frontend/src/app/login/page.test.tsx
frontend/src/app/register/page.test.tsx
frontend/src/app/dashboard/layout.test.tsx
frontend/src/app/dashboard/page.test.tsx
frontend/src/app/dashboard/stories/page.test.tsx
frontend/src/app/dashboard/stories/new/page.test.tsx
frontend/src/app/dashboard/articles/[id]/page.test.tsx
frontend/e2e/auth.spec.ts
frontend/e2e/create-article.spec.ts
frontend/e2e/ai-assist.spec.ts
```
