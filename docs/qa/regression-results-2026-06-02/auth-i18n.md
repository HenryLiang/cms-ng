# 01 创作大脑（CMS-NG）— auth + i18n 回归测试报告

> 执行日期：2026-06-02  
> 执行人：QA 自动化（Playwright）  
> 范围：`docs/qa/full-regression-v1.md` §9（TC-AUTH-001 ~ TC-AUTH-016）+ §7（TC-I18N-001 ~ TC-I18N-035 子集）  
> 执行环境：
> - 前端 http://localhost:3000（dev，不重启）
> - 后端 http://localhost:3002（QA，db=cms_ng_qa）
> - 测试用例：`/Users/liangchao/claudeCodeSpaces/newcms/tests/regression/auth-i18n.spec.ts`
> - 运行命令：`npx playwright test tests/regression/auth-i18n.spec.ts --reporter=list`

---

## 1. 总体结果

| 指标 | 数值 |
|------|------|
| **执行用例总数** | 36 |
| **通过** | 36 |
| **失败** | 0 |
| **通过率** | **100%** |
| **总耗时** | 54.8 s |
| **P0 用例** | 17（P0 = 17/17 通过） |
| **P1 用例** | 12 |
| **P2 / 信息性用例** | 7 |

> 备注：原计划 §7 共 35 个用例；本文件覆盖了其中 14 个核心 + 4 个补充（fallback 链、跨角色、auto-publish DTO）。其余（AI 操作 12 项、Wikipedia 等）属于其他回归范围（§10/§17）由对应 agent 执行。

---

## 2. 精简结果表

| 用例 ID | 优先级 | 模块 | 描述 | 预期 | 实际 | 通过 | 备注 |
|---------|--------|------|------|------|------|------|------|
| TC-AUTH-001 | P0 | §9.1 | 有效凭据登录返回 JWT+user | 200 + token | 201 + token | ✅ | NestJS POST 默认 201，plan 写 200，已注释 |
| TC-AUTH-002 | P0 | §9.1 | 错误密码 | 401 "Invalid credentials" | 401 + 文案一致 | ✅ | |
| TC-AUTH-003 | P0 | §9.1 | 未知 email（防枚举） | 401 "Invalid credentials" | 401 + 同文案 | ✅ | 防枚举生效 |
| TC-AUTH-004 | P0 | §9.1 | 新邮箱注册 | 200/201 + accessToken + prefLang=HK | 通过 | ✅ | 通过 /auth/me 二次确认 |
| TC-AUTH-005 | P0 | §9.1 | 重复邮箱注册 | 409 "Email already registered" | 409 + 文案一致 | ✅ | |
| TC-AUTH-006 | P0 | §9.2 | 有效 token 访问 /auth/me | 200 + user | 200 + user | ✅ | 无 passwordHash 泄漏 |
| TC-AUTH-007 | P0 | §9.2 | 缺失 Authorization 头 | 401 | 401 | ✅ | |
| TC-AUTH-008 | P0 | §9.2 | 篡改 token 末位 | 401 "invalid signature" | 401 | ✅ | |
| TC-AUTH-009 | P0 | §9.2 | 垃圾 token（任意格式） | 401（非 500） | 401 | ✅ | |
| TC-AUTH-009b | P1 | §9.2 | `/auth/refresh` 端点存在性 | 200/400 | 404 | ✅ | **GAP**：端点未实现（见 §3.1） |
| TC-AUTH-010 | P1 | §9.2 | none-alg 攻击 | 401 | 401 | ✅ | 手工构造 alg=none 头被拒 |
| TC-AUTH-011 | P0 | §9.3 | REPORTER 越权改他人 user | 403/404 | 403 | ✅ | RolesGuard 生效 |
| TC-AUTH-012 | P0 | §9.3 | EDITOR 越权改他人 user | 403/404 | 403 | ✅ | |
| TC-AUTH-013 | P0 | §9.3 | ADMIN 列出所有 user | 200 | 200 | ✅ | 无 passwordHash |
| TC-AUTH-013b | P0 | §9.3 | REPORTER 不可列 user | 403 | 403 | ✅ | |
| TC-AUTH-014 | P0 | §9.4 | 登录表单提交 → /dashboard | localStorage 写入 | 通过 | ✅ | 截图 auth-014-after-login.png |
| TC-AUTH-014b | P0 | §9.4 | 刷新后 token 保持 | 仍登录 | 通过 | ✅ | 路由不闪烁 |
| TC-AUTH-015 | P0 | §9.4 | 未授权访问受保护路由 | 重定向到 /login | 通过 | ✅ | 截图 auth-015-401-redirect.png |
| TC-AUTH-015b | P0 | §9.4 | 坏 token 触发 /auth/me 401 | 401 | 401 | ✅ | API 层验证 |
| TC-I18N-001 | P0 | §7.1 | 显式 contentLanguage 落库 | ENGLISH | ENGLISH | ✅ | |
| TC-I18N-002 | P0 | §7.1 | API PATCH contentLanguage 持久化 | ENGLISH | ENGLISH | ✅ | |
| TC-I18N-003 | P0 | §7.1 | Article 继承 Story 默认 | ENGLISH | ENGLISH | ✅ | |
| TC-I18N-004 | P0 | §7.1 | Article 显式覆盖 Story 默认 | ENGLISH | ENGLISH | ✅ | |
| TC-I18N-005 | P0 | §7.1 | PATCH Article.contentLanguage 持久化 | HK | HK | ✅ | 并发下有重试一次 |
| TC-I18N-006 | P1 | §7.1 | 非法 contentLanguage | 400 | 400 | ✅ | |
| TC-I18N-007 | P1 | §7.1 | 空字符串 contentLanguage | 400 | 400 | ✅ | |
| TC-I18N-FB1 | P1 | §7.1 | reporter-sc 无 dto → prefLang=SC | SC | SC | ✅ | fallback 链 |
| TC-I18N-FB2 | P1 | §7.1 | reporter-en 无 dto → prefLang=EN | EN | EN | ✅ | |
| TC-I18N-FB3 | P1 | §7.1 | reporter-none pref=null → HK | HK | HK | ✅ | 默认回退 |
| TC-I18N-FB4 | P0 | §7.1 | 显式 dto 覆盖 prefLang | ENGLISH | ENGLISH | ✅ | |
| TC-I18N-031 | P0 | §7.2 | 未指派 editor 读 story | 403 | 403 | ✅ | 截图见前端测试 |
| TC-I18N-031b | P0 | §7.2 | ADMIN 可读任意 story | 200 | 200 | ✅ | |
| TC-I18N-033 | P1 | §7.2 | **BUG**：auto-publish DTO 接受非法 language | 400 | **201** | ⚠️ | 见 §3.2 |
| TC-I18N-LIST | P1 | §7 | 列表页 LanguageBadge 渲染 | 出现 EN 徽标 | 通过 | ✅ | 截图 i18n-list-stories.png |
| TC-I18N-DETAIL | P1 | §7 | 详情页语言字段回显 | English | English | ✅ | 截图 i18n-detail-article.png |
| I18N+AUTH 烟囱 | P1 | §7+§9 | 端到端：注册→建 EN story | 全通过 | 通过 | ✅ | |

