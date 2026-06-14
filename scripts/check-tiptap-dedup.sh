#!/usr/bin/env bash
# check-tiptap-dedup.sh — verify only 1 copy of @tiptap/core is installed.
#
# Why: npm workspaces + caret version drift can install multiple copies
# of @tiptap/core into nested node_modules. tsc then sees incompatible
# types and fails with TS2769 (17 errors in rich-text-editor.tsx).
#
# This script runs `npm ls @tiptap/core --all` and checks that every
# instance is marked "deduped" — i.e. resolved to a single copy.
#
# Exit: 0 = clean (1 copy), 1 = split (multiple copies or error).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

OUTPUT=$(npm ls @tiptap/core --all 2>&1) || {
  echo "❌ tiptap dedup check FAILED: npm ls error"
  echo "$OUTPUT"
  exit 1
}

# Count non-deduped @tiptap/core entries.
# A clean tree has exactly 1 non-deduped entry (the root copy).
# Every child should show "deduped".
DUPLICATES=$(echo "$OUTPUT" | grep -c '@tiptap/core@' || true)

if [ "$DUPLICATES" -eq 0 ]; then
  echo "❌ tiptap dedup check FAILED: @tiptap/core not found in tree"
  exit 1
fi

# Count lines with a version number AND NOT followed by "deduped" on the same line.
# A non-deduped line looks like: └── @tiptap/core@3.26.1
# A deduped line looks like:     └── @tiptap/core@3.26.1 deduped
NON_DEDUPED=$(echo "$OUTPUT" | grep -E '@tiptap/core@[0-9]' | grep -cv 'deduped' || true)

if [ "$NON_DEDUPED" -gt 1 ]; then
  echo "❌ tiptap dedup check FAILED: $NON_DEDUPED copies of @tiptap/core (expected 1)"
  echo "$OUTPUT"
  exit 1
fi

echo "✅ tiptap dedup check PASSED: 1 copy of @tiptap/core ($DUPLICATES total entries, all deduped)"
