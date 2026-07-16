# 媒体资源管理模块 PRD

> 状态：草案待评审 | 日期：2026-07-16 | 作者：方案设计
>
> 本文档为「先讨论方案再编码」流程的设计产出，确认后进入实现。标注 ⚠️ 的为待决策项。

## 1. 背景与目标

### 1.1 现状

CMS-NG 当前**只有"AI 生成封面图并塞进 article 字段"的能力，没有"媒体资源管理"能力**。所有图片是 article 的附属字符串字段，不是独立实体：

- **存储层**：`backend/src/storage/` 提供 `CosStorageService`（腾讯云 COS，`put`/`delete` only，读走 public HTTPS，bucket 公读私写，CDN 可选）。接口无 `list`/`copy`/`head`/元数据。
- **无上传接口**：全项目零 `FileInterceptor`/`multer`/上传 controller。用户**完全无法手动上传图片**，只能 AI 生成。
- **无独立资源表**：schema 19 个 model 无任何 Media/Asset 表。图片 URL 散落在 `Article.coverImage`(String?)、`PlatformPublish.coverImages`(JSON string)、`AIOperation.result`(JSON string)。
- **AI 图片链路**：`ai.service.ts:1909` `generateArticleImage`（Seedream 文生图 -> 下载 -> 上传 COS -> 写 `AIOperation`），COS key = `cms-ng/articles/{articleId}/cover_{8hex}.{ext}`（代码注释自认"用随机 hex 冒充 asset ID"）。计费 `AI_IMAGE` 0.5 元/张。
- **前端**：无上传组件/无媒体库页面/无菜单项；TipTap 插图仅 `window.prompt` 粘 URL；AI 生成图只能做封面、不能插正文、不能复用。

### 1.2 目标

建立统一的**媒体资源管理**能力，沉淀用户上传图片与 AI 生成图片为可检索、复用、追踪引用的资产库：

1. 用户可手动上传图片（多文件、拖拽/粘贴）。
2. AI 生成的图片自动入库，可在媒体库检索复用、可插入正文。
3. 提供媒体库页面（网格/列表、筛选、搜索、批量、详情编辑）。
4. 文章封面、TipTap 正文插图均接入媒体库选择器，打通使用闭环。
5. 建立图片资产元数据、归属、来源、引用关系、生命周期（含 COS 孤儿清理）。
6. 复用现有 COS 存储，不引入新基础设施。

### 1.3 非目标（本期不做）

- 视频等其他媒体类型（本期仅图片）。
- 病毒扫描、内容审核（图片安全审核）。
- 音频转码、复杂图片处理流水线。
- 跨租户公开图床。

## 2. 数据模型

### 2.1 新增 `MediaAsset` 表

```prisma
model MediaAsset {
  id            String       @id @default(uuid())
  // 存储
  storageKey    String       // COS key（相对 bucket 根，不含前导 /）
  url           String       // 公网访问 URL（含 CDN，与 storageKey 对应）
  thumbnailUrl  String?      // 缩略图 URL（imageMogr2 拼参生成，见 2.5）
  // 文件元数据
  fileName      String       // 展示用文件名（上传原文件名 / AI 生成命名）
  mimeType      String       // image/jpeg | image/png | image/webp | image/gif
  size          Int          // 字节数
  width         Int?         // 像素，上传时解析 / AI 生成时已知
  height        Int?         // 像素
  // 来源
  source        MediaSource  // UPLOAD | AI_GENERATED
  sourceRef     String?      // AI: 关联 aiOperationId；UPLOAD: null
  prompt        String?      @db.Text  // AI 生成时的 prompt
  // 元信息
  altText       String?      // alt 替换文本（无障碍 + SEO）
  title         String?
  description   String?      @db.Text
  tags          String       @default("[]")  // JSON string 数组，沿用项目惯例
  // 归属
  ownerId       String       // 上传者 / 生成者 userId
  libraryType   MediaLibraryType @default(PERSONAL)  // PERSONAL | TEAM（本期仅 PERSONAL；TEAM 预留待 Team 实体建立）
  teamId        String?      // 团队库归属（libraryType=TEAM 时必填，本期不启用）
  // 状态
  status        MediaStatus  // ACTIVE | ARCHIVED | DELETED
  // 时间
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  usages        ArticleMediaAsset[]

  @@index([ownerId, createdAt])
  @@index([source])
  @@index([status])
  @@map("media_assets")
}
```

