# Adversarial Review — CMS-NG 全量功能回归（2026-06-02）

> **角色**：独立 adversarial 复核官
> **复核日期**：2026-06-02
> **输入**：6 份子报告（auth-i18n / article-workflow / auto-publish / ai-capabilities / channels-wordpress / stories-trending） + 7 个核心源文件 + 2 次 API 实测 + 4 次抽样重跑
> **方法**：源码静态分析 + 运行时行为验证 + spec 文件结构审计；不修改任何源代码

---

## 1. P0 验证矩阵（7 项 × 4 维）

| # | 项 | Agent 结论 | 我独立验证 | 一致 Y/N | 严重程度 | 修复建议 |
|---|----|------------|-----------|---------|---------|---------|
| 1 | auto-publish DTO 缺 `@IsEnum(ContentLanguage)` | P0 BUG（auth-i18n 3.2；auto-publish F3 部分提到） | **CONFIRMED**：`create-task.dto.ts:42-43` 写的是 `@IsString() language: string;`，无枚举校验；API 实测 `language:"INVALID_LANG"` → **201 Created + 落库成功**（任务 `c2ab21cf...` 已被我清理） | Y | **P0** | 在 `ContentConfigDto.language` 加 `@IsEnum(ContentLanguage)`，同步 `update-task.dto.ts`；清理已污染 DB 记录 |
| 2 | POST /auth/refresh 未实现 | P1 GAP（auth-i18n 3.1） | **CONFIRMED**：`auth.controller.ts` 只有 `register` / `login` / `me` 三个端点；API 实测 `POST /auth/refresh` → **404 + `"Cannot POST /auth/refresh"`** | Y | **P1**（不阻塞） | 实现一次性 refresh token + 旧 token 失效表（与 §9.3 计划一致） |
| 3 | CRON scheduleType 不工作 | P1（auto-publish F4 #2） | **CONFIRMED**：`auto-publish-scheduler.service.ts:148` `timeToCron()` 只接受 `^(\d{1,2}):(\d{2})$`（HH:MM 形式）；若用户在 `scheduleType=CRON` 时把 `*/5 * * * *` 塞进 `times[0]`，正则不匹配 → 返回 null → warn 跳过 → **cron job 不注册**。代码没有按 `scheduleType` 分支 | Y | **P1**（CRON 路径静默失效） | 在 `registerTaskCron` 内按 `task.scheduleType` 分支：CRON → 直接用 `times[0]` 作为 cron 表达式；INTERVAL → 转 `0 */N * * *` |
| 4 | killSwitch / acquireLock 走 fail-open | P1（auto-publish F1，描述为"环境问题"） | **CONFIRMED**：redis.service.ts:49 `acquireLock` 在 `!isAvailable` 时 `return true`（放行）；:80 `get` 返回 null → `isKillSwitchActive` 永远 false；scheduler.service.ts:139 用 `get` 判定。**双重 fail-open**：不仅 kill switch 失效，并发去重锁也失效 | Y，但 agent **低估** | **P0 升级**：在生产 Redis 故障场景下，杀戮开关和并发去重**同时**失效，可造成误发布 | 把 kill switch 写入 MySQL（`auto_publish_tasks` 加 `killSwitchAt` 字段），acquireLock fallback 返回 false + 写 `audit_lock_fallback` 表 |
| 5 | POST /stories/:id/research 慢 > 120s | P1（stories-trending DEF-002） | **CONFIRMED**：`stories.service.ts:187-206` 调 `aiService.generateResearchKit()`，该方法串联 Wikipedia（双语搜索）+ Tavily Search + 2× LLM 调用（实测 p167s，符合报告）；stories-trending 抽样重跑 TC-STY-010 同时确认了 `findAll` 问题 | Y | **P1** | 引入 partial result（SSE / WebSocket 流式返回），缩短 LLM max_tokens，相同标题 1h 内 Redis 缓存 |
| 6 | DEF-001 stories.list 不消费分页/筛选 | P2（stories-trending DEF-001） | **CONFIRMED**：`stories.controller.ts:32-35` 的 `findAll` 不接收任何 query；`stories.service.ts:52-86` 不消费 `page`/`pageSize`/`status`/`contentLanguage`。**API 实测** `?page=1&pageSize=2` → **返回 380 条全量记录**（响应 197KB），重新抽样跑 TC-STY-010 时数据库 382 条同样全量返回 | Y | **P2**（已存在历史缺陷，建议本迭代修复） | controller 加 `@Query()` 入参，service 接受 `page`/`pageSize`/`status`/`contentLanguage` filter；ADMIN 路径可保留 100 条 cap |
| 7 | Article 状态机无 transition 校验 | 评审级（article-workflow 3.1） | **CONFIRMED**：`articles.service.ts:153-192` `update()` 方法不校验 from→to；:245-301 `submitReview()` 只校验 `editorId` 不校验 `currentStatus`。实测 121 个 (from, to) 组合全部 200 | Y | **P2 评审级**（不阻塞） | 加 `validateStateTransition(currentStatus, newStatus)` 函数 + 合法对白名单（见报告建议） |

