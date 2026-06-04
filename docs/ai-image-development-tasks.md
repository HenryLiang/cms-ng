# AI 智能配图功能 — 开发任务清单

> **状态**: 已被后续实现替代
>
> 本文档描述的是 **2026-05-23 原始开发计划**,当时计划使用本地文件系统存储图片。**截至 2026-06-04,存储层已迁移至腾讯云 COS 对象存储**,相关代码改动已完成,见:
> - 设计文档: `docs/superpowers/specs/2026-06-04-cos-storage-design.md`
> - 实施计划: `docs/superpowers/plans/2026-06-04-cos-storage-implementation.md`

## 1. 任务总览

| 迭代 | 范围 | 预估工时 | 优先级 |
|------|------|----------|--------|
| 迭代 1 | 核心闭环：AI 分析 + 封面图 + 正文插图 | 5-6 天 | P0 |
| 迭代 2 | 平台扩展：7 平台 OG 图 + 渠道分发集成 | 3-4 天 | P1 |
| 迭代 3 | 体验优化：图生图 + 风格统一 + ALT 自动生成 | 2-3 天 | P2 |
| **合计** | | **10-13 天** | |

---

## 2. 迭代 1：核心闭环（5-6 天）

**目标**：记者能完成"分析 → 生成 → 设为封面 / 插入正文"的完整流程。

### 2.1 后端任务

#### Task-B1: 数据库迁移 — ArticleImage 模型
- **工作量**：0.5 天
- **前置依赖**：无
- **负责人**：后端开发
- **详细内容**：
  - 修改 `prisma/schema.prisma`：新增 `ArticleImage` 模型、`ImageUsageType` 枚举
  - 修改 `Article` 模型：新增 `images` 关系字段
  - 创建 migration 文件并执行 `prisma migrate dev`
  - 执行 `prisma generate` 生成客户端
- **验收标准**：
  - [ ] `npx prisma migrate status` 显示 migration 已应用
  - [ ] Prisma Studio 中可见 `article_images` 表
  - [ ] TypeScript 编译通过，无类型错误

#### Task-B2: 图片存储服务
- **工作量**：0.5 天
- **前置依赖**：Task-B1
- **负责人**：后端开发
- **详细内容**：
  - ~~新建 `backend/src/upload/upload.module.ts` 和 `upload.service.ts`~~ (已由 `StorageModule` + `CosStorageService` 替代,见 COS 实施计划)
  - ~~实现 `saveImageFromUrl()`：axios 下载 + 本地文件写入~~
  - ~~实现 `deleteImage()`：文件删除 + 错误处理~~
  - ~~实现 `getImagePath()`：路径拼接~~
  - ~~在 `main.ts` 注册 `app.use('/uploads', express.static(...))`~~ (已删除,图片走 COS)
  - ~~在 `AppModule` 中导入 `UploadModule`~~ (已由 `StorageModule` 替代)
- **验收标准**：
  - [x] `CosStorageService.put()` 能把网络图片上传到 COS 并返回公网 URL
  - [x] `CosStorageService.delete()` 能从 COS 删除对象
  - [x] 图片公网可访问(COS bucket 设为公有读)
  - [x] 单元测试覆盖 put 和 delete 逻辑

#### Task-B3: Seedream API 集成
- **工作量**：1 天
- **前置依赖**：无
- **负责人**：后端开发
- **详细内容**：
  - 在 `.env.example` 中新增 `SEEDREAM_API_KEY`、`SEEDREAM_API_BASE`、`SEEDREAM_MODEL`
  - 在 `ai.service.ts` 中新增 `generateImages()` 方法
  - 封装 Seedream HTTP 调用：`POST /images/generations`
  - 支持参数：model、prompt、size、output_format、response_format、watermark
  - 支持批量生成：`sequential_image_generation: "auto"` + `max_images`
  - 错误处理：超时重试（2 次）、内容安全、配额用尽
  - 记录 AIOperation（agentType: VISUAL, action: generate_images）
- **验收标准**：
  - [ ] 使用真实/模拟 API Key 能成功生成图片并返回 URL
  - [ ] 批量生成 3 张图片能正确返回 3 个 URL
  - [ ] API 失败时返回友好错误信息
  - [ ] AIOperation 表中能看到生图记录