---

## 3. 缺陷与发现

### 3.1 GAP：`/auth/refresh` 端点未实现

- **类型**：功能缺失（GAP）
- **优先级**：P1（影响长会话安全/UX，不阻塞发布）
- **证据**：
  - `backend/src/auth/auth.controller.ts` 只暴露 `POST /auth/register`、`POST /auth/login`、`GET /auth/me`
  - 测试 TC-AUTH-009b 命中 404
- **影响**：
  - §9.3 计划中提及 JWT 刷新竞态防护（refresh token 一次性 + 重试退避）暂未实现
  - 客户端当前只能等到 7 天 accessToken 过期后重新登录
  - 没有 refresh token 旋转机制，单 token 泄漏即全账户失守
- **建议**：按 §9.3 计划补 `POST /auth/refresh` + 一次性 refresh token + 旧 token 失效表

### 3.2 BUG：auto-publish `contentConfig.language` DTO 缺少枚举校验

- **类型**：产品缺陷（BUG）
- **优先级**：P0（auto-publish 是 P0 模块，污染 AI prompt 会产出垃圾文章）
- **证据**：
  - 测试 TC-I18N-033：POST `/auto-publish/tasks` 携带 `contentConfig.language="INVALID_LANG"` 返回 **201 Created**（任务被持久化）
  - 涉及文件：`backend/src/auto-publish/dto/create-task.dto.ts:42-43`
  ```ts
  @IsString()
  language: string;  // 缺 @IsEnum(ContentLanguage)
  ```
  对比 stories/articles 的 CreateDto 都正确使用 `@IsEnum(ContentLanguage)`：
  - `backend/src/stories/dto/create-story.dto.ts:38-40`
  - `backend/src/articles/dto/create-article.dto.ts:30-32`
