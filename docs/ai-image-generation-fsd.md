# AI 智能配图功能 — 功能规格文档 (FSD)

## 1. 文档信息

| 项目 | 内容 |
|------|------|
| 功能名称 | AI 智能配图 (AI Smart Image Generation) |
| 所属模块 | AI 协作创作 (Module 3) |
| PRD 版本 | v1.4 |
| FSD 版本 | v1.0 |
| 文档日期 | 2026-05-23 |
| 产品负责人 | 产品技术团队 |

---

## 2. 功能概述

### 2.1 功能定位

AI 智能配图是嵌入记者写作流程的 AI 视觉生成功能。记者在文章编辑页点击"AI 配图"按钮，系统自动分析文章内容，推荐 1-5 张配图方案（含正文插图位置、封面图、平台 OG 图），经记者确认后调用 Seedream 5.0 lite 文生图 API 批量生成。生成的图片下载到本地服务器存储，支持一键设为封面、插入正文指定段落、分配给各分发平台。

### 2.2 范围边界

**包含 (In Scope)**
- AI 分析文章内容并输出结构化配图推荐
- 文章封面图生成（1 张）
- 正文插图生成（0-5 张，可选段落插入位置）
- 7 个分发平台 OG/社交封面图生成（Facebook、Instagram、X、Threads、LinkedIn、小红书、YouTube）
- 记者对推荐方案的勾选/修改/确认
- 生成图片的预览、设为封面、插入正文、分配平台、删除
- 图片本地存储与级联清理
- 所有 AI 操作的审计日志

**不包含 (Out of Scope)**
- 图生图（上传参考图进行风格迁移）
- 批量风格统一（同一文章多张配图风格一致）
- AI 自动配图（无需人工确认直接生成插入）
- 图片 ALT 文字自动生成
- 图片编辑（裁剪、滤镜、文字叠加）
- 外部图片库集成（Unsplash、Getty 等）

---

## 3. 用户角色与权限矩阵

| 功能 | 记者 (Reporter) | 编辑 (Editor) | 运营 (Operator) | 管理员 (Admin) |
|------|----------------|---------------|-----------------|----------------|
| AI 分析配图需求 | ✅ | ✅ (审核时) | ✅ (分发前) | ✅ |
| 生成配图 | ✅ | ✅ | ✅ | ✅ |
| 设为封面 | ✅ (自己的文章) | ✅ (分配给自己的) | ❌ | ✅ |
| 插入正文 | ✅ (自己的文章) | ✅ (分配给自己的) | ❌ | ✅ |
| 分配平台封面 | ✅ | ✅ | ✅ | ✅ |
| 删除配图 | ✅ (自己的文章) | ✅ | ❌ | ✅ |
| 查看他人配图 | ❌ | ✅ (审核队列中) | ❌ | ✅ |

> **说明**：记者只能操作自己创建或作为 reporter 被分配的文章配图。编辑可以操作审核队列中分配给自己的文章配图。运营在分发环节可以为平台生成/分配封面图。

---

## 4. 用户流程

### 4.1 主流程：完整配图生成

```
[记者打开文章编辑页]
    │
    ▼
[点击"AI 配图"按钮]
    │
    ▼
[系统显示 AI 配图面板 — 空态]
    │
    ▼
[点击"AI 分析配图需求"]
    │
    ├──► [后端] 调用 Kimi API 分析文章内容
    │      ├── 输入：title + content + excerpt
    │      └── 输出：ImageRecommendation[]
    │
    ▼
[面板显示推荐卡片列表]
    │
    ├──► 记者勾选/取消推荐项
    ├──► 记者修改 prompt（可选）
    └──► 记者调整尺寸（可选）
    │
    ▼
[点击"生成选中配图"]
    │
    ├──► [后端] 调用 Seedream API 批量生成
    │      ├── 每张图：POST /images/generations
    │      ├── 参数：model, prompt, size, output_format="png"
    │      └── 返回：临时图片 URL
    │
    ├──► [后端] 下载每张图片到本地存储
    │      ├── 路径：./uploads/articles/{articleId}/{imageId}.png
    │      └── 创建 ArticleImage 数据库记录
    │
    ▼
[面板显示生成结果 — 图片预览网格]
    │
    ├──► 点击"设为封面" → 更新 Article.coverImage
    ├──► 点击"插入正文" → 选择段落位置 → 插入 <img>
    ├──► 点击"分配平台" → 选择平台 → 更新 PlatformPublish.coverImages
    └──► 点击"删除" → 清理本地文件 + 数据库记录
    │
    ▼
[关闭面板，回到编辑页]
```