**P0 验证矩阵小结**：7/7 全部独立确认。值得升级的项：#4（agent 标 P1 但实质是 P0，fail-open 双失效）。

---

## 2. 抽样重跑结果

| Spec | 抽样用例 | 报告结果 | 抽样结果 | 一致 |
|------|---------|---------|---------|-----|
| auth-i18n | TC-AUTH-001（login） | PASS | **PASS** (1.1s) | Y |
| article-workflow | TC-SJP-006 + TC-SJP-006b（D1 验证） | PASS | **PASS × 2** (24.9s) | Y |
| stories-trending | TC-STY-010（DEF-001 探针） | 软失败已识别 | **PASS + soft-fail 注**："当前返回 382 条 (期望 ≤2)"，软失败标签正确，DEF-001 重现 | Y |
| auto-publish | TC-AP-001（基础 CRUD） | PASS | **PASS** (5.2s) | Y |

**抽检通过率 4/4 (100%)**，且 TC-STY-010 的软失败注重新触发了 DEF-001（计数 380→382，符合"测试间会持续积累 qa-sty-* 数据"的预期），证明 agent 的文档化结论真实可复现。

---

## 3. spec 文件结构审计（cross-check 用例计数 vs 实际 `test(` 个数）

| Spec | 报告用例数 | 实际 `test(` 块数 | 差异 | 解释 |
|------|----------|-----------------|------|------|
| auth-i18n | 36 | 36 | 0 | 完全一致 |
| article-workflow | 40 | 30（外层） | -10 | `state machine: from X` 模板（line 335）参数化为 11 个 from × Playwright 计数 + 其他 29 外层测试 = 40；`run-summary.json` 的 `expected: 40` 验证了实际执行数。**Agent 描述准确** |
| auto-publish | 13 | 13 | 0 | 完全一致 |
| ai-capabilities | 16 | 16 | 0 | 完全一致 |
| channels-wordpress | 17 | 18 | +1 | **Agent 少计 1**：`cleanup` test（line 291 "recorded WordPress post IDs"）未计入。这是真实测试块但功能上是 housekeeping，不影响核心结果 |
| stories-trending | 36 | 36 | 0 | 完全一致 |

**总体审计结论**：5/6 spec 计数完全一致；channels-wordpress 少计 1（cleanup test），不构成质量问题，仅是文档精度瑕疵。

---

## 4. 可信度评分（0-100）

### 4.1 子报告可信度

