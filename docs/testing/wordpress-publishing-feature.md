# WordPress REST API 发布功能测试指南

## 功能概述

新增 WordPress 平台支持，通过 WordPress REST API 将 CMS 文章自动发布到 WordPress 站点（https://wuququ.com）。这是 channels（平台分发）系统中第一个实现**真正 API 自动发布**的平台（其他平台目前仅做内容适配，需人工复制粘贴）。

### 核心流程

```
阶段1: 用户点击「生成适配」
  → WordPressAdapter 调用 AI 生成 SEO 优化内容
  → 内容存储到 PlatformPublish 表，状态变为 READY

阶段2: 用户点击「发布到 WordPress」
  → WordPressService 调用 WP REST API
  → 自动上传封面图到 WordPress 媒体库
  → 自动创建/关联标签
  → 发布文章（支持 publish/draft 两种状态）
  → 存储 WordPress 文章 URL，状态变为 PUBLISHED
```

## 实现细节

### 后端改动

#### 1. 新增文件

- **`backend/src/channels/platforms/adapters/wordpress.adapter.ts`**
  - WordPress 内容适配器，实现 PlatformAdapter 接口
  - `getAdaptationPrompt()`: 生成 SEO 优化的 AI 提示词（强调关键词、H2/H3 结构、meta description 风格摘要）
  - `postProcess()`: 解析 AI 返回的 JSON
  - `validate()`: 验证标题和内容非空，标题长度 ≤200 字符

- **`backend/src/channels/wordpress.service.ts`**
  - WordPress 发布服务，处理 API 调用
  - `publish()`: 主方法，协调整个发布流程
  - `resolveTags()`: 标签解析（先搜索，不存在则创建，返回 ID 列表）
  - `uploadImage()`: 封面图上传到 WordPress 媒体库
  - `getAuthHeader()`: 生成 Basic Auth 认证头
  - `ensureConfigured()`: 检查环境变量配置

- **`backend/src/channels/dto/publish-wordpress.dto.ts`**
  - 发布请求 DTO
  - `wpStatus`: 可选，'publish' | 'draft'，默认 'publish'

#### 2. 修改文件

- **`packages/shared/src/index.ts`**
  - Platform 枚举新增 `WORDPRESS = 'WORDPRESS'`

- **`backend/src/channels/platforms/constants.ts`**
  - 新增 WordPress 平台元数据（maxTitleLength: 200, maxContentLength: 50000）

- **`backend/src/channels/platforms/platform-registry.ts`**
  - 注册 WordPressAdapter

- **`backend/src/channels/channels.controller.ts`**
  - 新增端点 `POST /channels/:articleId/publish-wordpress`
  - 注入 WordPressService

- **`backend/src/channels/channels.module.ts`**
  - 注册 WordPressService

- **`backend/prisma/schema.prisma`**
  - PlatformPublish 模型：`publishedUrl` 字段从 VARCHAR(191) 扩展到 VARCHAR(500)
  - 原因：WordPress 中文 permalink URL 可能超过 191 字符（如 218 字符）

- **`backend/src/articles/articles.service.ts`**
  - update() 方法新增 coverImage 字段处理

- **`backend/src/articles/dto/create-article.dto.ts`**
  - 新增 coverImage 可选字段（String）

- **`backend/.env.example`**
  - 新增 WordPress 配置示例

### 前端改动

- **`frontend/src/lib/channel-api.ts`**
  - 新增 `publishToWordPress(articleId, wpStatus)` 函数

- **`frontend/src/components/channels/channel-panel.tsx`**
  - supportedPlatforms 过滤列表新增 Platform.WORDPRESS
  - 新增 handlePublishWordPress(wpStatus) 处理函数
  - 新增 publishing 状态管理
  - 传递 onPublishWordPress 回调给 PlatformPreview