#### Task-B4: AI 分析配图需求
- **工作量**：0.5 天
- **前置依赖**：无
- **负责人**：后端开发
- **详细内容**：
  - 在 `ai.service.ts` 中新增 `analyzeImageNeeds()` 方法
  - 构建 Kimi prompt：让 AI 分析文章并输出结构化推荐 JSON
  - Prompt 要求输出：`{ recommendations: [{ purpose, insertAfterParagraph?, prompt, size, platform?, reason }] }`
  - 正文插图数量限制：最多 5 张
  - 封面图：1 张（如文章有明确主题）
  - 平台 OG 图：按需生成（根据文章 platforms 字段）
  - 记录 AIOperation（agentType: VISUAL, action: analyze_image_needs）
  - 新增 DTO：`visual-operations.dto.ts`
- **验收标准**：
  - [ ] 输入一篇香港楼市文章，返回包含封面 + 正文插图 + 平台 OG 的推荐
  - [ ] 推荐 JSON 格式正确，字段完整
  - [ ] 短文（<100 字）返回 CONTENT_TOO_SHORT 错误

#### Task-B5: API 端点实现
- **工作量**：0.5 天
- **前置依赖**：Task-B3, Task-B4
- **负责人**：后端开发
- **详细内容**：
  - `POST /articles/:id/ai-image-analysis` → `aiImageAnalysis()`
  - `POST /articles/:id/ai-generate-images` → `aiGenerateImages()`
  - `DELETE /articles/:id/images/:imageId` → `deleteImage()`
  - `GET /articles/:id/images` → `getImages()`
  - 在 `articles.controller.ts` 和 `articles.service.ts` 中实现
  - 权限校验：调用现有 `verifyAccess()`
  - DTO 校验：新增 `GenerateImagesDto`、`ImageRecommendationDto`
- **验收标准**：
  - [ ] 4 个端点通过 Postman 测试返回正确结果
  - [ ] 未授权访问返回 403
  - [ ] 文章不存在返回 404
  - [ ] 输入校验失败返回 400

#### Task-B6: 图片应用与清理逻辑
- **工作量**：0.5 天
- **前置依赖**：Task-B2, Task-B5
- **负责人**：后端开发
- **详细内容**：
  - `insertImageToContent()`：将 `<img>` 标签插入 Article.content HTML 指定段落
  - 更新 `ArticleService.remove()`：级联删除 ArticleImage + COS 对象
  - 更新 `ArticleService.update()`：支持 coverImage 字段更新
  - `PlatformPublish` coverImages 字段的读写逻辑
- **验收标准**：
  - [ ] 删除文章后，COS 中对应 `cms-ng/articles/{id}/` 对象被删除
  - [ ] 插入正文后，Article.content 包含正确的 `<img>` 标签
  - [ ] 设为封面后，Article.coverImage 更新

### 2.2 前端任务

#### Task-F1: TipTap Image Extension 启用
- **工作量**：0.5 天
- **前置依赖**：无
- **负责人**：前端开发
- **详细内容**：
  - 在 `rich-text-editor.tsx` 中导入 `@tiptap/extension-image`
  - 在 extensions 数组中加入 `Image.configure({ inline: true })`
  - 工具栏新增"插入图片"按钮
  - 支持图片拖拽插入
  - 图片样式：max-width 100%、居中、圆角、阴影
- **验收标准**：
  - [ ] TipTap 编辑器能显示图片
  - [ ] 点击"插入图片"按钮能插入图片 URL
  - [ ] 拖拽图片到编辑器能插入
  - [ ] 图片在编辑器中居中显示

#### Task-F2: 前端 API 层
- **工作量**：0.5 天
- **前置依赖**：Task-B5
- **负责人**：前端开发
- **详细内容**：
  - 在 `article-api.ts` 中新增：
    - `aiImageAnalysis(id)`
    - `aiGenerateImages(id, recommendations)`
    - `deleteArticleImage(id, imageId)`
    - `getArticleImages(id)`
  - 定义 TypeScript 接口：`ImageRecommendation`、`GeneratedImage`
- **验收标准**：
  - [ ] 4 个 API 函数 TypeScript 类型正确
  - [ ] 能通过前端调用后端端点并返回正确数据

