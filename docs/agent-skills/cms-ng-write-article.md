# CMS-NG 写稿 Skill 的跨 Agent 分发

项目中的标准源码只有一份：`skills/cms-ng-write-article/`。该目录遵循 [Agent Skills 开放规范](https://agentskills.io/specification)，根目录包含 `SKILL.md`，并按需附带 `scripts/`、`references/` 和产品可选元数据。

## 项目内入口

```text
skills/cms-ng-write-article/                 标准源码
.agents/skills/cms-ng-write-article          Codex 入口（相对符号链接）
.claude/skills/cms-ng-write-article          Claude Code 入口（相对符号链接）
skill-packages/cms-ng-write-article.zip       通用导入包
```

Codex 和 Claude Code 都读取同一份源码，修改 Skill 时不要复制文件到兼容目录。Claude Code 支持项目级 `.claude/skills/<name>/SKILL.md`，也支持技能目录使用符号链接；参见 [Claude Code Skills](https://code.claude.com/docs/en/slash-commands)。

## 生成导入包

从项目根目录执行：

```bash
python3 scripts/package-agent-skill.py \
  skills/cms-ng-write-article \
  skill-packages/cms-ng-write-article.zip
```

压缩包解压后只有一个 `cms-ng-write-article/` 根目录，里面的 `SKILL.md` 名称与目录名一致。打包脚本会排除缓存文件并拒绝常见凭证文件；token、密码和 `.env` 永远不进入压缩包。

## 导入方式

- **Codex**：项目入口已经位于 `.agents/skills/`，在本仓库中可自动发现。
- **Claude Code**：项目入口已经位于 `.claude/skills/`；也可把标准目录复制到 `~/.claude/skills/` 作为个人 Skill。
- **WorkBuddy**：在 Skill 管理中选择“导入本地技能包”，上传 `skill-packages/cms-ng-write-article.zip`。WorkBuddy 企业版的本地技能包入口见[官方技能文档](https://cloud.tencent.com.cn/document/product/1831/134432)。
- **豆包/火山引擎 AgentKit**：在 Skills 中心上传同一 ZIP。AgentKit 要求解压后只有一个与 Skill 同名的根目录，并在根目录放置 `SKILL.md`；参见[官方更新 Skill 文档](https://www.volcengine.com/docs/86681/2205064)。普通豆包客户端若没有 Skills 导入入口，需要使用支持自定义 Skill 的 AgentKit 产品形态。
- **其他兼容 Agent**：优先导入 ZIP；若客户端只接受目录，则导入或复制 `skills/cms-ng-write-article/` 整个目录，不要只复制 `SKILL.md`，否则会丢失 API 客户端和接口参考。

## 运行配置

目标 Agent 需要 Python 3、访问 CMS-NG 域名的网络权限，以及以下环境变量之一：

```bash
export CMS_NG_API_URL="https://cms-demo-hk01.com"
export CMS_NG_TOKEN="<JWT>"
```

也可以用 `CMS_NG_TOKEN_FILE` 指向仅包含 JWT 的本地文件。不要把真实 token 写进 Skill、ZIP、Git 或聊天内容。
