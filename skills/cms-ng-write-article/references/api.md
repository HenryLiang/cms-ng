# CMS-NG 写稿 API 契约

本契约根据 CMS-NG NestJS controller、DTO 与前端 API client 整理。所有路径都相对于 `CMS_NG_API_URL`；默认生产地址为 `https://cms-demo-hk01.com`。除公开认证接口外，请求使用 `Authorization: Bearer <JWT>`。

## 调用工具

```bash
python3 <skill-dir>/scripts/cms_api.py GET /auth/me

python3 <skill-dir>/scripts/cms_api.py POST /stories --json-file - <<'JSON'
{"title":"示例选题","description":"背景","angle":"报道角度","contentLanguage":"SIMPLIFIED_CHINESE"}
JSON
```

环境变量：

- `CMS_NG_API_URL`：API 根地址；未设置时使用 `https://cms-demo-hk01.com`。
- `CMS_NG_TOKEN`：JWT。可带或不带 `Bearer ` 前缀。
- `CMS_NG_TOKEN_FILE`：包含 JWT 的本地文件；仅在 `CMS_NG_TOKEN` 未设置时读取。

客户端仅接受相对路径，不接受完整 URL，也不跟随 HTTP redirect，避免把 Bearer token 带到错误主机。默认超时 180 秒，可用 `--timeout` 调整。查询参数用重复的 `--query key=value` 传入。

## 认证与发现

| 目的 | 调用 | 关键返回 |
|---|---|---|
| 验证会话 | `GET /auth/me` | `id`, `name`, `role`, `preferredLanguage` |
| 作者风格 | `GET /authors` | `authors[].slug/name`, `source` |
| AI 选题建议 | `POST /trending-topics/suggestions`，body `{}` | `{title, description, suggestedAngle, reason}[]` |
| 热点源清单 | `GET /trending-topics/sources` | `{success, data: SourceDefinition[]}` |
| 热点候选 | `GET /trending-topics/sources/:sourceId/items` | 查询 `page`, `limit` 及源定义要求的参数；返回 `{success, data}` |

认证 token 从 `POST /auth/login` 获得，但 Agent 不应收集或传递用户密码。让用户在本地已有登录流程中准备 token。

## 选题与 Story

### 从手工想法创建

`POST /stories`

```json
{
  "title": "必填",
  "description": "可选背景",
  "angle": "可选角度",
  "priority": 0,
  "tags": ["可选"],
  "deadline": "可选 ISO 8601",
  "contentLanguage": "SIMPLIFIED_CHINESE"
}
```

`contentLanguage` 可选值：`SIMPLIFIED_CHINESE`、`TRADITIONAL_CHINESE_HK`、`TRADITIONAL_CHINESE_CANTONESE`、`ENGLISH`。省略时服务端使用用户偏好，最后回退为香港繁体中文。

读取/更新：`GET /stories/:id`、`PATCH /stories/:id`。列出可访问 Story：`GET /stories`，返回 `{data, meta}`。

### 从热点创建

1. `POST /trending-topics/import`：body 支持 `title`, `description`, `source`, `heatScore`, `tags`，返回 Topic。
2. 用户确认采用后调用 `POST /trending-topics/:topicId/adopt`，body `{}`，返回 `{storyId, topicId}`。
3. 采用热点创建的 Story 不携带本次对话选择的语言；读取 Story 后，用 `PATCH /stories/:storyId` 补齐确认过的 `angle`、`contentLanguage` 等简报字段。

已进入 curated topic 列表的候选可直接 `POST /trending-topics/:topicId/adopt`。不要重复采用 `ADOPTED` Topic。

## 调研与初稿

### Research Kit

`POST /stories/:storyId/research --query language=<ContentLanguage>`，body `{}`。

返回：

```json
{
  "timeline": [{"date":"...","event":"...","source":"..."}],
  "people": [{"name":"...","role":"...","background":"..."}],
  "data": [{"label":"...","value":"...","source":"..."}],
  "opinions": [{"source":"...","viewpoint":"...","stance":"..."}],
  "relatedArticles": ["..."],
  "wikipedia": [{"title":"...","extract":"...","url":"...","language":"zh"}],
  "wikipediaStatus": "ok"
}
```

