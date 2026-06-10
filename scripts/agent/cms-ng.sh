#!/usr/bin/env bash
# cms-ng.sh — thin wrapper for the CMS-NG HTTP API
# Usage:
#   cms-ng.sh METHOD /path [-d '{"json":"body"}'] [-q '.jq.filter'] [-H 'Header: val'] [--raw]
#
# Reads token + base URL from (in priority order):
#   $CMS_NG_TOKEN  /  $CMS_NG_API_URL
#   .cms-ng-token  /  .cms-ng-api-url  (searched in CWD, then script dir, then $HOME)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

find_local() {
  local name="$1"
  local p
  for p in "./.$name" "$SCRIPT_DIR/.$name" "$HOME/.$name"; do
    [ -f "$p" ] && cat "$p" && return 0
  done
  return 1
}

API_URL="${CMS_NG_API_URL:-}"
if [ -z "$API_URL" ] && API_URL=$(find_local cms-ng-api-url 2>/dev/null); then :; fi
API_URL="${API_URL:-http://localhost:3001}"

TOKEN="${CMS_NG_TOKEN:-}"
if [ -z "$TOKEN" ] && TOKEN=$(find_local cms-ng-token 2>/dev/null); then :; fi

if [ -z "${1:-}" ] || [ -z "${2:-}" ]; then
  echo "Usage: $0 METHOD /path [-d json] [-q jq] [-H header] [--raw] [--no-fail]" >&2
  echo "  API: $API_URL" >&2
  echo "  TOKEN: ${TOKEN:+set}${TOKEN:-MISSING — set CMS_NG_TOKEN or run login.sh}" >&2
  exit 2
fi

METHOD="$1"; shift
PATH_="$1"; shift

BODY=""
JQ=""
RAW=0
NOFAIL=0
EXTRA_HEADERS=()

while [ $# -gt 0 ]; do
  case "$1" in
    -d|--data) BODY="$2"; shift 2 ;;
    -q|--jq)   JQ="$2"; shift 2 ;;
    -H)        EXTRA_HEADERS+=(-H "$2"); shift 2 ;;
    --raw)     RAW=1; shift ;;
    --no-fail) NOFAIL=1; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

CURL_ARGS=(-sS -X "$METHOD" "$API_URL$PATH_" -H "Content-Type: application/json")
if [ -n "$TOKEN" ]; then
  CURL_ARGS+=(-H "Authorization: Bearer $TOKEN")
fi
for h in "${EXTRA_HEADERS[@]:-}"; do
  CURL_ARGS+=(-H "$h")
done
if [ -n "$BODY" ]; then
  CURL_ARGS+=(--data-raw "$BODY")
fi

if [ "$RAW" -eq 1 ]; then
  curl "${CURL_ARGS[@]}"
  exit $?
fi

RESP=$(curl "${CURL_ARGS[@]}" -w '\n__HTTP_STATUS__:%{http_code}')
HTTP_CODE=$(printf '%s' "$RESP" | awk -F: '/^__HTTP_STATUS__:/{print $2}' | tr -d '[:space:]')
BODY_OUT=$(printf '%s' "$RESP" | sed '/^__HTTP_STATUS__:/d')

if [ "$HTTP_CODE" -ge 400 ] 2>/dev/null; then
  echo "$BODY_OUT" >&2
  if [ "$NOFAIL" -eq 0 ]; then
    exit 1
  fi
fi

if [ -n "$JQ" ]; then
  printf '%s' "$BODY_OUT" | jq -r "$JQ"
else
  printf '%s' "$BODY_OUT"
fi

# exit non-zero on HTTP error only if not silenced
if [ "$HTTP_CODE" -ge 400 ] && [ "$NOFAIL" -eq 0 ]; then
  exit 1
fi