### 4.2 子流程：设为封面

```
[图片预览卡片]
    │
    ▼
[点击"设为封面"按钮]
    │
    ├──► 前端 PATCH /articles/{id} { coverImage: imageUrl }
    │
    ├──► 后端更新 Article.coverImage
    │
    ├──► 前端文章元数据区实时更新封面缩略图
    │
    └──► Toast 提示："封面已更新"
```

### 4.3 子流程：插入正文

```
[图片预览卡片]
    │
    ▼
[点击"插入正文"按钮]
    │
    ├──► 弹出段落选择器（显示文章段落列表，第1段/第2段/...）
    │
    ├──► 记者选择插入位置（第 N 段之后）
    │
    ├──► 前端调用 TipTap editor.commands.setImage({ src, alt })
    │      在指定段落之后插入 <img> 节点
    │
    ├──► 更新 ArticleImage.usageType = "INLINE"
    │      更新 ArticleImage.sortOrder = N
    │
    └──► Toast 提示："图片已插入第 N 段之后"
```

### 4.4 子流程：删除配图

```
[图片预览卡片]
    │
    ▼
[点击"删除"按钮]
    │
    ├──► 如果图片已插入正文：
    │      └── 确认弹窗："该图片已插入正文，是否同时移除？"
    │            ├── [是] → 从 content HTML 中移除 <img> 标签
    │            └── [否] → 仅删除记录，保留正文中的 <img>
    │
    ├──► 前端 DELETE /articles/{id}/images/{imageId}
    │
    ├──► 后端：
    │      1. 删除 ArticleImage 数据库记录
    │      2. 删除本地文件 ./uploads/articles/{id}/{imageId}.png
    │      3. 如果 usageType=COVER，清空 Article.coverImage
    │      4. 如果 usageType=PLATFORM_OG，从 PlatformPublish.coverImages 中移除
    │
    └──► 前端移除预览卡片，Toast 提示"已删除"
```

---

## 5. 页面/组件清单

### 5.1 页面级组件

| 组件名 | 文件路径 | 职责 |
|--------|----------|------|
| ImageGenPanel | `frontend/src/components/image-gen-panel.tsx` | AI 配图主面板，承载全部配图流程 |
| ImageGenEmpty | 内嵌于 ImageGenPanel | 空态引导：展示功能说明 + "AI 分析配图"按钮 |
| ImageGenRecommendations | 内嵌于 ImageGenPanel | 推荐列表态：展示推荐卡片 + 勾选/编辑区 |
| ImageGenProgress | 内嵌于 ImageGenPanel | 生成中态：进度条 + 生成日志 |
| ImageGenResults | 内嵌于 ImageGenPanel | 结果态：图片预览网格 + 操作按钮 |
| CoverImageSetting | 集成于文章编辑页 | 封面图设置区：缩略图 + 更换按钮 |
| PlatformCoverCard | 集成于 ChannelPanel | 平台封面图卡片：缩略图 + 生成/更换按钮 |

### 5.2 原子组件

| 组件名 | 复用位置 | 职责 |
|--------|----------|------|
| ImageRecommendationCard | ImageGenRecommendations | 单张推荐卡片：用途标签 + prompt + 尺寸 + 推荐理由 + 勾选框 + 编辑按钮 |
| GeneratedImageCard | ImageGenResults | 单张生成结果卡片：图片预览 + 操作按钮组 |
| ImagePreviewModal | GeneratedImageCard (点击放大) | 图片放大预览模态框 |
| ParagraphSelector | GeneratedImageCard (插入正文时) | 段落选择器：列表展示文章段落，支持选择插入位置 |
| PlatformSelector | GeneratedImageCard (分配平台时) | 平台选择器：展示支持图片的平台列表 |
| PromptEditor | ImageRecommendationCard | Prompt 编辑区：文本输入 + 字数统计 + 提示词建议 |

---

## 6. 状态管理

### 6.1 面板状态机

```
                    ┌─────────────────┐
                    │     EMPTY       │
                    │   (空态引导)     │
                    └────────┬────────┘
                             │ 点击"AI分析配图"
                             ▼
                    ┌─────────────────┐
                    │  ANALYZING      │◄────────┐
                    │  (AI分析中)      │         │
                    └────────┬────────┘         │
                             │ 分析完成          │
                             ▼                  │
                    ┌─────────────────┐         │
              ┌────►│ RECOMMENDATIONS │         │
              │     │  (推荐列表态)    │         │
              │     └────────┬────────┘         │
              │              │ 点击"生成选中"    │
              │              ▼                  │
              │     ┌─────────────────┐         │
              │     │   GENERATING    │         │
              │     │   (生成中)       │         │
              │     └────────┬────────┘         │
              │              │ 生成完成/失败     │
              │              ▼                  │
              │     ┌─────────────────┐         │
              │     │    RESULTS      │─────────┘
              │     │   (结果展示)     │ 点击"重新分析"
              │     └────────┬────────┘
              │              │ 点击"再生成一张"
              └──────────────┘
```