#### Task-F3: AI 配图面板组件
- **工作量**：1.5 天
- **前置依赖**：Task-F2
- **负责人**：前端开发
- **详细内容**：
  - 新建 `image-gen-panel.tsx`
  - 实现 5 种面板状态：EMPTY / ANALYZING / RECOMMENDATIONS / GENERATING / RESULTS
  - 实现状态切换动画（淡入淡出）
  - 实现推荐卡片组件：`ImageRecommendationCard`
    - 勾选框、用途标签、prompt 预览、尺寸、推荐理由
    - 展开/收起 prompt 编辑（textarea + 字数统计）
    - 尺寸下拉选择
  - 实现结果卡片组件：`GeneratedImageCard`
    - 图片预览（点击放大）
    - 操作按钮：设为封面、插入正文、分配平台、删除
    - 状态标识：未应用 / 已设为封面 / 已插入 / 已分配
  - 实现生成进度组件：进度条 + 生成日志列表
  - 底部操作栏：全部插入 / 全部设为封面 / 完成
- **验收标准**：
  - [ ] 5 种状态能正确切换
  - [ ] 推荐卡片能勾选/取消、编辑 prompt、修改尺寸
  - [ ] 生成进度条实时更新
  - [ ] 结果卡片操作按钮功能正常
  - [ ] 面板动画流畅无卡顿

#### Task-F4: 封面图设置 UI
- **工作量**：0.5 天
- **前置依赖**：Task-F3
- **负责人**：前端开发
- **详细内容**：
  - 在文章编辑页标题区下方添加封面图区域
  - 无封面：占位图 + "AI 生成封面"按钮
  - 有封面：缩略图 + "更换" / "预览" / "移除"按钮
  - hover 效果：半透明遮罩 + "更换封面"
  - 点击"AI 生成封面" → 打开配图面板并自动触发分析
- **验收标准**：
  - [ ] 封面图区域能正确显示当前封面或占位图
  - [ ] hover 显示操作按钮
  - [ ] 点击操作按钮功能正常
  - [ ] 设为封面后编辑页实时更新

#### Task-F5: 段落选择器与插入逻辑
- **工作量**：0.5 天
- **前置依赖**：Task-F1, Task-F3
- **负责人**：前端开发
- **详细内容**：
  - 新建 `paragraph-selector.tsx`
  - 解析 Article.content HTML，提取段落列表
  - 显示段落摘要（前 50 字）+ 单选按钮
  - 支持"文章开头"和"文章末尾"选项
  - 点击"确认插入"后，调用 TipTap editor API 在指定位置插入图片
  - 更新 `ArticleImage.usageType` 和 `sortOrder`
- **验收标准**：
  - [ ] 段落选择器正确显示文章段落
  - [ ] 选择段落并确认后，图片插入正确位置
  - [ ] 插入后 TipTap 编辑器实时更新

### 2.3 迭代 1 依赖关系

```
Task-B1 (数据库)
    │
    ▼
Task-B2 (存储服务) ──► Task-B6 (应用与清理)
    │                      ▲
    ▼                      │
Task-B3 (Seedream) ────────┤
    │                      │
    ▼                      │
Task-B4 (AI分析) ──────────┤
    │                      │
    ▼                      │
Task-B5 (API端点) ─────────┘
    │
    ▼
Task-F2 (前端API)
    │
    ├──► Task-F3 (配图面板)
    │       │
    │       ├──► Task-F4 (封面图UI)
    │       │
    │       └──► Task-F5 (段落选择器)
    │
    └──► Task-F1 (TipTap Image)
            │
            └──► Task-F5 (段落选择器)
```

**关键路径**：Task-B1 → Task-B2 → Task-B3 → Task-B4 → Task-B5 → Task-F2 → Task-F3 → Task-F4
**最短完成时间**：5 天（假设后端和前端并行开发）

---

## 3. 迭代 2：平台扩展（3-4 天）

**目标**：运营能为各分发平台生成适配尺寸的封面图。

### 3.1 后端任务

#### Task-B7: 平台 OG 图尺寸适配
- **工作量**：0.5 天
- **前置依赖**：Task-B3, Task-B5
- **负责人**：后端开发
- **详细内容**：
  - 根据 `PlatformMetadata.aspectRatios` 计算 Seedream 最佳尺寸
  - 比例映射：1.91:1 → 2048x1075, 1:1 → 2048x2048, 3:4 → 1536x2048 等
  - 在 `analyzeImageNeeds()` 中，为每个启用了图片的平台生成推荐
- **验收标准**：
  - [ ] Facebook 推荐尺寸为 2048x1075
  - [ ] Instagram 推荐尺寸为 2048x2048 或指定比例
  - [ ] 小红书推荐尺寸为 1536x2048 (3:4)

