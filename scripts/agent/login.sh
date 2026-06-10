#!/usr/bin/env bash
# login.sh — log in and persist the access token to .cms-ng-token
#
# Usage:
#   login.sh                         # interactive: prompt for email + password
#   login.sh <email> <password>      # non-interactive (for Agent/automation)
#   login.sh --clear                 # remove .cms-ng-token
#
# Persists to (first writable): ./cms-ng-token, $SCRIPT_DIR/.cms-ng-token, $HOME/.cms-ng-token
# Also writes the API base URL to .cms-ng-api-url so the wrapper finds it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CLEAR=0
EMAIL="${1:-}"
PASS="${2:-}"

if [ "${1:-}" = "--clear" ]; then
  CLEAR=1
fi

write_token() {
  local p
  for p in "./.cms-ng-token" "$SCRIPT_DIR/.cms-ng-token" "$HOME/.cms-ng-token"; do
    local dir
    dir="$(dirname "$p")"
    if [ -w "$dir" ] || mkdir -p "$dir" 2>/dev/null; then
      printf '%s' "$1" > "$p"
      echo "token written to $p" >&2
      return 0
    fi
  done
  echo "ERROR: no writable location for .cms-ng-token" >&2
  exit 1
}

write_api_url() {
  local url="${CMS_NG_API_URL:-http://localhost:3001}"
  local p
  for p in "./.cms-ng-api-url" "$SCRIPT_DIR/.cms-ng-api-url" "$HOME/.cms-ng-api-url"; do
    local dir
    dir="$(dirname "$p")"
    if [ -w "$dir" ] || mkdir -p "$dir" 2>/dev/null; then
      printf '%s' "$url" > "$p"
      return 0
    fi
  done
}

if [ "$CLEAR" -eq 1 ]; then
  rm -f ./.cms-ng-token "$SCRIPT_DIR/.cms-ng-token" "$HOME/.cms-ng-token" 2>/dev/null || true
  echo "token cleared" >&2
  exit 0
fi

if [ -z "$EMAIL" ]; then
  # interactive
  read -r -p "email: " EMAIL
  read -r -s -p "password: " PASS
  echo >&2
fi

API_URL="${CMS_NG_API_URL:-http://localhost:3001}"
write_api_url

RESP=$(curl -sS -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")

TOKEN=$(printf '%s' "$RESP" | jq -r '.accessToken // .token // .access_token // empty')
if [ -z "$TOKEN" ]; then
  echo "login failed: $RESP" >&2
  exit 1
fi

write_token "$TOKEN"
echo "OK — role: $(printf '%s' "$RESP" | jq -r '.user.role')  userId: $(printf '%s' "$RESP" | jq -r '.user.id')" >&2
