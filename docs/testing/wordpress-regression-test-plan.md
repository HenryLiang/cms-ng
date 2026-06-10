# WordPress 发布功能回归测试方案

**版本**: 1.0.0
**日期**: 2026-05-29
**测试范围**: WordPress REST API 自动发布功能 + 全系统回归
**风险等级**: 中高（涉及 13 个文件变更、数据库 schema 变更、新外部 API 集成）

---

## 一、风险评估

### 高风险区域

| # | 风险点 | 影响 | 理由 |
|---|--------|------|------|
| R1 | `publishedUrl` VARCHAR(191→500) 迁移 | 数据完整性 | Migration 修改已有字段，大表 ALTER 可能锁表；超长 URL 存储失败会导致发布状态不一致 |
| R2 | WordPress API 调用无超时和重试 | 发布可靠性 | `fetch()` 无 timeout 配置，网络不稳定时可能挂起；失败后状态回退但 WordPress 侧可能已创建文章（非幂等） |
| R3 | 凭证明文 Base64 传输 | 安全性 | Application Password 通过 `Buffer.from().toString('base64')` 编码，日志泄露或中间人攻击可获取 |
| R4 | `adaptedTags` JSON.parse 无 try-catch | 运行时崩溃 | `wordpress.service.ts:182` 直接 `JSON.parse(publish.adaptedTags || '[]')`，如果数据库中 adaptedTags 为非法 JSON 将抛出未捕获异常 |
| R5 | 图片上传失败后继续发布 | 数据一致性 | 封面图上传失败后文章仍发布，但 PlatformPublish 记录不区分"有封面图失败"和"无封面图"的情况 |

### 中风险区域

| # | 风险点 | 影响 | 理由 |
|---|--------|------|------|
| R6 | 重复发布创建新文章 | 数据冗余 | 不支持更新，每次发布创建新 WP 文章，旧文章残留 |
| R7 | 前端 `publishing` 状态全局共享 | UI 体验 | `channel-panel.tsx:27` 的 `publishing` 是单布尔值，多平台场景下无法区分 |
| R8 | `Platform` 枚举新增 WORDPRESS | 枚举兼容 | 前端 `PLATFORM_ICONS`/`PLATFORM_NAMES` 硬编码映射，遗漏任一平台导致运行时 undefined |

---

## 二、新功能测试（WordPress 发布）

### 2.1 功能测试用例

#### FT-001: WordPress 内容适配生成

**前置条件**: 登录系统，存在一篇文章

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 进入文章详情页 → 平台分发面板 | 面板正常加载，显示 WordPress 按钮 |
| 2 | 点击「WordPress」按钮 | 按钮显示 loading，状态变为 GENERATING |
| 3 | 等待 AI 生成完成（3-10s） | 状态变为 READY，显示 SEO 优化标题、HTML 正文、摘要、标签 |
| 4 | 验证适配内容格式 | 标题含关键词，正文包含 `<h2>`/`<h3>`/`<p>` 等 HTML 标签，摘要 120-160 字，3-5 个标签 |

**验证 API**:
```bash
curl -X GET http://localhost:3001/channels/{articleId}/publishes \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | select(.platform=="WORDPRESS")'
```

#### FT-002: 直接发布模式（publish）

**前置条件**: FT-001 完成，适配内容状态为 READY

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击「发布到 WordPress」蓝色按钮 | 按钮显示 loading 状态 |
| 2 | 等待发布完成（10-20s） | PlatformPublish 状态变为 PUBLISHED |
| 3 | 验证 publishedUrl | 包含有效 WordPress 文章链接（https://wuququ.com/...） |
| 4 | 登录 WordPress 后台验证 | 文章可见，状态为"已发布"，封面图已设为特色图片，标签已关联 |
| 5 | 访问 WordPress 前台 | 文章可正常访问 |

#### FT-003: 草稿模式（draft）

**前置条件**: 适配内容状态为 READY

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击「存为草稿」边框按钮 | 按钮显示 loading |
| 2 | 等待完成 | PlatformPublish 状态变为 PUBLISHED |
| 3 | WordPress 后台验证 | 文章状态为"草稿"，前台不可见 |