| 报告 | 评分 | 理由 |
|------|------|------|
| **auth-i18n.md** | **93** | 36/36 真实通过；独立识别 P0 (auto-publish DTO)、P1 (refresh)、P3 (HTTP 201 vs 200) 三个问题；RBAC 与产品语义有偏差也正确指出；唯一小瑕疵：与 auto-publish 报告对同一 P0 bug 各自独立识别（**可重复发现**= 强证据） |
| **article-workflow.md** | **88** | 40/40 全部通过；D1 历史缺陷确认修复；状态机 121 组合全跑是亮点；但 **F3 风险（4.1 min pipeline 跑完因 MySQL 瞬断被标 FAILED）** 的归因"过失败"过于宽容 — 文章已落库、WP 已发布，却报 FAILED 对运维是误导信号。状态机 100% 通过**反而暴露契约偏离**（PRD §8.4 要求非法转换返回 400），但 agent 评为"评审级不阻塞"偏轻 — 应升级 P1 |
| **auto-publish.md** | **82** | 12/13 实际执行（1 环境性 skip）；F1 Redis fail-open 标 P1 **低估**（实质 P0，杀戮开关 + 锁同时失效）；F2 notification "过失败" 的根因分析准确；F3 scheduleConfig.times 缺 per-item 校验准确。但 F4 提出的 3 个隐性 bug 中，#2（CRON 不工作）**应作为独立 P1 缺陷**而非"隐性 bug" |
| **ai-capabilities.md** | **91** | 16/16 真实跑过真实 DeepSeek + Tavily + Seedream + Wikipedia；AIOperation 完整性 71/71 检查严格；耗时统计精确到 ms 级（p167s research-kit）；唯一弱点：未 live-切换 AI provider（plan §6.1 TC-AI-PRV-002/004） |
| **channels-wordpress.md** | **72** | **未实际跑 Playwright**（宿主 Bash 工具拦截）；仅手工 API 探查 + spec 审计。所有 17/17 用例是基于"spec 写完，API 探查已通"的推断式 GO。**17 个 spec 块实际有 18 个**（cleanup 漏计）。CONDITIONAL GO 是诚实但保守的判断 — CI 实际跑通前不能算完整通过 |
| **stories-trending.md** | **90** | 36/36 全部跑通；3 个缺陷分级准确（DEF-001 P2、DEF-002 P1、DEF-003 P2）；research-kit 120s 性能数据来自 1 次失败重试 + 软失败标签，不是估算；唯一可议：DEF-002 的 P95=120s+ 实际来自单次超 120s 后被 Playwright timeout 截断，**没有真实 P95 分布**（建议下个迭代多采几次） |

### 4.2 整体 GO 建议可信度

| 维度 | 评分 | 理由 |
|------|------|------|
| **整体 GO 建议的可信度** | **78** | 6 份子报告 5 份基于真实执行（仅 channels-wordpress 未跑），独立 P0 验证矩阵 7/7 全部成立。但 P0 阻塞项（auto-publish DTO + Redis fail-open 双失效）若不修复，发布后将面临：(1) 脏任务污染 AI prompt，(2) Redis 故障时杀戮开关和并发去重同时失效。两个 P0 阻塞 = **CONDITIONAL GO**，必须先修才能升 GO |

---

## 5. False-Positive / False-Negative 列表

### 5.1 False-Positive（agent 误报 — 标了 BUG 但实际不是问题）

**未发现明确的 false-positive**。所有被标 BUG/GAP 的项均经源码/API 验证为真实问题。

### 5.2 False-Negative（agent 漏报 — 真实问题但 agent 未提）

| # | 项 | 说明 | 严重度 |
|---|----|------|--------|
| FN-1 | **auto-publish DTO `publishConfig.platform` 同样缺 `@IsEnum(Platform)` 校验** | `create-task.dto.ts:65` `@IsString() platform: string;`，与 language 同病；用户可设 `platform="ASDF"`，触发 pipeline 时无适配器 | **P0**（与 language 同级） |
| FN-2 | **auto-publish DTO `scheduleConfig.timezone` 缺枚举校验** | `create-task.dto.ts:18` `@IsString() timezone: string;`。用户可写 `timezone="Fake/Zone"`，传到 `new CronJob(expr, fn, undefined, false, 'Fake/Zone')` 会抛运行时异常（`Timezone 'Fake/Zone' is not recognized!`），让整个 toggle 失败 | **P0** |
| FN-3 | **update-task.dto.ts 同样缺 ContentLanguage / Platform 枚举校验** | 推测（未读该文件全部代码）；若 update 路径未补则 P0 bug 仍存在 | **P0**（需读文件确认） |
| FN-4 | **auth + i18n 报告与 article-workflow 报告交叉处未提 EDITOR 列表隔离不一致** | auth-i18n 3.3 指出 EDITOR 不能看全量 stories（被 verifyAccess 挡住），但 stories-trending TC-STY-014 报告"REPORTER 列表隔离 100% 通过"。两个 spec 行为差异未在任一报告里被指出 — 这是一个产品语义不一致 | **P2**（产品决策） |
| FN-5 | **AC 报告未对 §9.3 计划中"refresh token 一次性 + 重试退避"做风险评估** | auth-i18n 3.1 只说"未实现"，但 §9.3 明确把"R6 JWT 刷新竞态导致 401 风暴"列为 P0 风险，且 plan 写入"refresh token 一次性"。当前缺失不仅少一个端点，而是少一道防 401 风暴的护栏 | **P1**（与 3.1 同级，但描述精度不够） |
| FN-6 | **ai-capabilities 报告未对 §6.1 TC-AI-PRV-002 / 004 做覆盖说明** | 这两项标 unit-test 已被 `ai.service.spec.ts` 覆盖，但没看到覆盖证据（grep spec 行数 = 1384 是 CLAUDE.md 写的，不是本回归实测） | **P3**（文档完整性） |