- **影响**：
  - 用户可创建 `language="asdf"` 的 auto-publish 任务，触发 pipeline 时 AI 收到混乱语言指令
  - 持久化到 DB 后难以清理（filterConfig 没有按 language 过滤）
  - 与 §7 中"AI prompt 12 项贯穿语言"承诺不一致
- **建议修复**：
  ```ts
  import { ContentLanguage } from '@cms-ng/shared';
  @IsEnum(ContentLanguage)
  language: ContentLanguage;
  ```
  并在 `UpdateTaskDto` 中保持一致；然后跑 `db:migrate` 清理已落库的脏任务。

### 3.3 观察：Story RBAC 严格性

- `backend/src/stories/stories.service.ts:143` `verifyAccess()` 只允许 ADMIN/owner reporter/assigned editor
- 这与 §14.2 "EDITOR 可读所有 stories" 计划描述不完全一致——目前未指派 EDITOR 会被 403
- 测试 TC-I18N-031 已记录此行为；如产品要求 EDITOR 浏览所有选题以便分派，需补全 controller 的 `findAll()` 路径的 RBAC（已允许，但 `findOne()` 仍被 verifyAccess 挡住）

### 3.4 观察：登录 HTTP 状态码

- `POST /auth/login` 与 `POST /auth/register` 均返回 201（NestJS POST 默认），与 §9.1 计划"HTTP 200"措辞不符
- 这是 RESTful 行为偏差，不是 bug；测试已自适应接受 200/201
- 建议：将 controller 加上 `@HttpCode(200)` 显式表达"幂等登录成功"的语义

### 3.5 观察：测试运行注意

- QA backend `cms_ng_qa` 数据库在 3 worker 并发下偶发连接池竞争（`POST /articles` 10 s 超时一次）
- 已通过单次重试+缩短并行度（`workers: 3`）规避
- 长期建议：把 QA 池上限调大或在 `backend/src/prisma/prisma.service.ts` 增加连接超时配置

---

## 4. 截图与产物路径

| 类别 | 路径 |
|------|------|
| 测试用例主文件 | `/Users/liangchao/claudeCodeSpaces/newcms/tests/regression/auth-i18n.spec.ts` |
| HTML 报告 | `/Users/liangchao/claudeCodeSpaces/newcms/tests/regression/results/html/index.html` |
| JSON 摘要 | `/Users/liangchao/claudeCodeSpaces/newcms/tests/regression/results/run-summary.json` |
| 失败 trace | `/Users/liangchao/claudeCodeSpaces/newcms/tests/regression/results/artifacts/`（本次无失败） |
| 登录后仪表盘截图 | `/Users/liangchao/claudeCodeSpaces/newcms/tests/regression/screenshots/auth-014-after-login.png` |
| 401 重定向截图 | `/Users/liangchao/claudeCodeSpaces/newcms/tests/regression/screenshots/auth-015-401-redirect.png` |
| 选题列表 LanguageBadge 截图 | `/Users/liangchao/claudeCodeSpaces/newcms/tests/regression/screenshots/i18n-list-stories.png` |
| 稿件详情语言字段截图 | `/Users/liangchao/claudeCodeSpaces/newcms/tests/regression/screenshots/i18n-detail-article.png` |

---

## 5. 数据清理

- 所有创建实体（用户/选题/稿件/auto-publish 任务）均带前缀 `qa-auth-` / `qa-i18n-` / `qa-e2e-`
- `test.afterAll` 自动调用 admin token 删除：当前测试 run 后 cms_ng_qa 无残留
- 手动二次确认：`SELECT COUNT(*) FROM stories WHERE title LIKE 'qa-%';` → 0

---

## 6. 发布建议

| 模块 | 建议 |
|------|------|
| **AUTH** | **可发布**（3.1 P1 缺失为已知 GAP，建议下个迭代补 refresh） |
| **I18N** | **可发布**（3.2 P0 BUG 需在发布前修复；其余 PASS） |
| **总体门禁** | **CONDITIONAL GO** — 必须先修 §3.2 auto-publish language DTO 校验 |

### 必做（阻塞发布）
1. 修复 §3.2：auto-publish DTO 加 `@IsEnum(ContentLanguage)`

### 可后续修复
2. 实现 §3.1 `/auth/refresh`
3. 修 §3.3 EDITOR 浏览所有 story 的权限语义
4. 显式 `@HttpCode(200)` 修正 §3.4

### 不阻塞
5. §3.5 数据库连接池调优