#### FT-004: 无封面图发布

**前置条件**: 文章无 coverImage 字段

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 执行完整发布流程 | 发布成功 |
| 2 | WordPress 后台验证 | 文章无特色图片，featured_media = 0 |
| 3 | 检查日志 | 无封面图上传相关错误 |

#### FT-005: 封面图上传失败降级

**前置条件**: 文章 coverImage 指向无效 URL（如 404）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 设置文章 coverImage 为 `https://example.com/nonexistent.jpg` | - |
| 2 | 执行发布 | 发布成功，日志中记录 `Failed to download image` 警告 |
| 3 | WordPress 后台验证 | 文章已发布，无特色图片 |

#### FT-006: 重复发布

**前置条件**: 文章已成功发布到 WordPress

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 重新生成适配内容（点击 WordPress 按钮） | 旧适配内容被覆盖，状态变为 GENERATING → READY |
| 2 | 再次点击发布 | WordPress 创建新文章（新 post ID） |
| 3 | 检查 publishedUrl | 更新为新文章 URL |
| 4 | WordPress 后台验证 | 旧文章仍保留，新文章已创建 |

#### FT-007: 标签自动创建与复用

**前置条件**: WordPress 后台无"回归测试2026"标签

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 生成适配内容，确保标签含"回归测试2026" | AI 生成标签包含目标标签 |
| 2 | 发布文章 | WordPress 后台新增"回归测试2026"标签 |
| 3 | 发布另一篇含相同标签的文章 | 标签不重复创建，复用已有 ID |

### 2.2 异常测试用例

#### ET-001: WordPress 凭据未配置

**前置条件**: `backend/.env` 中移除 WORDPRESS_* 配置

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击发布 | 返回 400 错误：`WordPress 配置不完整，请设置 WORDPRESS_SITE_URL、WORDPRESS_USERNAME 和 WORDPRESS_APP_PASSWORD 环境变量` |
| 2 | 前端显示 | 红色错误提示 |

#### ET-002: WordPress 凭据无效

**前置条件**: WORDPRESS_APP_PASSWORD 设置为错误值

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击发布 | 返回 400 错误：`WordPress 发布失败: WordPress API 错误 (401): ...` |
| 2 | PlatformPublish 状态 | 变为 FAILED |
| 3 | notes 字段 | 包含错误详情 |

#### ET-003: 文章不存在

**前置条件**: 使用无效 articleId

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 调用 `POST /channels/{invalid-id}/publish-wordpress` | 返回 400：`文章不存在` |

#### ET-004: 无适配内容直接发布

**前置条件**: 文章未生成 WordPress 适配内容

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 调用 publish-wordpress | 返回 400：`请先生成 WordPress 适配内容` |

#### ET-005: 适配内容状态不正确

**前置条件**: PlatformPublish 状态为 GENERATING（AI 生成中）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 调用 publish-wordpress | 返回 400：`适配内容未就绪，请先生成或重新生成` |

#### ET-006: adaptedTags 非法 JSON

**前置条件**: 数据库中 adaptedTags 被手动改为非法 JSON（如 `{broken`）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 调用 publish-wordpress | **当前行为**: 抛出未捕获的 `SyntaxError`，返回 500 |
| 2 | **期望行为**: 应 try-catch 并返回友好错误 | 标记为已知缺陷 |

#### ET-007: WordPress API 超时

**前置条件**: WordPress 站点不可达（如 DNS 解析失败）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 设置 WORDPRESS_SITE_URL 为不可达地址 | - |
| 2 | 点击发布 | Node.js 默认 fetch 超时后返回错误 |
| 3 | PlatformPublish 状态 | 变为 FAILED |

#### ET-008: 无效 wpStatus 值

**前置条件**: 通过 API 直接调用

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | `POST /channels/{id}/publish-wordpress` body: `{ wpStatus: "scheduled" }` | DTO 验证拒绝，返回 400 |

### 2.3 边界测试用例

