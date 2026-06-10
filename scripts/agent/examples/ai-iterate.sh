#!/usr/bin/env bash
# ai-iterate.sh — fetch article content, polish it, write back, print size diff
# Usage: ai-iterate.sh <articleId> [iterations]
# Requires: .cms-ng-token + .cms-ng-api-url

set -euo pipefail

AID="${1:?usage: $0 <articleId> [iterations]}"
N="${2:-1}"
API="${CMS_NG_API_URL:-http://localhost:3001}"
H="Authorization: Bearer ${CMS_NG_TOKEN:?CMS_NG_TOKEN not set}"

for i in $(seq 1 "$N"); do
  echo "== iter $i"
  CUR=$(curl -sf "$API/articles/$AID" -H "$H" | jq -r '.content')
  NEW=$(curl -sf -X POST "$API/articles/$AID/ai-polish" -H "$H" -H "Content-Type: application/json" \
    -d "{\"text\":\"$CUR\",\"language\":\"TRADITIONAL_CHINESE_HK\"}" | jq -r '.result')
  echo "before: ${#CUR} chars"
  echo "after:  ${#NEW} chars"
  curl -sf -X PATCH "$API/articles/$AID" -H "$H" -H "Content-Type: application/json" \
    -d "{\"content\":\"$NEW\"}" | jq '{id, version, status}'
done