> ⚠️ 待决策 A：归属模型。当前设计为**个人媒体库**（`ownerId`）。若需团队共享，追加 `teamId String?` + 索引 + 权限逻辑（见 §8 决策 A）。

### 2.2 新增 `ArticleMediaAsset` 引用关联表

建立文章与图片的多对多引用关系，用于引用追踪与"图片被哪里用到"反查：

```prisma
model ArticleMediaAsset {
  id           String              @id @default(uuid())
  articleId    String
  mediaAssetId String
  usage        ArticleMediaUsage   // COVER | INLINE
  createdAt    DateTime            @default(now())

  article      Article             @relation(fields: [articleId], references: [id], onDelete: Cascade)
  mediaAsset   MediaAsset          @relation(fields: [mediaAssetId], references: [id], onDelete: Cascade)

  @@unique([articleId, mediaAssetId, usage])  // 同图同用途不重复计
  @@index([mediaAssetId])
  @@map("article_media_assets")
}
```

- 删文章 -> 级联删关联记录（不删 MediaAsset 本体，图可复用）。
- 删 MediaAsset -> 级联删关联记录（软删时由 service 层处理引用校验，见 §5.4）。

### 2.3 枚举（新增到 `@cms-ng/shared`）

```ts
export enum MediaSource {
  UPLOAD = 'UPLOAD',
  AI_GENERATED = 'AI_GENERATED',
}

export enum MediaStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED',
}

export enum ArticleMediaUsage {
  COVER = 'COVER',
  INLINE = 'INLINE',
}

export enum MediaLibraryType {
  PERSONAL = 'PERSONAL',
  TEAM = 'TEAM',
}
```

> shared 改动后需 `cd packages/shared && npm run build`（Turbo `^build` 会自动处理）。

### 2.4 存量字段处理

`Article.coverImage`、`PlatformPublish.coverImages` **保留不动**（避免大范围回归）：
- 新流程：写 `Article.coverImage` 的同时建立 `ArticleMediaAsset(usage=COVER)` 关联。
- 旧数据：可选回填（见 §8 决策 D）。
- 媒体库是资产的"索引源"，`coverImage` 字段仍作为文章展示的快照，两者通过 `ArticleMediaAsset` 对齐。

### 2.5 缩略图方案（零额外存储）

不存储缩略图对象，复用腾讯云 COS 数据万象 `imageMogr2` URL 拼参：

```
{thumbnailUrl} = {url}?imageMogr2/thumbnail/300x300/format/webp/strip
```

- 公读 bucket 可直接访问；CDN（`COS_BASE_URL`）回源会缓存处理结果。
- `MediaService` 在入库/出库时统一拼接，DB 的 `thumbnailUrl` 可存可不存（存则避免每次拼参，推荐存）。

## 3. 后端设计

### 3.1 StorageService 增强（渐进）

当前接口仅 `put`/`delete`。本期新增 `copy`（资产复制/正文图片另存场景），其余暂不加：

```ts
export interface StorageService {
  put(key: string, body: Buffer, contentType?: string): Promise<PutResult>;
  delete(key: string): Promise<void>;
  copy(srcKey: string, destKey: string): Promise<PutResult>;  // 新增
}
```

`CosStorageService.copy` 用 SDK `putObjectCopy`。不引入 `list`/`head`/`presigned`（中转上传不需要；直传方案见 §8 决策 A）。

### 3.2 MediaModule 结构

沿用项目约定（module/controller/service/dto + spec）：

```
backend/src/media/
  media.module.ts
  media.controller.ts
  media.service.ts
  media.service.spec.ts
  dto/
    upload-media.dto.ts
    query-media.dto.ts
    update-media.dto.ts
    ai-generate-media.dto.ts
```

注入：`STORAGE_SERVICE`、`PrismaService`、`AIService`（AI 生成）、`BillingService`（AI 计费）。