#### BT-001: 超长中文标题（permalink 超长）

**前置条件**: 文章标题 50+ 中文字符

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 发布文章 | publishedUrl 编码后可能达 200+ 字符 |
| 2 | 验证数据库存储 | publishedUrl 正确存储，不超过 VARCHAR(500) |

#### BT-002: 标题恰好在 200 字符限制

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 生成适配内容，标题恰好 200 字符 | validate() 通过，状态变为 READY |
| 2 | 标题 201 字符 | validate() 失败，返回 `标题超过 200 字限制` |

#### BT-003: 空内容文章

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 创建内容为空的文章 | - |
| 2 | 生成 WordPress 适配 | AI 可能返回空内容，validate() 失败：`正文不能为空` |

#### BT-004: 特殊字符标题

**测试数据**: `🔥突发！INFO-NG调查：AI「深度伪造」技术<脚本>alert(1)</脚本>`

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 生成适配并发布 | WordPress 正确处理，无 XSS 执行 |

---

## 三、回归测试（确保新功能未破坏现有功能）

### 3.1 平台分发模块回归

#### RT-001: 其他平台适配生成不受影响

**测试平台**: WEBSITE, FACEBOOK, INSTAGRAM, XIAOHONGSHU

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 对同一篇文章生成 Facebook 适配 | 正常生成，状态变为 READY |
| 2 | 对同一篇文章生成小红书适配 | 正常生成，内容格式符合小红书风格 |
| 3 | 验证各平台适配内容独立 | 各平台内容互不干扰 |

#### RT-002: 标记为已发布（人工）功能不受影响

**前置条件**: 非 WordPress 平台的适配内容状态为 READY

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 点击「标记为已发布（人工）」 | 状态变为 PUBLISHED |
| 2 | 输入 publishedUrl | URL 正确保存 |

#### RT-003: 平台列表正确包含 WordPress

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 调用 `GET /channels/platforms` | 返回列表包含 WordPress 平台元数据 |
| 2 | 验证 WordPress 元数据 | maxTitleLength=200, maxContentLength=50000, supportsImages=true |

#### RT-004: 删除适配内容不受影响

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 删除 WordPress 适配记录 | 记录被删除 |
| 2 | 删除 Facebook 适配记录 | 记录被删除，其他平台不受影响 |

#### RT-005: 平台图标和名称正确渲染

**验证点**: 前端 PLATFORM_ICONS 和 PLATFORM_NAMES 中所有 Platform 枚举值都有映射

| 检查项 | 预期 |
|--------|------|
| WEBSITE → Globe 图标, "官网/APP" | 正确 |
| FACEBOOK → Share2 图标, "Facebook" | 正确 |
| INSTAGRAM → Camera 图标, "Instagram" | 正确 |
| XIAOHONGSHU → BookOpen 图标, "小红书" | 正确 |
| WORDPRESS → Globe 图标, "WordPress" | 正确 |
| 未支持的 X/THREADS/LINKEDIN/YOUTUBE/PUSH | 不出现在 supportedPlatforms 中，但枚举映射需完整 |

### 3.2 文章模块回归

#### RT-006: 文章创建（含 coverImage）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 创建文章，指定 coverImage 字段 | 文章创建成功，coverImage 正确保存 |
| 2 | 创建文章，不指定 coverImage | 文章创建成功，coverImage 为 null |

#### RT-007: 文章更新（含 coverImage）

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 更新文章 coverImage | 新 URL 保存成功 |
| 2 | 清除 coverImage（传 null） | coverImage 字段清空 |

#### RT-008: 文章状态流转不受影响

**测试路径**: DRAFT → WRITING → PENDING_REVIEW → IN_REVIEW → APPROVED → PUBLISHED

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 完整走一遍文章状态流程 | 各状态切换正常 |
| 2 | 验证权限控制 | Reporter 只能提交，Editor/Admin 才能审批 |

#### RT-009: 文章版本控制不受影响

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 更新文章内容 | version 递增，ArticleVersion 记录创建 |
| 2 | 查看 version 历史 | 各版本内容正确 |