`wikipediaStatus` 为 `ok | no_results | api_error`。其他数组也可能为空；不得自行补成已核实事实。

Research Kit 响应不会单独持久化到 Story。生成初稿前应保留原始 JSON；中断后无法恢复原响应时重新调研，不要凭摘要伪造完整 payload。

### 根据资料包生成并保存初稿

`POST /stories/:storyId/draft`

```json
{
  "researchKit": {"timeline":[],"people":[],"data":[],"opinions":[]},
  "instruction": "可选且已经用户确认的要求",
  "language": "SIMPLIFIED_CHINESE",
  "authorSlug": "可选，来自 GET /authors"
}
```

返回 `{article: Article}`。此调用会创建 Article，状态为 `WRITING`，并把 Story 状态更新为 `WRITING`。当前服务端创建 Article 时没有把请求里的 `language` 显式传给 Article；调用后应读取 Article，并在 `contentLanguage` 与确认语言不一致时 PATCH 修正。

## Article 读取、保存与状态

- `GET /articles/:id`：读取 Article、关系与版本。
- `GET /articles?storyId=:storyId`：返回 `{data, meta}`。
- `PATCH /articles/:id`：可更新 `title`, `subtitle`, `content`, `excerpt`, `tags`, `contentLanguage`, `coverImage`, `status`。内容或标题变化会保存版本快照。
- `GET /articles/:id/versions`：历史版本。
- `POST /articles/:id/rollback/:version`：破坏当前内容，除非用户明确要求回滚，否则不要调用。

人工协作主链路的合法状态：

```text
DRAFT -> WRITING -> AI_OPTIMIZING -> PENDING_REVIEW -> IN_REVIEW -> APPROVED -> PUBLISHED -> ARCHIVED
             |---------------------> PENDING_REVIEW
REVISION -> WRITING 或 PENDING_REVIEW
```

同状态更新允许。Skill 的写稿阶段只使用 `WRITING`、`REVISION`、`PENDING_REVIEW`；不要代替编辑审批。WordPress 公开发布成功后可把已经 `APPROVED` 的 Article 更新为 `PUBLISHED`。

## Article AI 操作

以下请求均为 `POST /articles/:id/<operation>`：

| operation | body | 返回 | 是否自动写 Article |
|---|---|---|---|
| `ai-rewrite` | `{text, instruction?, style?, language?, authorSlug?}` | `{result}` | 否 |
| `ai-expand` | `{text, instruction?, language?, authorSlug?}` | `{result}` | 否 |
| `ai-condense` | `{text, maxLength?, language?,authorSlug?}` | `{result}` | 否 |
| `ai-polish` | `{text, language?, authorSlug?}` | `{result}` | 否 |
| `ai-headlines` | `{count?, language?, authorSlug?}` | `{headlines:[{title,style,reasoning}]}` | 否 |
| `ai-excerpt` | `{maxLength?, language?, authorSlug?}` | `{excerpt}` | 否 |
| `ai-chat` | `{messages:[{role,content}], language?, authorSlug?}` | `{reply}` | 否 |
| `ai-draft` | `{instruction?, language?, authorSlug?}` | `{title,subtitle?,content,tags}` | 否 |
| `ai-tags` | `{title?, content?, tags?, language?}` | 更新后的 Article | **是，合并 tags** |
| `ai-fact-check` | `{language?}` | `{score,summary,findings[]}` | 否 |
| `ai-review` | `{language?}` | `{overallScore,summary,dimensions[],suggestions[]}` | 否 |
| `ai-seo` | `{language?}` | SEO 报告与候选标题/摘要 | 否 |
| `ai-geo` | `{language?}` | GEO 报告与结构化建议 | 否 |
| `ai-generate-image` | `{style?,aspectRatio?,size?,customPrompt?}` | `{url,prompt}` | **是，更新 coverImage** |

rewrite 的 `style` 可选 `serious | casual | academic | concise`；配图 `style` 可选 `news | illustration | photo | social`，`size` 可选 `2K | 3K | 4K`。

AI 结果落库时，先读取最新 Article；把用户接受的结果合并进最新版本，再 PATCH，避免覆盖并发人工修改。

## WordPress 渠道适配与发布

WordPress 是审批后的独立阶段。当前 channels controller 只校验资源访问权，没有替 Skill 强制审批状态或发布角色，因此 Agent 必须自行执行以下前置检查：