### 6.2 状态定义

```typescript
// ImageGenPanel 内部状态
type PanelState = 'EMPTY' | 'ANALYZING' | 'RECOMMENDATIONS' | 'GENERATING' | 'RESULTS';

// 推荐项状态
type RecommendationItem = {
  id: string;                    // 临时 ID
  purpose: 'cover' | 'inline' | 'platform_og';
  insertAfterParagraph?: number; // 正文插图：插入第几段之后
  platform?: string;             // PLATFORM_OG 时：目标平台
  prompt: string;                // 生成 prompt
  size: string;                  // 推荐尺寸
  reason: string;                // 推荐理由
  selected: boolean;             // 是否被勾选
  editing: boolean;              // 是否处于编辑态
};

// 生成结果状态
type GeneratedImage = {
  id: string;                    // 数据库生成的 UUID
  url: string;                   // 本地存储 URL
  alt: string;                   // 图片描述
  usageType: 'COVER' | 'INLINE' | 'PLATFORM_OG';
  platform?: string;             // 分配的平台
  prompt: string;                // 实际使用的 prompt
  seed?: number;                 // 生成 seed
  status: 'ready' | 'inserted' | 'assigned' | 'cover'; // 当前使用状态
};
```

---

## 7. API 接口规格

### 7.1 AI 分析配图需求

```
POST /articles/:id/ai-image-analysis
```