### 3.3 数据库回归

#### RT-010: publishedUrl 字段扩展

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 确认 migration 已应用 | `platform_publishes.publishedUrl` 类型为 VARCHAR(500) |
| 2 | 存储长 URL（400+ 字符） | 正常存储和读取 |
| 3 | 已有短 URL 记录 | 不受影响，正常显示 |

**验证 SQL**:
```sql
DESCRIBE platform_publishes publishedUrl;
-- 预期: VARCHAR(500)
```

#### RT-011: 已有平台发布记录不受影响

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 查看已有 Facebook/Instagram 发布记录 | 数据完整，状态正确 |
| 2 | 查看已有 publishedUrl | 短 URL 正常显示 |

### 3.4 AI 服务回归

#### RT-012: AI 改写功能不受影响

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 使用 AI 改写文章段落 | 返回改写内容 |
| 2 | 使用 AI 生成标题 | 返回标题建议 |

#### RT-013: AI 操作记录正常

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 生成 WordPress 适配 | AI 操作记录写入 AIOperation 表 |
| 2 | 验证记录 | agentType=DISTRIBUTE, action 含 WordPress 关键信息 |

### 3.5 前端回归

#### RT-014: 文章列表页正常

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 访问文章列表页 | 列表正常加载 |
| 2 | 筛选/搜索功能 | 正常工作 |

#### RT-015: 文章详情页正常

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | 打开任意文章详情 | 页面正常渲染 |
| 2 | 富文本编辑器 | 正常编辑 |
| 3 | 平台分发面板 | 正常加载和交互 |

#### RT-016: 权限控制不受影响

| 步骤 | 操作 | 预期结果 |
|------|------|----------|
| 1 | Reporter 用户访问别人的文章 | 返回 403 |
| 2 | 未登录用户访问 | 重定向到 /login |

---

## 四、安全测试

### ST-001: WordPress 凭证存储

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 环境变量存储 | 合格 | 凭证通过 `.env` 文件存储，不硬编码 |
| 日志泄露 | 需验证 | 确保 Logger 不输出 Authorization header |
| .gitignore | 需验证 | 确保 `.env` 不被提交（`.env.example` 中为占位值） |

### ST-002: API 端点鉴权

| 端点 | 鉴权方式 | 测试 |
|------|----------|------|
| `POST /channels/:id/publish-wordpress` | Bearer Token (via @CurrentUser) | 无 Token → 401；无权限 → 403 |

### ST-003: 输入验证

| 检查项 | 状态 | 说明 |
|--------|------|------|
| wpStatus DTO 验证 | 合格 | `@IsIn(['publish', 'draft'])` 限制合法值 |
| articleId 参数 | 需验证 | 路由参数未做 UUID 格式验证，可传任意字符串 |
| SQL 注入 | 安全 | Prisma 参数化查询 |
| XSS（WordPress 内容）| 需验证 | adaptedContent 含 HTML，WordPress 侧是否过滤 |

### ST-004: WordPress API 通信安全

| 检查项 | 状态 | 说明 |
|--------|------|------|
| HTTPS | 依赖配置 | WORDPRESS_SITE_URL 应使用 HTTPS |
| Basic Auth | 风险中等 | Application Password 通过 Base64 传输，HTTPS 下可接受 |

---

## 五、性能测试

### PT-001: 发布耗时

| 场景 | 预期耗时 | 测试方法 |
|------|----------|----------|
| 无封面图发布 | 5-10s | 计时 API 调用 |
| 有封面图发布 | 10-20s | 计时 API 调用 |
| 5 个标签解析 | 3-5s | 标签逐个搜索/创建，串行 |
| 大图片上传（>5MB） | 5-15s | 需验证 WordPress 服务器上传限制 |

### PT-002: 并发发布

| 场景 | 预期 | 测试方法 |
|------|------|----------|
| 同一文章同时点击发布 | 第二次应失败或排队 | 快速连续点击 |
| 不同文章同时发布 | 各自独立完成 | 两个浏览器窗口 |

### PT-003: 数据库迁移性能

