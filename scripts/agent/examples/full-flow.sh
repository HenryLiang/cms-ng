#!/usr/bin/env bash
# full-flow.sh — end-to-end main flow smoke test
# Requires: .cms-ng-token + .cms-ng-api-url (run login.sh first)
#          (or env CMS_NG_TOKEN + CMS_NG_API_URL)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="$SCRIPT_DIR/../cms-ng.sh"
[ -x "$CLI" ] || { echo "wrapper not found: $CLI" >&2; exit 1; }

API="${CMS_NG_API_URL:-http://localhost:3001}"
H="Authorization: Bearer ${CMS_NG_TOKEN:?CMS_NG_TOKEN not set — run login.sh}"

echo "== 1. Create a story"
STORY=$(curl -sf -X POST "$API/stories" -H "$H" -H "Content-Type: application/json" \
  -d '{
    "title":"[Agent] 端到端冒烟测试选题",
    "description":"由 scripts/agent/examples/full-flow.sh 创建",
    "priority":2,
    "tags":["test","agent"],
    "contentLanguage":"TRADITIONAL_CHINESE_HK"
  }')
STORY_ID=$(echo "$STORY" | jq -r '.id')
echo "  story_id=$STORY_ID"

echo "== 2. Assign editor (self) to the story"
ME_ID=$(curl -sf "$API/auth/me" -H "$H" | jq -r '.id')
curl -sf -X PATCH "$API/stories/$STORY_ID/assign-editor" -H "$H" -H "Content-Type: application/json" \
  -d "{\"editorId\":\"$ME_ID\"}" | jq '{id, reporterId, editorId}'

echo "== 3. Create an article (DRAFT)"
ART=$(curl -sf -X POST "$API/articles" -H "$H" -H "Content-Type: application/json" \
  -d "{
    \"storyId\":\"$STORY_ID\",
    \"title\":\"端到端冒烟初稿\",
    \"content\":\"<p>这是 Agent 自动创建的冒烟测试稿件。</p>\",
    \"tags\":[\"test\",\"agent\"],
    \"contentLanguage\":\"TRADITIONAL_CHINESE_HK\"
  }")
ARTICLE_ID=$(echo "$ART" | jq -r '.id')
echo "  article_id=$ARTICLE_ID  status=$(echo "$ART" | jq -r '.status')"

echo "== 4. AI polish (consumes tokens; only runs if a provider key is set)"
if [ -n "${DEEPSEEK_API_KEY:-${KIMI_API_KEY:-${OPENAI_API_KEY:-}}}" ]; then
  CUR=$(curl -sf "$API/articles/$ARTICLE_ID" -H "$H" | jq -r '.content')
  curl -sf -X POST "$API/articles/$ARTICLE_ID/ai-polish" -H "$H" -H "Content-Type: application/json" \
    -d "{\"text\":\"$CUR\",\"language\":\"TRADITIONAL_CHINESE_HK\"}" \
    | jq '{result: (.result // .data.result)}'
else
  echo "  (skipped: no AI provider key in env)"
fi

echo "== 5. Submit for review"
curl -sf -X PATCH "$API/articles/$ARTICLE_ID" -H "$H" -H "Content-Type: application/json" \
  -d '{"status":"PENDING_REVIEW"}' | jq '{id, status, version}'

echo "== 6. Review queue + approve"
curl -sf "$API/articles/review-queue" -H "$H" | jq '.[] | {id, status, title}'
curl -sf -X PATCH "$API/articles/$ARTICLE_ID/review" -H "$H" -H "Content-Type: application/json" \
  -d '{"decision":"APPROVE","comment":"smoke test approve"}' | jq '{id, status}'

echo "== 7. Channel adapt (Website + Xiaohongshu)"
for P in WEBSITE XIAOHONGSHU; do
  curl -sf -X POST "$API/channels/$ARTICLE_ID/adapt" -H "$H" -H "Content-Type: application/json" \
    -d "{\"platform\":\"$P\"}" | jq '{platform, status}'
done

echo "== 8. Cleanup (delete the smoke-test article + story)"
curl -sf -X DELETE "$API/articles/$ARTICLE_ID" -H "$H" | jq
curl -sf -X DELETE "$API/stories/$STORY_ID" -H "$H" | jq

echo "== Done.  story=$STORY_ID  article=$ARTICLE_ID"
