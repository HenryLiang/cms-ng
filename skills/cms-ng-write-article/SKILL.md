---
name: cms-ng-write-article
description: Drive a 01创作大脑 (CMS-NG) article from a rough idea or trending topic through research, drafting, revision, quality checks, editorial review, and optional explicitly confirmed WordPress publishing via the CMS-NG REST API. Use when the user wants to create, continue, submit, or publish a稿件 inside CMS-NG; do not use for purely offline writing or autonomous or unreviewed publishing.
metadata:
  short-description: CMS-NG 全流程交互式写稿
  version: "1.0.0"
---

# CMS-NG 从 0 到 1 写稿

在 Agent 对话中主持写稿，并用 CMS-NG API 保存真实进度。常规目标是得到一篇用户确认过、已完成基本审校、进入 `PENDING_REVIEW` 的稿件；若用户明确要求发布，则在外部编辑审批完成后恢复流程，生成 WordPress 适配稿并按独立确认保存为草稿或公开发布。不要代替编辑审批。

本目录遵循 Agent Skills 开放格式。把包含当前 `SKILL.md` 的目录视为 Skill 根目录，所有 `scripts/` 和 `references/` 路径都相对该目录解析；不要依赖 Codex、Claude Code 或其他单一客户端的专用命令、绝对安装路径或隐式凭证存储。

## 开始前

1. 在调用 API 前阅读 [references/api.md](references/api.md)。使用随 Skill 提供的 `scripts/cms_api.py`，不要临时重写 HTTP 客户端。
2. `CMS_NG_API_URL` 默认使用生产地址 `https://cms-demo-hk01.com`；认证需要 `CMS_NG_TOKEN` 或 `CMS_NG_TOKEN_FILE`。先调用 `GET /auth/me` 验证连接、身份与权限。
3. 不要让用户把 token 或密码贴进聊天。凭证缺失时，请用户在自己的终端环境中配置；不要把凭证写入 Skill、仓库、日志或稿件内容。
4. API 可能产生计费的 AI 调用。只调用当前阶段需要的能力；不要后台批量生成多个版本、图片或重复调研。

## 选择入口

- **从想法开始**：把用户的零散想法整理成选题简报，再创建 Story。
- **从热点开始**：查询热点源或 AI 选题建议，展示 3–5 个候选；用户选定后导入并采用为 Story，再按已确认简报补齐 Story 的角度与语言。
- **继续已有内容**：按用户给出的 Story/Article ID 读取现状；ID 不明确时列出可访问内容让用户选择，不要猜 ID。

如果用户没有给全信息，只补问会显著改变成稿的内容：核心受众、报道角度、目标长度/体裁、语言、时效与必须使用或避开的来源。已有答案不要重问。默认语言沿用用户或 Story 的 `contentLanguage`，默认文风不用作者 persona。

## 工作流与确认点

### 1. 锁定选题

给出一份很短的选题简报：暂定标题、核心问题、受众、角度、体裁/长度、语言、来源要求。让用户确认或修改后再创建/更新 Story。创建成功后记住 `storyId`。

### 2. 调研

调用 Story 的 research endpoint。将资料包压缩成“关键事实、时间线、人物/机构、数据、争议观点、来源缺口”，明确区分有来源的信息与仍待核实的主张。

若关键事实缺来源、资料为空或 `wikipediaStatus=api_error`，先告知用户并建议调整 Story 的标题/描述/角度后重试；不要把模型生成的资料自动视为已证实事实。用户认可资料方向后再进入初稿。

### 3. 生成并评议初稿

把已确认的资料包原样传给 `POST /stories/:id/draft`；只加入用户已确认的写作要求、语言和作者风格。Research Kit 不会单独保存在 Story 中，因此在创建初稿前保留原始 API 返回，不要从聊天摘要重造 payload。该调用会创建 `WRITING` 状态的 Article，记住返回的 `article.id`。

读取新稿；若 Article 的 `contentLanguage` 与本次确认的语言不一致，立即 PATCH 为确认值。然后给用户：标题、结构摘要、篇幅概览、最需要人工判断的 2–4 个点。不要在聊天中倾倒整段 JSON。让用户选择“按当前方向精修”或指出具体修改。

### 4. 迭代修改

根据用户意图选择最小能力：