| 场景 | 预期 | 测试方法 |
|------|------|----------|
| ALTER TABLE on 1000+ 行 | <5s | 在测试库上执行 migration |
| ALTER TABLE on 100000+ 行 | 可能锁表 | 需评估生产环境数据量 |

---

## 六、已知缺陷与建议

### 缺陷

| ID | 严重度 | 描述 | 当前影响 |
|----|--------|------|----------|
| D1 | 高 | `wordpress.service.ts:182` `JSON.parse(adaptedTags)` 无 try-catch，非法 JSON 导致 500 错误 | 运行时崩溃 |
| D2 | 中 | `fetch()` 无 timeout 配置，WordPress 不可达时请求可能长时间挂起 | 用户体验差 |
| D3 | 中 | 重复发布创建新文章而非更新，WordPress 侧产生冗余内容 | 数据冗余 |
| D4 | 低 | `publishing` 状态全局共享，无法区分不同平台的发布状态 | UI 可能误导 |
| D5 | 低 | 图片上传使用 `ArrayBuffer` 全量缓存到内存，大图片可能导致内存压力 | 高并发场景风险 |

### 建议

1. **D1 修复**: 在 `JSON.parse(adaptedTags)` 外加 try-catch，失败时 fallback 为 `[]`
2. **D2 修复**: 为 `fetch()` 添加 `AbortController` 超时（建议 30s）
3. **D3 增强**: 支持更新已发布文章（需存储 WordPress post ID）
4. **凭证安全**: 考虑将 WordPress 凭证加密存储在数据库中，而非环境变量

---

## 七、自动化测试补充建议

当前测试覆盖情况：

| 模块 | 已有测试 | 建议补充 |
|------|----------|----------|
| ChannelsController | 2 个 WordPress 端点测试 | 足够 |
| WordPressAdapter | 无 | 单元测试：getAdaptationPrompt, postProcess, validate |
| WordPressService | 无 | 单元测试：resolveTags, uploadImage, publish（mock fetch） |
| 前端组件 | 无 | 组件测试：PlatformPreview WordPress 按钮渲染 |
| E2E | 无 | 完整发布流程 E2E |

### 建议优先级

1. **P0**: WordPressService 单元测试（mock fetch，覆盖 publish 成功/失败路径）
2. **P1**: WordPressAdapter 单元测试（覆盖 postProcess 解析、validate 边界）
3. **P2**: 前端 PlatformPreview 快照测试
4. **P3**: E2E 冒烟测试

---

## 八、测试执行清单

### 执行顺序

```
Phase 1: 环境准备
  □ 确认数据库 migration 已应用
  □ 确认 WordPress 环境变量已配置
  □ 确认 WordPress Application Password 有效

Phase 2: 新功能测试 (FT-001 ~ FT-007)
  □ FT-001: 适配内容生成
  □ FT-002: 直接发布
  □ FT-003: 草稿发布
  □ FT-004: 无封面图
  □ FT-005: 封面图上传失败
  □ FT-006: 重复发布
  □ FT-007: 标签自动创建

Phase 3: 异常测试 (ET-001 ~ ET-008)
  □ ET-001 ~ ET-008

Phase 4: 边界测试 (BT-001 ~ BT-004)
  □ BT-001 ~ BT-004

Phase 5: 回归测试 (RT-001 ~ RT-016)
  □ RT-001 ~ RT-005: 平台分发
  □ RT-006 ~ RT-009: 文章模块
  □ RT-010 ~ RT-011: 数据库
  □ RT-012 ~ RT-013: AI 服务
  □ RT-014 ~ RT-016: 前端

Phase 6: 安全测试 (ST-001 ~ ST-004)
  □ ST-001 ~ ST-004

Phase 7: 性能测试 (PT-001 ~ PT-003)
  □ PT-001 ~ PT-003
```

### 通过标准

- 所有 FT/ET/BT 用例通过
- 所有 RT 回归用例通过（无现有功能退化）
- D1（JSON.parse 崩溃）必须在上线前修复或确认已知限制
- 安全测试无高危发现