### 3.3 REST API

所有接口受全局 JWT 保护（`APP_GUARD -> JwtAuthGuard`），按 `ownerId` 隔离（个人库）。

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/media/upload` | multipart 多文件上传，中转写 COS + 入库，返回 `MediaAsset[]` |
| `GET` | `/media` | 分页列表，过滤 `source`/`status`/`tags`/搜索 `fileName`/`altText`/`prompt` |
| `GET` | `/media/:id` | 详情（含 `usage` 引用列表） |
| `PATCH` | `/media/:id` | 更新 `altText`/`title`/`description`/`tags`/`status` |
| `DELETE` | `/media/:id` | 软删（`status=DELETED`）+ 删 COS 对象 + 清理 `ArticleMediaAsset` |
| `POST` | `/media/ai-generate` | AI 生成图片入库（解耦 article，支持正文插图/独立生成） |
| `GET` | `/media/:id/usage` | 查询该图被哪些文章引用（`ArticleMediaAsset` 反查） |

响应统一用 `ApiResponse<T>`。

### 3.4 上传接口细节

```ts
@Post('upload')
@UseInterceptors(FilesInterceptor('files', 20))
@ApiOperation({ summary: '上传图片（多文件）' })
async upload(
  @UploadedFiles() files: Express.Multer.File[],
  @Req() req: AuthenticatedRequest,
): Promise<ApiResponse<MediaAsset[]>> { ... }
```

- **校验**：MIME 白名单（jpg/png/webp/gif）、单文件大小上限（默认 10MB，可配 `MEDIA_UPLOAD_MAX_BYTES`）、magic number 校验（防伪造扩展名）。
- **key 生成**：`cms-ng/media/{ownerId}/{yyyyMM}/{uuid}.{ext}` -- 按用户+月份分目录，uuid 为主键，避免碰撞与可预测。
- **图片尺寸解析**：用 `image-size` 库从 Buffer 读 width/height。
- **入库**：每文件一条 `MediaAsset`（`source=UPLOAD`）。

> ⚠️ 待决策 A：上传方式（中转 vs 直传），见 §8。

### 3.5 AI 生成接口改造

现状 `generateArticleImage` 强耦合 `articleId`（用于 key 前缀和 prompt 构建）。改造：

1. 抽出 `generateImage(userId, { title?, content?, customPrompt?, style?, size? })`，不依赖 article。
2. `POST /media/ai-generate` 调用之，生成后：
   - 上传 COS（key 改为 `cms-ng/media/{ownerId}/{yyyyMM}/{uuid}.{ext}`，与上传一致）。
   - 写 `MediaAsset`（`source=AI_GENERATED`, `sourceRef=aiOperationId`, `prompt`）。
   - 沿用 `AI_IMAGE` 计费 + 幂等 key。
3. 旧的 `POST /articles/:id/ai-generate-image` 保留兼容：内部改为调 `generateImage` + 建立 `ArticleMediaAsset(usage=COVER)` + 仍写 `Article.coverImage`。
4. auto-publish pipeline 的 `image-generation` step 同步改造：生成后入库 + 建立 COVER 关联。

### 3.6 孤儿清理

- 删 `MediaAsset`（`DELETE /media/:id`）：软删 + 删 COS 对象 + 删 `ArticleMediaAsset` 关联。
- 删 `Article`：级联删 `ArticleMediaAsset`（不删 MediaAsset 本体）。
- **不级联删 article 字段里的 URL**（`coverImage` 仍是 URL 字符串，删图后该 URL 失效 -- 前端展示需容错 onerror 占位）。
- 可选 Phase 4：定时任务扫描 `status=DELETED` 超过 N 天且无引用的对象做最终物理清理（本期软删已删 COS，可不做）。

## 4. 前端设计

### 4.1 新增路由与菜单

- 路由：`/dashboard/media`（媒体库）。
- 导航菜单（`frontend/src/app/dashboard/layout.tsx:13-22` `allNavItems`）新增一项「媒体库」，角色可见性按现有过滤逻辑。
- 媒体库 API client：`frontend/src/lib/media-api.ts`。

### 4.2 媒体库页面

- **视图**：网格（缩略图）+ 列表切换；默认网格。
- **筛选**：来源（全部/上传/AI 生成）、状态、标签、时间范围；搜索框（fileName/altText/prompt）。
- **操作**：单图详情抽屉（预览大图、编辑 alt/title/description/tags、查看引用列表、下载、删除）；批量选择 + 批量删除/加标签。
- **上传区**：页面顶部/空态支持拖拽上传 + 点击上传。
- **AI 生成入口**：页面内「AI 生成图片」按钮（弹窗复用文章编辑器的生成 UI 参数：style/ratio/size/prompt）。

### 4.3 通用组件

- **`<ImageUploader>`**：拖拽 + 点击 + 粘贴；多文件；进度条；前端预校验（类型/大小）；上传成功回调。
- **`<MediaPicker>`**（Modal）：网格浏览 + 搜索 + 标签筛选 + 内嵌上传新图；选中返回 `MediaAsset`（`url`/`altText`/`id`）。用于：文章封面选择、TipTap 正文插图。

### 4.4 文章封面选择改造

`articles/[id]/page.tsx` 封面区当前仅有「AI 生成配图」。改为三入口：

1. **AI 生成**（保留，生成后入库 + COVER 关联）。
2. **从媒体库选择**（打开 `MediaPicker`）。
3. **上传新图**（打开 `ImageUploader`，上传后直接选用 + COVER 关联）。

封面 `coverImage` 字段在 `handleSave` 时一并提交（修复当前不提交的 bug），后端 `updateArticle` 接受 `coverImage` 并同步 `ArticleMediaAsset`。

### 4.5 TipTap 正文插图改造

`rich-text-editor.tsx:124-128` 的 `window.prompt` 改为打开 `MediaPicker`：

```ts
const insertImage = () => {
  openMediaPicker((asset) => {
    editor.chain().focus().setImage({
      src: asset.url,
      alt: asset.altText,
      title: asset.title,
    }).run();
  });
};
```

- 保留 `allowBase64:false`。
- 可选：自定义 Image 节点扩展，在节点上挂 `data-media-id`，便于保存时扫描正文建立 `INLINE` 引用（Phase 3）。

### 4.6 正文图片引用追踪（Phase 3）

文章保存时，扫描 TipTap JSON 中 `type:'image'` 节点的 `data-media-id`，重建该文的 `ArticleMediaAsset(usage=INLINE)` 关联。这样媒体库能反查"这张图被哪些文章正文用到"。

## 5. 计费与配额

- **AI 生成**：沿用 `TransactionType.AI_IMAGE`，单价可配（`ai_image_per_piece`，默认 0.5）。
- **手动上传**：本期**不计费**。
- **存储配额**：按用户/团队设软配额（默认如 1GB，可配 `MEDIA_STORAGE_QUOTA_BYTES`），超额拒绝上传并返回明确错误。配额统计 = 该 owner 下 `status=ACTIVE` 的 `size` 之和。

> ⚠️ 待决策 E：是否本期上配额、额度多少。见 §8。

## 6. 安全

- 鉴权：全局 JWT + `ownerId` 隔离（个人库）；跨用户访问他人资产返回 404/403。
- 文件校验：MIME 白名单 + magic number + 大小上限。
- 文件名：不信任客户端文件名，展示名可保留但存储 key 用 uuid。
- URL：公读 bucket 暴露 URL，敏感图（本期不区分）后续可走签名 URL（需 StorageService 加 presigned，本期不做）。

## 7. 分阶段实施

| 阶段 | 范围 | 产出 |
|---|---|---|
| **Phase 1 MVP** | MediaAsset 表 + 上传 API + 媒体库页面（列表/上传/删除/详情编辑）+ 菜单 | 能存、能管、能看 |
| **Phase 2** | `MediaPicker` + 文章封面三入口改造 + TipTap 正文插图接入 | 打通文章使用闭环 |
| **Phase 3** | AI 生成入媒体库（解耦 article）+ `ArticleMediaAsset` 引用追踪（COVER + INLINE） | 来源统一、引用可查 |
| **Phase 4** | 存储配额、批量操作、图片处理（裁剪/水印）、孤儿清理定时任务、存量回填 | 完善治理 |

> ⚠️ 待决策 C：本期实施到哪个 Phase。见 §8。

## 8. 已决策项（2026-07-16 确认）

| 编号 | 决策 | 结论 |
|---|---|---|
| **A** | 上传方式 | **后端中转**：前端 POST -> 后端接收 -> 上传 COS。StorageService 仅加 `copy`，不加 presigned/STS。 |
| **B** | 资源归属 | **个人库先行 + 预留字段**：本期仅 PERSONAL；MediaAsset 预留 `libraryType`+`teamId?`，待 Team 实体建立后启用 TEAM 库，零迁移。项目当前无 Team 表（仅 `User.department` 自由文本）。 |
| **C** | 本期范围 | **Phase 1+2**：媒体库 + 上传 + 文章封面三入口 + TipTap 正文插图。AI 入库与 `ArticleMediaAsset` 引用追踪留 Phase 3。 |
| **D** | 存量迁移 | **不迁移**：仅新增走新流程，存量 `Article.coverImage` 保持散落 URL，媒体库不展示历史图。 |
| **E** | 存储配额 | **暂不限制**：放 Phase 4。 |
| **F** | 缩略图 | **imageMogr2 拼参**：零存储、CDN 缓存。 |

## 9. 测试策略

> 用户为资深 QA，以下为重点关注项。

### 9.1 后端单测（`*.spec.ts`）

- `MediaService`：upload（校验失败/成功/多文件/配额）、list（过滤/分页/搜索）、update、softDelete（删 COS + 清关联）、aiGenerate（计费/幂等/入库）。
- `CosStorageService.copy`：SDK 调参正确性。
- DTO 校验：`@cms-ng/shared` 枚举值、文件类型/大小、嵌套 DTO 用 `@Type`+`@ValidateNested`（参考已踩过的坑 #46/#47/#53）。

### 9.2 后端 e2e（`*.e2e-spec.ts`）

- 完整链路：登录 -> 上传 -> 列表可见 -> 详情 -> 更新 -> 删除（COS 对象删除被调用）。
- 权限：A 用户访问 B 用户资产 -> 403/404。
- AI 生成：余额不足 -> 拒绝；成功 -> 入库 + 计费事务生成。

### 9.3 前端单测（Vitest + jsdom）

- `<ImageUploader>`：拖拽/类型校验/进度/错误态。
- `<MediaPicker>`：列表/搜索/选中回调/内嵌上传。
- 媒体库页面：筛选/分页/空态。

### 9.4 E2E（Playwright，参考 `/regression-testing`）

- 上传图片 -> 媒体库可见 -> 打开文章 -> TipTap 插入该图 -> 保存 -> 重新打开正文仍在。
- AI 生成图片 -> 媒体库可见（来源=AI）-> 设为封面 -> 文章列表封面展示。
- 删除图片 -> 媒体库消失 -> 引用该图的文章封面 onerror 占位。
- 配额/大文件/并发上传的错误处理（若启用）。

### 9.5 边界与回归

- COS 孤儿：删除后 COS 对象确实被 `deleteObject`（mock 验证）。
- 删文章不删 MediaAsset 本体（图可复用）。
- `Article.coverImage` 与 `ArticleMediaAsset` 一致性。
- TipTap `allowBase64:false` 不被破坏。
- 现有 auto-publish pipeline 图片步骤不回归（仍生成封面 + 文章 IMAGED 状态）。

## 10. 风险

- **auto-publish pipeline 回归**：改造 `generateArticleImage` 链路时，必须保证 pipeline 的 image-generation step 行为不变（生成封面 + `IMAGED` 状态 + 非关键失败容错）。需补单测守住。
- **COS 孤儿**：软删若只改 status 不删 COS，会留存计费对象 -- 本期设计为软删即删 COS 对象。
- **存量 URL 失效**：删图后 `Article.coverImage` 仍指向失效 URL，前端需 onerror 容错。
- **shared 枚举发布**：新增枚举需 build shared 包，前后端才能引用（Turbo 依赖）。