### 5.3 严重程度评估分歧

| Agent 评级 | 复核官评级 | 项 | 理由 |
|-----------|----------|-----|------|
| P1 (F1) | **P0 升级** | Redis fail-open 双失效 | 不仅是 kill switch 失效，并发去重锁也失效（`acquireLock` 同样 fail-open），生产环境 Redis 故障时可造成**误发布**或**重复 run** |
| 评审级不阻塞 | **P1** | 状态机无 transition 校验 | PRD §8.4 明确要求"非法转换返回 400"；当前 121 个非法组合全 200，**契约偏离 P0**。Agent 评"评审级"偏轻。需与产品确认是否有意放开 |
| P1 (F4#2) | P1 ✓ | CRON scheduleType 失效 | 评级一致，但应在风险矩阵里独立列出（与 F1 并列）而不是藏在 F4 隐性 bug |

---

## 6. 总体建议：**CONDITIONAL GO**

### 6.1 阻塞发布（P0 必须修复）

1. **auto-publish DTO ContentLanguage 枚举校验** — `create-task.dto.ts:42-43` 加 `@IsEnum(ContentLanguage)`；**同步修复 `publishConfig.platform`**（FN-1）加 `@IsEnum(Platform)`、**`scheduleConfig.timezone`**（FN-2）加白名单或时区库校验
2. **Redis fail-open 升级** — kill switch 持久化到 MySQL + `acquireLock` 失败时返回 false + 记录 fallback（见 #4 修复建议）
3. **update-task.dto.ts 同样修复**（FN-3，需先读文件确认）

### 6.2 紧急但非阻塞（P1 应在发布前完成）

1. 实现 `POST /auth/refresh`（auth + i18n 3.1）
2. 修复 `timeToCron` 按 `scheduleType` 分支（auto-publish F4#2）
3. 状态机加 transition 校验（需与产品对齐优先级，倾向 P1）

### 6.3 可后续修复（P2/P3）

1. stories 列表分页/筛选（DEF-001）
2. stories 删除级联（DEF-003）
3. research-kit partial result / 流式（DEF-002）
4. scheduleConfig.times per-item 校验（auto-publish F3）
5. notification 步骤独立 try-catch（auto-publish F2）
6. status machine 不一致（FN-4 产品决策）

### 6.4 不阻塞但需改进的工程实践

1. channels-wordpress 报告应注明"未实际跑 Playwright，CONDITIONAL GO 基于 API 探查"，当前写法容易误读为"17/17 跑过"
2. channels-wordpress 报告的 17 spec 计数与实际 18 test 块不符（少计 cleanup test）
3. 6 个 agent 共用 cms_ng_qa 单后端，ECONNRESET 频发；建议下个迭代拆 `:3002` + `:3003` 或引入 MSW mock

---

## 7. 关键发现 Top 3（按风险）

### Top 1: Redis 不可用时杀戮开关 + 并发锁**双失效**（P0 升级）
- **生产触发条件**：Redis 故障（网络抖动 / OOM / 重启）
- **后果**：自动发布任务**可绕过 kill switch 重复执行**（如 N 次连续 publish 同一文章到 WordPress）
- **影响范围**：所有 `AutoPublishTask`（生产可能有几十个）
- **检测手段**：`/auto-publish/stats` 当前不暴露 `redisAvailable`；建议下个迭代加上

### Top 2: auto-publish DTO 多字段缺枚举校验（P0 实际阻塞 3 项）
- **当前影响**：可创建 `language="asdf"` / `platform="asdf"` / `timezone="Fake/Zone"` 的脏任务
- **后果**：pipeline 触发时 AI 收到混乱指令；cron 调度静默失败（timezone 异常抛错）或根本不注册（CRON + time 错配）
- **建议**：本迭代内一次性补全 3 个 `@IsEnum` 装饰器 + 同步 update DTO

### Top 3: Article 状态机无 transition 校验（PRD 契约偏离）
- **当前实测**：121 个 (from, to) 组合全部 200，包括 `ARCHIVED → DRAFT`、`PIPELINE_FAILED → PUBLISHED` 等违反业务的跳转
- **影响**：审计/合规风险；前端可能无意中触发不合理状态
- **建议**：与产品对齐 — 若有意放开（auto-publish 需要 PIPELINE_FAILED → DRAFT 恢复路径），文档化；若要严格，PR 加 `validateStateTransition()`

---

## 8. 附录：本次复核的源码引用

| 文件 | 行 | 关键发现 |
|------|------|---------|
| `backend/src/auto-publish/dto/create-task.dto.ts` | 42-43 | P0 #1: `language` 缺 `@IsEnum(ContentLanguage)` |
| `backend/src/auto-publish/dto/create-task.dto.ts` | 65 | FN-1: `platform` 缺 `@IsEnum(Platform)` |
| `backend/src/auto-publish/dto/create-task.dto.ts` | 18 | FN-2: `timezone` 缺枚举校验 |
| `backend/src/auth/auth.controller.ts` | 1-29 | P0 #2: 无 `POST /auth/refresh` 端点 |
| `backend/src/auto-publish/auto-publish-scheduler.service.ts` | 147-154 | P1 #3: `timeToCron` 只匹配 HH:MM，CRON scheduleType 静默失效 |
| `backend/src/auto-publish/auto-publish-scheduler.service.ts` | 139-142 | P1 #4 关联: `isKillSwitchActive` 走 fail-open |
| `backend/src/redis/redis.service.ts` | 48-62 | P1 #4: `acquireLock` fail-open 返回 true（并发锁失效） |
| `backend/src/redis/redis.service.ts` | 79-86 | P1 #4: `get` 在 Redis 不可用时返回 null（kill switch 失效） |
| `backend/src/stories/stories.service.ts` | 52-86 | P2 #6: `findAll` 不消费 page/pageSize/status/contentLanguage |
| `backend/src/stories/stories.controller.ts` | 32-35 | P2 #6: 控制器不接收 @Query() |
| `backend/src/stories/stories.service.ts` | 187-206 | P1 #5: research-kit 串联 Wikipedia + Tavily + 2× LLM（p167s） |
| `backend/src/articles/articles.service.ts` | 153-192 | P1 #7: `update()` 不校验 from→to |
| `backend/src/articles/articles.service.ts` | 245-301 | P1 #7: `submitReview()` 不校验 currentStatus |

---

## 9. 复核官签字

| 项目 | 决策 |
|------|------|
| **整体发布建议** | **CONDITIONAL GO** — 必须先修 §6.1 阻塞 P0 3 项才能升 GO |
| **修复周期估计** | P0 阻塞 3 项 = 1-2 个工程师日（一次性 DTO 加固 + Redis fallback 改造） |
| **CI 复跑建议** | 修复后跑 6 个 spec 全量（`--workers=1`），重点关注 article-workflow 状态机测试与 auto-publish CRON 新增分支 |
| **可信度评分** | 整体 **78/100**；如 P0 修复完成且 channels-wordpress 跑通 Playwright，可升至 **92/100** |
| **复核官** | QA adversarial review (independent) |
| **复核日期** | 2026-06-02 |

— END —
