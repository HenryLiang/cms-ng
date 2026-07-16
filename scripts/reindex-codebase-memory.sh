#!/usr/bin/env bash
# scripts/reindex-codebase-memory.sh
#
# 检测 codebase-memory 知识图谱索引是否过期，过期则输出重建指引。
#
# codebase-memory 是 MCP-only 工具（无 CLI），无法在本脚本内直接触发重建。
# 本脚本只做"检测 + 指引"：当 backend/prisma/schema.prisma 或大量源码在
# 上次索引 commit 之后发生变动时，提示通过 Claude Code 的 codebase-memory
# MCP 调用 index_repository 重建。
#
# 用法：./scripts/reindex-codebase-memory.sh
# 退出码：恒为 0（不阻断调用方流程）；需要重建时输出 ⚠️ 与指引。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT="$ROOT/.codebase-memory/artifact.json"

print_rebuild_hint() {
    cat <<EOF

  重建方式（codebase-memory 为 MCP-only，无 CLI）：
    在 Claude Code 中通过 codebase-memory MCP 调用：
      index_repository(repo_path="$ROOT", mode="full", persistence=true)
    或直接对 agent 说："重建 codebase-memory 索引"。

  .codebase-memory/ 为本地状态（已 gitignore，不进版本库），无需提交。
  团队成员各自通过本脚本指引重建本地索引即可。
EOF
}

# 无产物 -> 从未索引
if [[ ! -f "$ARTIFACT" ]]; then
    echo "[reindex] 未找到 .codebase-memory/artifact.json - 项目尚未建立 codebase-memory 索引。"
    echo "          通过 Claude Code 的 codebase-memory MCP 调用 index_repository 建立索引："
    echo "            repo_path=$ROOT  mode=full  persistence=true"
    print_rebuild_hint
    exit 0
fi

# 需要 git
if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "[reindex] 非 git 仓库，跳过过期检测。" >&2
    exit 0
fi

# 从 artifact.json 提取上次索引时的 commit（40 位 hex）
INDEXED_COMMIT=$(grep -oE '"commit"[[:space:]]*:[[:space:]]*"[a-f0-9]{40}"' "$ARTIFACT" \
    | grep -oE '[a-f0-9]{40}' | head -1)

if [[ -z "$INDEXED_COMMIT" ]]; then
    echo "[reindex] artifact.json 无 commit 字段，建议重建索引。" >&2
    print_rebuild_hint
    exit 0
fi

# 索引 commit 不在当前历史中（rebase/reset 后）-> 建议重建
if ! git -C "$ROOT" cat-file -e "${INDEXED_COMMIT}^{commit}" >/dev/null 2>&1; then
    echo "[reindex] ⚠️ 索引 commit ${INDEXED_COMMIT:0:8} 不在当前历史中（可能 rebase/reset），建议重建。"
    print_rebuild_hint
    exit 0
fi

HEAD_COMMIT=$(git -C "$ROOT" rev-parse HEAD)
if [[ "$INDEXED_COMMIT" == "$HEAD_COMMIT" ]]; then
    echo "[reindex] 索引已是最新 (commit ${HEAD_COMMIT:0:8})。"
    exit 0
fi

# 检测 schema 与源码变动规模
SCHEMA_CHANGED=$(git -C "$ROOT" diff --name-only "$INDEXED_COMMIT..HEAD" -- backend/prisma/schema.prisma 2>/dev/null | wc -l | tr -d ' ')
CODE_CHANGED=$(git -C "$ROOT" diff --name-only "$INDEXED_COMMIT..HEAD" -- 'backend/src' 'frontend/src' 'packages/shared/src' 2>/dev/null | wc -l | tr -d ' ')

echo "[reindex] 索引 commit: ${INDEXED_COMMIT:0:8}  当前 HEAD: ${HEAD_COMMIT:0:8}"
echo "[reindex] 自索引以来：schema 变动=${SCHEMA_CHANGED}  源码文件变动=${CODE_CHANGED}"

if [[ "$SCHEMA_CHANGED" -gt 0 ]]; then
    echo "[reindex] ⚠️ schema.prisma 已变动 - 强烈建议重建 codebase-memory 索引（节点/边会因 schema 漂移而失准）。"
    print_rebuild_hint
elif [[ "$CODE_CHANGED" -gt 20 ]]; then
    echo "[reindex] ⚠️ 源码大量变动（${CODE_CHANGED} 个文件）- 建议重建 codebase-memory 索引。"
    print_rebuild_hint
else
    echo "[reindex] 变动量小，无需重建。"
fi

exit 0