- 局部表达：rewrite / expand / condense / polish。
- 整体讨论或改稿方案：ai-chat；它只返回建议。
- 标题、摘要：headlines / excerpt，展示候选并让用户选择。
- 标签：ai-tags 会直接合并并写入，调用前说明这一点。
- SEO / GEO：仅当用户的发布目标需要时调用，不作为默认必经步骤。
- 封面图：仅在用户要配图时调用；它会产生费用并直接更新 `coverImage`。

除 `ai-tags` 和配图外，AI endpoint 通常只返回候选内容，不会保存。展示变更摘要并取得用户接受后，用 `PATCH /articles/:id` 写入最终的 title/subtitle/content/excerpt/tags。每次保存后重新读取 Article，确认版本与字段确实更新。

### 5. 质量门槛

最终稿至少运行 fact-check 和 AI review。将结果作为风险提示，不宣称它等同于人工事实核查：

- 有 `critical` finding、关键来源缺失、明显自相矛盾时，停止送审并逐项处理。
- 其他建议按“必须改 / 建议改 / 可忽略”归纳，让用户决定；接受的修改保存后，再对受影响的关键段落复核。
- 不要为了提高模型分数而静默改变事实、引语、数字或立场。

### 6. 保存与送审

展示最终摘要：标题、Article ID、当前状态、主要来源/未决风险、fact-check 分数、review 分数。只有用户明确确认“提交审核”后，才把状态从 `WRITING` 或 `REVISION` 更新为 `PENDING_REVIEW`。

常规写稿流程在 `PENDING_REVIEW` 结束。不要调用编辑审批、自动发布或删除接口。若用户已要求发布，返回 Article ID 并说明需要等待编辑在 CMS-NG 中完成审批；只有后续读取到 `APPROVED`，才进入下一阶段。

### 7. WordPress 发布（可选且独立确认）

仅在用户明确要求发布到 WordPress 时进入。执行前重新阅读 [references/api.md](references/api.md) 的 WordPress 章节，并按以下顺序操作：

1. 调用 `GET /auth/me`；当前角色必须为 `EDITOR` 或 `ADMIN`。读取最新 Article，状态必须为 `APPROVED`。若仍为 `PENDING_REVIEW`、`IN_REVIEW` 或 `REVISION`，停止并等待外部编辑处理；不要自行审批。若已经是 `PUBLISHED`，先读取渠道记录，避免重复发布。
2. 调用 `POST /channels/:articleId/adapt`，固定传入 `platform: "WORDPRESS"`，生成渠道适配稿。读取渠道记录并确认状态为 `READY`；向用户展示适配标题、摘要、标签、封面和相对主稿的主要变化。若需修改，用明确的 `customPrompt` 重新生成，或先修改主稿再重新适配。
3. 在预览之后取得一次独立发布确认，并明确 WordPress 目标状态。默认建议 `draft`；只有用户清楚确认“立即公开”时才允许 `publish`。请求体必须显式传 `wpStatus`，绝不依赖服务端会默认公开发布的行为。
4. 调用 `POST /channels/:articleId/publish-wordpress` **恰好一次**，不得自动重试。成功后读取渠道记录核对 `publishedUrl`：
   - `wpStatus: "draft"`：说明这是 WordPress 草稿，不要把 CMS Article 改为 `PUBLISHED`。
   - `wpStatus: "publish"`：确认返回公开 URL 后，PATCH Article 状态为 `PUBLISHED`，再读取 Article 与渠道记录验证。若这里只是 Article 状态回写失败，只重试 PATCH，绝不再次调用 WordPress 发布。

CMS-NG 的渠道记录即使对应 WordPress 草稿也可能显示 `PUBLISHED`；对用户汇报时以本次明确发送的 `wpStatus` 为准，不要把草稿误报为公开。发布请求若 timeout 或 5xx，先读取渠道记录；有明确 URL 时据此处理，否则停止并要求用户先到 WordPress 后台确认是否已创建文章，未确认前不得重发。

## 中断、恢复与失败

- 每次写入后保留 `storyId`、`articleId`、状态和版本号，方便同一对话恢复。
- 401：停止并让用户在本地更新凭证；403：说明角色或资源权限不足；404：重新读取列表确认 ID；400：按服务端 message 修正 payload 或合法状态流转。
- 网络超时或 5xx 时先读取 Story/Article 判断调用是否已经落库，再决定是否重试。普通有成本或可能重复创建内容的 POST 最多自动重试一次；WordPress 发布 POST 不得自动重试。
- 结束时返回可继续工作的 Story/Article ID、状态、已完成步骤、未决问题；不要删除半成品。