- **`frontend/src/components/channels/platform-preview.tsx`**
  - PLATFORM_ICONS 和 PLATFORM_NAMES 新增 WordPress 条目
  - 当平台是 WordPress 且状态为 READY 时，显示两个发布按钮：
    - 「发布到 WordPress」（status=publish，蓝色按钮）
    - 「存为草稿」（status=draft，边框按钮）
  - 发布过程中显示 loading 状态

### 环境变量配置

```bash
# backend/.env
WORDPRESS_SITE_URL="https://wuququ.com"
WORDPRESS_USERNAME="liangchao1982@gmail.com"
WORDPRESS_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"
```

WordPress Application Password 获取方式：WordPress 后台 → 用户 → 个人资料 → 应用程序密码 → 创建新密码

### 数据库变更

**Migration**: `20260529040421_extend_published_url_length`

```sql
ALTER TABLE `platform_publishes` 
MODIFY `publishedUrl` VARCHAR(500);
```

## 测试用例

### 前置条件

1. WordPress 站点已配置 Application Password
2. `backend/.env` 中配置了有效的 WordPress 凭据
3. 数据库已应用最新 migration

### 测试场景

#### TC-001: 正常发布流程（publish 模式）

**步骤**:
1. 创建/选择一篇有封面图的文章
2. 在文章详情页点击「平台分发」面板
3. 点击「WordPress」按钮生成适配内容
4. 等待 AI 生成完成（状态变为 READY）
5. 点击「发布到 WordPress」按钮

**预期结果**:
- 文章成功发布到 WordPress
- PlatformPublish 状态变为 PUBLISHED
- publishedUrl 包含有效的 WordPress 文章链接
- WordPress 后台可见新文章
- 文章封面图已上传到 WordPress 媒体库并设为 featured image
- 标签已自动创建/关联

**验证命令**:
```bash
# 查看 PlatformPublish 记录
curl -X GET http://localhost:3001/channels/:articleId/publishes \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | select(.platform=="WORDPRESS")'

# 验证 WordPress 文章
curl -X GET "https://wuququ.com/wp-json/wp/v2/posts/:postId" \
  -H "Authorization: Basic $(echo -n 'username:app_password' | base64)"
```

#### TC-002: 草稿模式发布

**步骤**:
- 同 TC-001，但在第 5 步点击「存为草稿」按钮

**预期结果**:
- 文章以 draft 状态发布到 WordPress
- 文章不会在 WordPress 前台显示，仅在后台可见
- PlatformPublish 状态仍为 PUBLISHED（表示已成功推送到 WordPress）

#### TC-003: 无封面图发布

**步骤**:
- 选择一篇没有 coverImage 的文章
- 执行发布流程

**预期结果**:
- 文章成功发布
- 不设置 featured_media
- WordPress 后台文章无特色图片

#### TC-004: 重复发布（更新已发布文章）

**步骤**:
1. 文章已发布到 WordPress（状态为 PUBLISHED）
2. 重新生成适配内容（状态变为 READY）
3. 再次点击发布

**预期结果**:
- WordPress 上创建新文章（不会更新旧文章）
- PlatformPublish 记录更新为新文章的 URL
- 旧的 WordPress 文章保持原样

**注意**: 当前实现不支持更新已发布的 WordPress 文章。如需更新，需手动在 WordPress 后台编辑。

#### TC-005: 发布失败 - WordPress 凭据无效

**步骤**:
- 修改 `backend/.env` 中的 WORDPRESS_APP_PASSWORD 为错误值
- 尝试发布

**预期结果**:
- 发布失败，PlatformPublish 状态变为 FAILED
- notes 字段包含错误信息："WordPress API 错误 (401): ..."
- 前端显示错误提示

#### TC-006: 发布失败 - 图片上传失败

**步骤**:
- 设置文章封面图为无效 URL（如 404 链接）
- 尝试发布

**预期结果**:
- 图片上传失败，记录警告日志
- 文章仍然成功发布（不带封面图）
- featured_media 为 0