#### Task-B8: 平台封面图 API
- **工作量**：0.5 天
- **前置依赖**：Task-B7
- **负责人**：后端开发
- **详细内容**：
  - `POST /articles/:id/platforms/:platform/generate-cover`
  - 接收 platform 参数，读取对应 `aspectRatio`
  - 调用 Seedream 生成对应尺寸
  - 保存到 `PlatformPublish.coverImages`
  - `PATCH /articles/:id/platforms/:platform/assign-cover` — 分配已有图片
- **验收标准**：
  - [ ] 能为指定平台生成对应比例的封面图
  - [ ] 生成的图片正确关联到 PlatformPublish 记录

### 3.2 前端任务

#### Task-F6: 平台封面图卡片
- **工作量**：0.5 天
- **前置依赖**：Task-F3
- **负责人**：前端开发
- **详细内容**：
  - 修改 `channel-panel.tsx`，在每个平台卡片中新增封面图区域
  - 显示当前封面缩略图（带比例裁剪预览）
  - "生成封面"按钮 → 调用平台封面图生成 API
  - "更换封面" → 打开配图面板并过滤 PLATFORM_OG 类型
  - "移除封面"按钮
- **验收标准**：
  - [ ] 平台卡片显示封面图或占位图
  - [ ] 点击"生成封面"成功生成对应比例封面
  - [ ] 封面图能正确显示比例裁剪效果

#### Task-F7: 平台选择器
- **工作量**：0.5 天
- **前置依赖**：Task-F3
- **负责人**：前端开发
- **详细内容**：
  - 新建 `platform-selector.tsx`
  - 展示所有 supportsImages=true 的平台列表
  - 每个平台显示：平台图标、名称、推荐比例
  - 支持单选/多选
  - 确认后调用 `assignCoverToPlatform()`
- **验收标准**：
  - [ ] 平台选择器正确显示支持图片的平台
  - [ ] 选择平台后图片正确分配

#### Task-F8: 批量操作
- **工作量**：0.5 天
- **前置依赖**：Task-F3, Task-F6
- **负责人**：前端开发
- **详细内容**：
  - 配图面板结果态底部："全部设为封面"、"全部插入正文"按钮
  - 平台分发面板："一键生成所有平台封面"按钮
  - 批量操作进度提示
- **验收标准**：
  - [ ] 点击"全部设为封面"将所有未应用图片设为封面（取第一张）
  - [ ] 点击"全部插入正文"将所有 INLINE 图片插入文章
  - [ ] 点击"一键生成所有平台封面"并行生成所有平台封面

---

## 4. 迭代 3：体验优化（2-3 天）

**目标**：提升配图质量和操作效率。

### 4.1 后端任务

#### Task-B9: ALT 文字自动生成
- **工作量**：0.5 天
- **前置依赖**：Task-B4
- **负责人**：后端开发
- **详细内容**：
  - 在 `analyzeImageNeeds()` 中，为每张推荐生成 `alt` 字段
  - 或使用 Kimi API 基于 prompt 生成简洁 ALT 文字（≤100 字）
  - 保存到 `ArticleImage.alt`
- **验收标准**：
  - [ ] 每张生成的图片有对应的 ALT 文字
  - [ ] ALT 文字能准确描述图片内容

#### Task-B10: 图片去重与复用
- **工作量**：0.5 天
- **前置依赖**：无
- **负责人**：后端开发
- **详细内容**：
  - 相同 articleId + 相同 prompt 的图片不再重复生成
  - 返回已有的 `ArticleImage` 记录
- **验收标准**：
  - [ ] 重复生成相同 prompt 时返回已有图片

### 4.2 前端任务

#### Task-F9: 图生图支持
- **工作量**：0.5 天
- **前置依赖**：Task-F3
- **负责人**：前端开发
- **详细内容**：
  - 在推荐卡片中新增"上传参考图"功能
  - 支持拖拽上传参考图
  - 参考图随 prompt 一起发送到后端
- **验收标准**：
  - [ ] 能上传参考图并显示缩略图
  - [ ] 参考图正确传递到后端

#### Task-F10: 风格统一开关
- **工作量**：0.5 天
- **前置依赖**：Task-F3
- **负责人**：前端开发
- **详细内容**：
  - 在配图面板顶部新增"统一风格"开关
  - 开启后，所有 prompt 自动追加相同的风格后缀
  - 支持自定义风格关键词输入
- **验收标准**：
  - [ ] 开启统一风格后，所有生成的图片风格一致
  - [ ] 风格关键词可自定义

