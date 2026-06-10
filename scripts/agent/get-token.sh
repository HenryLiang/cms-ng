#!/usr/bin/env bash
# get-token.sh — log in to CMS-NG and persist the access token to multiple locations.
#
# Usage:
#   get-token.sh                              # interactive
#   get-token.sh <email> <password>           # non-interactive
#   get-token.sh --from-stdin                 # read email + password from stdin
#   get-token.sh --keychain-only              # only macOS Keychain, no files
#   get-token.sh --no-keychain                # skip Keychain
#   get-token.sh --print-env                  # also print `export CMS_NG_TOKEN=...` to stdout
#
# Env (Agent mode, fully non-interactive):
#   AGENT_EMAIL      — login email
#   AGENT_PASSWORD   — login password
#   AGENT_API_URL    — optional, overrides CMS_NG_API_URL
# When both AGENT_EMAIL and AGENT_PASSWORD are set, the script runs with zero
# prompts and zero echo — safe for Agent/automation. Pass --no-keychain to
# keep secrets out of the macOS keychain on shared machines.
#
# Persists the token to:
#   1. macOS Keychain:        service="cms-ng-agent-bridge", account="<email>"
#   2. ./.cms-ng-token        (project-local; .gitignored)
#   3. $HOME/.cms-ng-token    (user fallback)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

EMAIL=""
PASS=""
USE_KEYCHAIN=1      # 0=no, 1=yes (default), 2=only keychain
FROM_STDIN=0
PRINT_ENV=0

while [ $# -gt 0 ]; do
  case "$1" in
    --from-stdin)    FROM_STDIN=1; shift ;;
    --no-keychain)   USE_KEYCHAIN=0; shift ;;
    --keychain-only) USE_KEYCHAIN=2; shift ;;
    --print-env)     PRINT_ENV=1; shift ;;
    -h|--help)
      sed -n '3,30p' "$0"; exit 0 ;;
    *)
      if [ -z "$EMAIL" ]; then EMAIL="$1"
      elif [ -z "$PASS" ]; then PASS="$1"
      else echo "unexpected arg: $1" >&2; exit 2
      fi
      shift
      ;;
  esac
done

# Agent mode: pull creds from env if not given as args
if [ -z "$EMAIL" ] && [ -n "${AGENT_EMAIL:-}" ]; then
  EMAIL="$AGENT_EMAIL"
fi
if [ -z "$PASS" ] && [ -n "${AGENT_PASSWORD:-}" ]; then
  PASS="$AGENT_PASSWORD"
fi

API_URL="${AGENT_API_URL:-${CMS_NG_API_URL:-}}"
if [ -z "$API_URL" ]; then
  for p in "./.cms-ng-api-url" "$SCRIPT_DIR/.cms-ng-api-url" "$HOME/.cms-ng-api-url"; do
    [ -f "$p" ] && API_URL="$(cat "$p")" && break
  done
fi
API_URL="${API_URL:-http://localhost:3001}"

if [ "$FROM_STDIN" -eq 1 ]; then
  IFS= read -r EMAIL
  IFS= read -r PASS
fi

# Detect agent mode = env-supplied + no TTY (safe to skip all prompts)
AGENT_MODE=0
if [ -n "${AGENT_EMAIL:-}" ] && [ -n "${AGENT_PASSWORD:-}" ]; then
  AGENT_MODE=1
fi

if [ -z "$EMAIL" ] && [ "$AGENT_MODE" -eq 0 ]; then
  if [ -t 0 ]; then
    read -r -p "email: " EMAIL
  else
    echo "email required (no TTY, no AGENT_EMAIL env)" >&2
    exit 2
  fi
fi
if [ -z "$PASS" ] && [ "$AGENT_MODE" -eq 0 ]; then
  if [ -t 0 ]; then
    read -r -s -p "password: " PASS
    echo >&2
  else
    echo "password required (no TTY, no AGENT_PASSWORD env)" >&2
    exit 2
  fi
fi

if [ -z "$EMAIL" ] || [ -z "$PASS" ]; then
  echo "email and password are required" >&2
  exit 2
fi

RESP=$(curl -sS -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  --max-time 15 \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")

TOKEN=$(printf '%s' "$RESP" | jq -r '.accessToken // .token // .access_token // empty')
if [ -z "$TOKEN" ]; then
  if [ "$AGENT_MODE" -eq 1 ]; then
    echo "login failed for $EMAIL" >&2
  else
    echo "login failed: $RESP" >&2
  fi
  exit 1
fi

USER_ID=$(printf '%s' "$RESP" | jq -r '.user.id // "?"')
USER_ROLE=$(printf '%s' "$RESP" | jq -r '.user.role // "?"')
USER_NAME=$(printf '%s' "$RESP" | jq -r '.user.name // "?"')

# 1. macOS Keychain
if [ "$USE_KEYCHAIN" -eq 1 ] || [ "$USE_KEYCHAIN" -eq 2 ]; then
  if command -v security >/dev/null 2>&1; then
    security delete-generic-password -s "cms-ng-agent-bridge" -a "$EMAIL" 2>/dev/null || true
    if security add-generic-password -s "cms-ng-agent-bridge" -a "$EMAIL" -w "$TOKEN" -U >/dev/null 2>&1; then
      echo "  ✓ keychain: service=cms-ng-agent-bridge  account=$EMAIL" >&2
    else
      echo "  ! keychain: failed (non-fatal)" >&2
    fi
  fi
fi

# 2 & 3. files
if [ "$USE_KEYCHAIN" -ne 2 ]; then
  for p in "./.cms-ng-token" "$HOME/.cms-ng-token"; do
    dir="$(dirname "$p")"
    if [ -w "$dir" ] || mkdir -p "$dir" 2>/dev/null; then
      printf '%s' "$TOKEN" > "$p"
      chmod 600 "$p" 2>/dev/null || true
      echo "  ✓ file: $p (mode 600)" >&2
    fi
  done
fi

# Persist API URL for next time
for p in "./.cms-ng-api-url" "$HOME/.cms-ng-api-url"; do
  dir="$(dirname "$p")"
  if [ -w "$dir" ] || mkdir -p "$dir" 2>/dev/null; then
    printf '%s' "$API_URL" > "$p"
  fi
done

# In agent mode, suppress details; in human mode show them
if [ "$AGENT_MODE" -eq 0 ]; then
  cat <<EOF_OUT >&2

  userId : $USER_ID
  role   : $USER_ROLE
  name   : $USER_NAME
  api    : $API_URL
  ttl    : $(printf '%s' "$RESP" | jq -r '.expiresIn // .expires_in // "(server default)")')

Use it in this shell:
  export CMS_NG_TOKEN='$TOKEN'
  export CMS_NG_API_URL='$API_URL'

Retrieve from keychain later:
  security find-generic-password -s cms-ng-agent-bridge -a "$EMAIL" -w
EOF_OUT
fi

# Optional stdout export
if [ "$PRINT_ENV" -eq 1 ]; then
  printf 'export CMS_NG_TOKEN=%q\nexport CMS_NG_API_URL=%q\n' "$TOKEN" "$API_URL"
fi