#### TC-007: 超长 URL 处理

**步骤**:
- 发布一篇标题很长的文章（中文标题会被 WordPress 转换为 URL 编码的 permalink）

**预期结果**:
- 文章成功发布
- publishedUrl 正确存储（不超过 500 字符）
- 前端可正常显示和复制链接

**验证**: 检查 PlatformPublish 表的 publishedUrl 字段类型是否为 VARCHAR(500)

#### TC-008: 标签自动创建

**步骤**:
1. 发布文章，适配内容包含新标签（如 "测试标签2026"）
2. 检查 WordPress 后台标签列表

**预期结果**:
- 新标签已自动创建
- 标签已关联到发布的文章
- 再次发布含相同标签的文章时，复用已有标签（不重复创建）

### 边界测试

#### BE-001: 空文章内容

- 文章内容极短或为空
- 预期：WordPressAdapter validate() 失败，返回错误

#### BE-002: 超长文章内容

- 文章内容超过 50000 字符
- 预期：WordPress 正常接收（WordPress 本身无严格长度限制）

#### BE-003: 特殊字符标题

- 标题包含 emoji、HTML 实体、特殊符号
- 预期：WordPress 正常处理，标题正确显示

## 已知限制

1. **不支持更新已发布文章**: 重复发布会创建新文章，不会更新 WordPress 上的旧文章
2. **封面图 URL 必须有扩展名**: 如果 URL 无扩展名，系统会根据 Content-Type 自动补全（如 `.jpg`）
3. **WordPress 用户权限**: Application Password 对应的用户需要有发布文章的权限（Author/Editor/Administrator）
4. **不支持媒体库管理**: 上传的图片不会自动清理，需在 WordPress 后台手动管理

## 性能指标

- 适配生成：3-10 秒（取决于 AI 响应速度）
- 封面图上传：2-5 秒（取决于图片大小和网络）
- 标签解析：1-3 秒（每个标签需搜索/创建）
- 文章发布：1-2 秒
- 总耗时：约 10-20 秒（含封面图上传）

## 代码覆盖率

- 新增测试文件：`backend/src/channels/channels.controller.spec.ts`（已更新）
- 新增测试用例：2 个（publishToWordPress 端点测试）
- 建议补充：
  - WordPressAdapter 单元测试
  - WordPressService 集成测试（mock fetch）

## 回滚方案

如需回滚此功能：

1. **数据库**: 
   ```bash
   npx prisma migrate reset
   # 或手动回滚 migration
   ```

2. **代码**: 
   ```bash
   git revert <commit-hash>
   ```

3. **环境变量**: 删除 `backend/.env` 中的 WordPress 配置

## 相关文件清单

### 后端
- `backend/src/channels/platforms/adapters/wordpress.adapter.ts` (新增)
- `backend/src/channels/wordpress.service.ts` (新增)
- `backend/src/channels/dto/publish-wordpress.dto.ts` (新增)
- `backend/src/channels/channels.controller.ts` (修改)
- `backend/src/channels/channels.module.ts` (修改)
- `backend/src/channels/platforms/constants.ts` (修改)
- `backend/src/channels/platforms/platform-registry.ts` (修改)
- `backend/src/articles/articles.service.ts` (修改)
- `backend/src/articles/dto/create-article.dto.ts` (修改)
- `backend/prisma/schema.prisma` (修改)
- `backend/.env.example` (修改)

### 前端
- `frontend/src/lib/channel-api.ts` (修改)
- `frontend/src/components/channels/channel-panel.tsx` (修改)
- `frontend/src/components/channels/platform-preview.tsx` (修改)

### 共享包
- `packages/shared/src/index.ts` (修改)

### 数据库
- `backend/prisma/migrations/20260529040421_extend_published_url_length/` (新增)

---

**版本**: 1.0.0  
**开发完成日期**: 2026-05-29  
**测试状态**: 待测试  
**测试负责人**: QA 团队