#### Task-F11: 键盘快捷键
- **工作量**：0.5 天
- **前置依赖**：Task-F3
- **负责人**：前端开发
- **详细内容**：
  - `Ctrl/Cmd + Shift + I`：打开 AI 配图面板
  - `Esc`：关闭面板
  - `Enter`：确认当前操作
  - `Space`：在推荐卡片中勾选/取消
- **验收标准**：
  - [ ] 快捷键功能正常
  - [ ] 快捷键不与其他功能冲突

---

## 5. 全局任务（贯穿全迭代）

### Task-G1: 单元测试
- **工作量**：1 天（分摊到各迭代）
- **详细内容**：
  - `upload.service.spec.ts`：测试下载、保存、删除
  - `ai.service` 新增测试：分析配图需求、生图 prompt 构建
  - `articles.controller` 新增测试：4 个图片端点
- **验收标准**：
  - [ ] 新增代码测试覆盖率 ≥ 80%
  - [ ] `npm run test` 全部通过

### Task-G2: 联调测试
- **工作量**：0.5 天
- **详细内容**：
  - 端到端测试完整流程
  - 测试异常场景（网络中断、API 失败、存储满）
- **验收标准**：
  - [ ] 完整流程测试通过（见 FSD 验收标准）

### Task-G3: 文档更新
- **工作量**：0.5 天
- **详细内容**：
  - 更新 `CLAUDE.md` 中关于图片功能的部分
  - 更新 `project-status.html`
- **验收标准**：
  - [ ] 文档与实现一致

---

## 6. 任务分配建议

### 人员分工（假设 1 后端 + 1 前端）

| 天数 | 后端任务 | 前端任务 |
|------|----------|----------|
| Day 1 | Task-B1 (数据库) + Task-B2 (存储) | Task-F1 (TipTap Image) |
| Day 2 | Task-B3 (Seedream) + Task-B4 (AI分析) | Task-F2 (前端API) + Task-F3 前半部分 |
| Day 3 | Task-B5 (API端点) + Task-B6 (应用清理) | Task-F3 后半部分 (配图面板完成) |
| Day 4 | Task-B7 (平台适配) + Task-B8 (平台API) | Task-F4 (封面图UI) + Task-F5 (段落选择器) |
| Day 5 | Task-G1 (单元测试) + Task-G2 (联调) | Task-F6 (平台封面卡片) + Task-F7 (平台选择器) |
| Day 6 | Task-B9 (ALT) + Task-B10 (去重) | Task-F8 (批量操作) + Task-F9 (图生图) |
| Day 7 | Task-G3 (文档) | Task-F10 (风格统一) + Task-F11 (快捷键) + Task-G3 |

### 风险缓冲

- Seedream API 接入可能存在不可预期的鉴权/限流问题，预留 0.5 天缓冲
- TipTap Image Extension 与现有编辑器样式冲突，预留 0.5 天缓冲
- **建议总排期：8 个工作日（含缓冲）**

---

## 7. 验收检查清单（Checklist）

### 功能验收

- [ ] AI 分析配图需求返回结构化推荐（含封面 + 正文 + 平台 OG）
- [ ] 记者可勾选/取消推荐项
- [ ] 记者可修改 prompt 和尺寸
- [ ] 批量生成图片并显示进度
- [ ] 生成失败时有明确错误提示
- [ ] 生成的图片可设为封面
- [ ] 生成的图片可插入正文指定段落
- [ ] 生成的图片可分配给平台
- [ ] 图片可删除并级联清理
- [ ] 文章删除时所有配图文件被清理

### 性能验收

- [ ] AI 分析 ≤ 5 秒
- [ ] 单张生成 ≤ 10 秒
- [ ] 批量 5 张 ≤ 30 秒
- [ ] 面板打开 ≤ 1 秒
- [ ] 图片预览加载 ≤ 2 秒

### 体验验收

- [ ] 面板状态切换动画流畅
- [ ] 生成过程有进度反馈
- [ ] 图片预览支持放大查看
- [ ] 操作后有 Toast 提示
- [ ] 错误场景有引导文案
- [ ] 移动端适配正常

### 安全验收

- [ ] Seedream URL 下载到本地，不直接引用外部 URL
- [ ] 未授权用户无法操作他人文章配图
- [ ] 所有 AI 操作记录审计日志
- [ ] 敏感内容 prompt 被拦截并提示

---

## 8. 变更日志

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.0 | 2026-05-23 | 初版开发任务清单，含 3 个迭代、11 个后端任务、11 个前端任务、3 个全局任务 |
