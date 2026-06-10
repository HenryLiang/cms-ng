# scripts/agent — Agent bridge for CMS-NG

This directory turns Codex (or any shell-capable Agent) into a first-class operator of the CMS-NG main flow: **story → article → AI collab → review → multi-platform publish**.

It does **not** introduce a new server, a new CLI binary, or a new workspace. It is a thin shell wrapper around the existing NestJS HTTP API plus a Skill document.

## Layout

```
scripts/agent/
├── SKILL.md                # Agent-facing API manual (read this first)
├── cms-ng.sh               # Universal HTTP wrapper
├── login.sh                # Non-interactive login → writes .cms-ng-token
├── install.sh              # Install SKILL.md into $CODEX_HOME/skills/
├── README.md               # This file
└── examples/
    ├── full-flow.sh        # End-to-end main flow smoke test
    └── ai-iterate.sh       # AI polish iteration example
```

## 30-second quickstart

```bash
# 1. Log in once (writes token + API URL to .cms-ng-token / .cms-ng-api-url)
bash scripts/agent/login.sh reporter@hk01.com 'reporter-password'

# 2. Hit the API
bash scripts/agent/cms-ng.sh GET /auth/me
bash scripts/agent/cms-ng.sh GET /stories -q '.[] | {id, title, status}'

# 3. Run end-to-end demo
bash scripts/agent/examples/full-flow.sh
```

## Install the Skill for Codex

```bash
bash scripts/agent/install.sh
# Now in any Codex session: apply_skill cms-ng-agent-bridge
```

## Why this approach (vs. a CLI binary / a new workspace)?

- Zero new backend code, zero new dependencies, zero new build pipeline.
- The CMS-NG HTTP API + `@cms-ng/shared` enums already encode every business rule; the wrapper just exposes them to non-browser callers.
- Agent reads the SKILL.md to know which endpoint does what, and calls `cms-ng.sh` to actually make the call. No process spawn, no stdout parsing weirdness.
- If/when the project later wants a typed SDK, the natural step is `@nestjs/swagger` + a generated client. SKILL.md is a strictly smaller commitment.

## Required environment

| Var | Default | Notes |
|-----|---------|-------|
| `CMS_NG_API_URL` | `http://localhost:3001` | Backend base URL |
| `CMS_NG_TOKEN` | — | Bearer token; usually auto-loaded from `.cms-ng-token` |

If neither the env var nor the local file is set, `cms-ng.sh` exits with code 2 (usage) so failures are obvious.

## Exit codes from `cms-ng.sh`

| Code | Meaning |
|------|---------|
| 0 | 2xx response |
| 1 | 4xx/5xx response (or curl error) — body printed to stderr |
| 2 | Bad usage (missing args) |

## See also

- `SKILL.md` in this directory — the full agent-facing API manual with state machine, examples, and failure modes.
- `AGENTS.md` at the repo root — overall project conventions.

## 在 Codex Desktop / WorkBuddy / CodeBuddy 里使用

`install.sh` 同时装到两个目标:

| 运行时 | 目录 | 备注 |
|--------|------|------|
| **Codex Desktop** | `~/.codex/skills/cms-ng-agent-bridge/` | 默认 `CODEX_HOME=~/.codex` |
| **WorkBuddy / CodeBuddy** | `~/.codebuddy/skills/cms-ng-agent-bridge/` | CodeBuddy 与 WorkBuddy 共享此目录(`WorkBuddy.app` 是 CodeBuddy 的另一品牌包) |

```bash
# 默认:两边都装
bash scripts/agent/install.sh

# 只装一边
SKILL_TARGETS=codex     bash scripts/agent/install.sh
SKILL_TARGETS=codebuddy bash scripts/agent/install.sh
```

**装完后必须重启 App** —— Electron 桌面端只在启动时扫描 skill 目录。

启动后,直接说人话,Agent 会通过 SKILL.md 的 `description` 字段自动匹配加载:

> "围绕 2026 财政预算案生成 3 个选题,挑一个跑完整主链路"
> "把这篇稿子润色到港媒风格,生成 WordPress + 小红书的适配版本"
> "看看 AutoPublish 任务列表,跑一下那个财经号"

如果需要显式加载,在 WorkBuddy / Codex 对话框里用 `apply_skill cms-ng-agent-bridge`(Codex 语法)或在 Skills 面板里点启用。

### 先决条件(给 Agent 用前你得准备好)

1. **后端在跑**:`npm run dev` 或 `cd backend && npm run start:dev`,确认 `http://localhost:3001/auth/login` 通
2. **登录拿 token**(Agent 自己执行一次即可):
   ```bash
   bash scripts/agent/login.sh your-account@hk01.com 'your-password'
   # 写入 .cms-ng-token(在 CWD、脚本目录、$HOME 中第一个可写位置)
   ```
3. **(可选)AI key 配在 backend 的 `.env`**:有 `DEEPSEEK_API_KEY` / `KIMI_API_KEY` / `OPENAI_API_KEY` 任一时,`full-flow.sh` 才会真跑 AI polish;否则跳过该步

## 在 Claude Code 里使用

`install.sh` 现在会同时装到 Claude Code 的两个目标(默认是全局):

| 目标 | 目录 | 适用 |
|------|------|------|
| **Claude Code 全局** | `~/.claude/skills/cms-ng-agent-bridge/` | 你的所有项目都能用 |
| **Claude Code 项目级** | `<repo>/.claude/skills/cms-ng-agent-bridge/` | 只在这项目生效(默认不装) |

```bash
# 默认:Codex + CodeBuddy + Claude Code 全局
bash scripts/agent/install.sh

# 选择子集
SKILL_TARGETS=claude                 bash scripts/agent/install.sh   # 只装 Claude Code
SKILL_TARGETS=claude,claude-project  bash scripts/agent/install.sh   # 全局 + 项目级
SKILL_TARGETS=claude-project         bash scripts/agent/install.sh   # 只装项目级
```

**装完后必须重启 Claude Code** —— skill 在启动时扫描。

启动后,在新会话里直接说人话(Claude Code 会通过 SKILL.md 的 `description:` 字段自动匹配):

> "围绕 2026 财政预算案生成 3 个选题,挑一个跑完整主链路"
> "把这篇稿子润色到港媒风格,生成 WordPress + 小红书的适配版本"
> "看看 AutoPublish 任务列表,跑一下那个财经号"

如果自动匹配没触发,可显式 `/cms-ng-agent-bridge`(Claude Code slash command 语法)或在 `.claude/settings.json` 里 `enableAllProjectSkills: true` 强制启用。

### 临时最简用法(不安装,直接读)

```bash
claude
# 在对话框里:
"读 /Users/liangchao/claudeCodeSpaces/newcms/scripts/agent/SKILL.md,按里面的端点列表和状态机跑主链路"
```

Claude Code 会把整个 SKILL.md 读进上下文,按指令执行。每次会话都要说一次,**适合临时**。