**请求头**
```
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

**响应 200**
```json
{
  "recommendations": [
    {
      "id": "rec_001",
      "purpose": "cover",
      "prompt": "香港维多利亚港夜景，现代新闻摄影风格，蓝金色调，大气磅礴，适合作为新闻封面",
      "size": "3K",
      "reason": "文章主题为香港经济政策，封面需要体现香港地标和权威感"
    },
    {
      "id": "rec_002",
      "purpose": "inline",
      "insertAfterParagraph": 2,
      "prompt": "香港楼市交易场景，现代简约插画风格，暖色调，体现市民购房情境",
      "size": "2K",
      "reason": "第二段介绍了楼市新政，此处插入配图可增强读者理解"
    },
    {
      "id": "rec_003",
      "purpose": "platform_og",
      "platform": "facebook",
      "prompt": "香港地标建筑剪影，社交媒体风格，1.91:1宽图，适合Facebook分享",
      "size": "2048x1075",
      "reason": "Facebook分享需要横版OG图，突出视觉冲击力"
    }
  ]
}
```

**响应 400** — 文章内容过短无法分析
```json
{ "error": "CONTENT_TOO_SHORT", "message": "文章内容过短，无法分析配图需求" }
```

**响应 422** — AI 分析返回格式异常
```json
{ "error": "ANALYSIS_FORMAT_ERROR", "message": "AI 分析结果格式异常，请重试" }
```

**响应 429** — Kimi API 限流
```json
{ "error": "RATE_LIMITED", "message": "AI 服务繁忙，请 30 秒后重试" }
```

### 7.2 批量生成配图

```
POST /articles/:id/ai-generate-images
```

**请求体**
```json
{
  "recommendations": [
    {
      "purpose": "cover",
      "prompt": "香港维多利亚港夜景...",
      "size": "3K"
    }
  ]
}
```

**响应 200** — 全部成功
```json
{
  "success": true,
  "images": [
    {
      "id": "img_abc123",
      "url": "/uploads/articles/article_001/img_abc123.png",
      "alt": "香港维多利亚港夜景封面图",
      "usageType": "COVER",
      "prompt": "香港维多利亚港夜景...",
      "seed": 42
    }
  ],
  "failed": []
}
```

**响应 200** — 部分成功
```json
{
  "success": false,
  "images": [{ ... }],
  "failed": [
    {
      "index": 1,
      "prompt": "...",
      "error": "SEEDREAM_CONTENT_POLICY",
      "message": "该 prompt 违反内容安全策略，请修改后重试"
    }
  ]
}
```

**响应 400** — 无选中项
```json
{ "error": "NO_SELECTED_IMAGES", "message": "请至少选择一张配图生成" }
```

**响应 402** — 配额不足
```json
{ "error": "QUOTA_EXCEEDED", "message": "今日生图配额已用完" }
```

### 7.3 删除配图

```
DELETE /articles/:id/images/:imageId
```

**查询参数**
```
?removeFromContent=true  // 是否同时从正文 HTML 中移除
```

**响应 204** — 删除成功

**响应 404** — 图片不存在
```json
{ "error": "IMAGE_NOT_FOUND", "message": "图片不存在或已被删除" }
```

**响应 409** — 图片正在被使用（设为封面/分配平台）
```json
{ "error": "IMAGE_IN_USE", "message": "该图片正在作为封面使用，请先更换封面再删除" }
```

### 7.4 获取文章配图列表

```
GET /articles/:id/images
```

**响应 200**
```json
{
  "images": [
    {
      "id": "img_abc123",
      "url": "/uploads/articles/article_001/img_abc123.png",
      "alt": "...",
      "usageType": "COVER",
      "platform": null,
      "prompt": "...",
      "seed": 42,
      "sortOrder": 0,
      "createdAt": "2026-05-23T10:00:00Z"
    }
  ]
}
```

---

## 8. 异常场景与降级策略

### 8.1 Seedream API 不可用

| 场景 | 系统响应 | 用户提示 |
|------|----------|----------|
| API 超时 (>>30s) | 返回部分成功结果，失败的标记为 failed | "部分图片生成超时，已成功的可正常使用，失败的请重试" |
| API 返回 5xx | 全部标记为失败 | "生图服务暂时不可用，请稍后重试" |
| API 返回内容安全违规 | 该图标记为 failed，返回具体原因 | "该描述涉及敏感内容，请修改 prompt 后重试" |
| 配额用尽 (429/402) | 拒绝请求 | "今日生图配额已用完，请联系管理员" |

### 8.2 图片下载失败

**场景**：Seedream 返回了 URL，但下载到本地时网络中断或磁盘满。

**策略**：
1. 下载超时设置为 30 秒，超时后重试 2 次
2. 重试均失败后，标记该图为 failed，返回具体原因
3. 已下载成功的图片正常返回
4. 提示用户："第 N 张图片下载失败，其余图片已生成成功，失败的请重试"

### 8.3 存储空间不足

**场景**：本地磁盘空间不足，无法保存新图片。

**策略**：
1. 生成前检查磁盘空间（保留 1GB 缓冲）
2. 空间不足时拒绝生成请求
3. 提示用户："服务器存储空间不足，请联系管理员清理"
4. 管理员后台增加存储空间告警

### 8.4 文章内容过短

**场景**：文章内容少于 100 字，AI 无法有效分析配图需求。

**策略**：
1. 前端检查：少于 100 字时"AI 分析配图"按钮 disabled，hover 提示"文章内容过短，请先完善内容"
2. 后端二次校验，返回 400 错误

### 8.5 图片 URL 过期

**场景**：Seedream 返回的临时 URL 在下载前已过期（有效期通常为 1 小时）。

**策略**：
1. 收到 URL 后立即下载，不延迟
2. 如果下载返回 404（URL 过期），记录错误并提示重试
3. 前端支持单张重试，无需重新分析

---

## 9. 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| AI 分析配图需求 | ≤ 5 秒 | Kimi API 调用 + 结果解析 |
| 单张图片生成 | ≤ 10 秒 | Seedream API 调用 |
| 批量生成 5 张 | ≤ 30 秒 | 并行/顺序生成总耗时 |
| 图片下载存储 | ≤ 3 秒/张 | 从 Seedream URL 下载到本地 |
| 面板首屏加载 | ≤ 1 秒 | 打开 AI 配图面板 |
| 图片预览加载 | ≤ 2 秒 | 从本地存储加载图片预览 |
| 并发生成限制 | ≤ 3 篇文章同时生成 | 避免 Seedream 限流 |

---

## 10. 数据保留与清理策略

| 数据类型 | 保留策略 | 清理触发 |
|----------|----------|----------|
| 已应用配图（封面/正文/平台） | 永久保留 | 文章删除时级联清理 |
| 未应用配图（生成后未使用） | 保留 30 天 | 定时任务清理，或文章删除时清理 |
| AI 分析推荐记录 | 不保留 | 仅作为临时数据，面板关闭后丢弃 |
| AIOperation 审计日志 | 保留 1 年 | 定时归档 |

---

## 11. 变更日志

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-05-23 | 初版 FSD，覆盖功能概述、用户流程、API 规格、异常场景、性能指标 | 产品技术团队 |