- `GET /auth/me` 返回的 `role` 必须为 `EDITOR` 或 `ADMIN`。
- `GET /articles/:articleId` 的 `status` 必须严格等于 `APPROVED`。
- 不调用任何审批接口把稿件推进到 `APPROVED`；状态不满足时停止。
- 已存在 WordPress `publishedUrl` 或 Article 已为 `PUBLISHED` 时，先向用户报告并避免重复发布。

服务端还需要由管理员配置 `WORDPRESS_SITE_URL`、`WORDPRESS_USERNAME`、`WORDPRESS_APP_PASSWORD`。这些是 CMS-NG 后端配置，不要在 Agent 对话中索取或写入仓库。

### 生成适配稿

`POST /channels/:articleId/adapt`

```json
{
  "platform": "WORDPRESS",
  "customPrompt": "可选：用户确认过的适配要求"
}
```

调用可能产生 AI 费用。返回或随后通过 `GET /channels/:articleId/publishes` 读取 WordPress 渠道记录，重点检查 `id`, `platform`, `status`, `adaptedTitle`, `adaptedContent`, `adaptedExcerpt`, `adaptedTags`, `publishedUrl`, `notes`。常见状态为 `GENERATING | READY | PUBLISHED | FAILED`。服务端允许 `READY` 或 `PUBLISHED` 进入发布请求，但 Skill 只应在记录为 `READY` 且没有 `publishedUrl` 时执行首次发布；已有发布结果时停止并避免重复创建。

`PATCH /channels/:articleId/publishes/:publishId` 只能更新渠道状态、URL 和 notes，不能修改 `adaptedTitle` 或 `adaptedContent`。用户不接受适配稿时，带精确 `customPrompt` 重新调用 adapt，或修改主 Article 后重新适配；不要假装 PATCH 已保存正文修改。

### 创建 WordPress 草稿或公开文章

`POST /channels/:articleId/publish-wordpress`

```json
{"wpStatus":"draft"}
```

`wpStatus` 只允许 `draft | publish`。**必须显式发送**；省略时 controller 会默认 `publish`。在展示适配稿并取得独立确认之后调用：默认建议 `draft`，只有用户明确确认立即公开时才发送 `publish`。

服务端会使用适配稿，处理正文图片与封面，调用 WordPress REST API，并回写渠道记录的 `publishedUrl`, `publishedAt` 和 WordPress post metadata。需要特别注意：服务端在 `wpStatus: "draft"` 时也会把 CMS-NG 渠道记录标成 `PUBLISHED`，所以 Agent 必须保留本次请求的 `wpStatus`，并把它准确表述为“WordPress 草稿”，不能仅凭渠道状态宣称已公开。

成功后的 CMS Article 处理：

- WordPress 草稿：Article 保持 `APPROVED`。
- WordPress 公开文章：确认 `publishedUrl` 后调用 `PATCH /articles/:articleId`，body `{"status":"PUBLISHED"}`，再 GET Article 与渠道记录验证。
- WordPress 已成功而 Article 状态回写失败：报告部分成功，只重试 Article PATCH，绝不重新发布。

发布请求不得自动重试。遇到 timeout 或 5xx 时，先 `GET /channels/:articleId/publishes`：若出现明确 URL，按保存时使用的 `wpStatus` 继续收尾；若没有确定结果，停止并要求用户在 WordPress 后台确认没有重复文章。只有用户确认 WordPress 未创建文章后，才能重新发起一次新的发布请求。

## 错误处理

- `400`：读取响应 `message`；常见为 DTO 字段错误或非法状态跳转。
- `401`：token 缺失/过期；停止调用，不在聊天索取 token。
- `403`：当前角色或资源归属无权操作。
- `404`：资源 ID 不存在；先列出可访问资源确认。
- `429`：限流；等待用户决定是否稍后再试，不要快速循环。
- `5xx` / timeout：对可能落库的 POST 先 GET 检查结果；避免重复 Story/Article 或重复计费。WordPress 发布请求遵循上面的零自动重试规则。

开发环境可在 `/api-docs` 查看 Swagger。若服务端契约与本文冲突，以实际 Swagger/controller 为准并报告 Skill 需要更新；不要猜测未知字段。
