#!/usr/bin/env bash
# install.sh — install the cms-ng-agent-bridge skill into agent runtimes
#
# Targets (default: all):
#   - Codex Desktop            → $CODEX_HOME/skills/cms-ng-agent-bridge/  (default ~/.codex/skills/...)
#   - CodeBuddy/WorkBuddy      → ~/.codebuddy/skills/cms-ng-agent-bridge/
#   - Claude Code (global)     → ~/.claude/skills/cms-ng-agent-bridge/
#   - Claude Code (project)    → <repo>/.claude/skills/cms-ng-agent-bridge/
#
# Env:
#   SKILL_TARGETS=codex,codebuddy,claude,claude-project   # subset (default: all four)
#   CODEX_HOME=/path/to/.codex                            # override Codex home

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

install_one() {
  local target_dir="$1"
  local label="$2"
  mkdir -p "$target_dir"
  cp -f "$SCRIPT_DIR/SKILL.md" "$target_dir/SKILL.md"
  cp -f "$SCRIPT_DIR/cms-ng.sh" "$target_dir/cms-ng.sh" 2>/dev/null || true
  cp -f "$SCRIPT_DIR/login.sh"  "$target_dir/login.sh"  2>/dev/null || true
  cp -f "$SCRIPT_DIR/README.md" "$target_dir/README.md" 2>/dev/null || true
  chmod +x "$target_dir"/*.sh 2>/dev/null || true
  echo "  ✓ $label → $target_dir"
}

echo "Installing cms-ng-agent-bridge skill..."

TARGETS="${SKILL_TARGETS:-codex,codebuddy,claude}"

if [[ ",$TARGETS," == *,codex,* ]]; then
  CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
  install_one "$CODEX_HOME/skills/cms-ng-agent-bridge" "Codex Desktop"
fi

if [[ ",$TARGETS," == *,codebuddy,* ]]; then
  install_one "$HOME/.codebuddy/skills/cms-ng-agent-bridge" "CodeBuddy / WorkBuddy"
fi

if [[ ",$TARGETS," == *,claude,* ]]; then
  install_one "$HOME/.claude/skills/cms-ng-agent-bridge" "Claude Code (global)"
fi

if [[ ",$TARGETS," == *,claude-project,* ]]; then
  install_one "$REPO_ROOT/.claude/skills/cms-ng-agent-bridge" "Claude Code (project)"
fi

cat <<'USAGE'

Done. Next:
  1. Restart the relevant app(s). All four runtimes only scan skills on launch:
     - Codex Desktop:    relaunch
     - WorkBuddy/CodeBuddy: relaunch
     - Claude Code:      restart the CLI session (or run `claude --continue` after exit)
  2. In a new session, ask: "围绕 2026 财政预算案生成 3 个选题,跑完整主链路"
     The skill auto-loads via description matching.
  3. To call the wrapper CLI directly: bash cms-ng.sh METHOD /path [-d json] [-q '.jq']

To uninstall:
  rm -rf ~/.codex/skills/cms-ng-agent-bridge
  rm -rf ~/.codebuddy/skills/cms-ng-agent-bridge
  rm -rf ~/.claude/skills/cms-ng-agent-bridge
  rm -rf <repo>/.claude/skills/cms-ng-agent-bridge
USAGE
