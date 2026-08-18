#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod.yml"
BACKEND_ENV="$PROJECT_DIR/backend/.env"

usage() {
  cat <<'EOF'
Usage: ./scripts/docker-prod.sh {up|down|status|logs|migrate|init-admin|config} [service]

  up       Build local images (or pull CMS_NG_*_IMAGE) and start the stack.
           The one-shot migrate service must succeed before backend starts.
  down     Stop the stack. Add Docker Compose flags after the command if needed.
  status   Show container and health status.
  logs     Follow logs; optionally pass a service name.
  migrate  Re-run `prisma migrate deploy` as a disposable container.
  init-admin
           Create or reset the SUPER_ADMIN account after the stack is up.
           Set ADMIN_EMAIL/ADMIN_PASSWORD or enter them at the prompts.
  config   Validate Compose configuration without printing expanded secrets.

Optional profiles:
  COMPOSE_PROFILES=rss            include RSSHub
  COMPOSE_PROFILES=search         include Elasticsearch
  COMPOSE_PROFILES=rss,search     include both
EOF
}

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "Error: missing $1" >&2
    exit 1
  fi
}

preflight() {
  command -v docker >/dev/null 2>&1 || {
    echo "Error: docker is not installed" >&2
    exit 1
  }
  docker compose version >/dev/null
  require_file "$BACKEND_ENV"

  for key in DATABASE_URL JWT_SECRET; do
    if ! grep -qE "^${key}=.+" "$BACKEND_ENV"; then
      echo "Error: $BACKEND_ENV is missing $key" >&2
      exit 1
    fi
  done

  if grep -Eq '^DATABASE_URL=.*@(localhost|127\.0\.0\.1)(:|/)' "$BACKEND_ENV"; then
    echo "Error: DATABASE_URL uses localhost, which points to the backend container." >&2
    echo "       Use a reachable MySQL hostname or host.docker.internal." >&2
    exit 1
  fi
}

compose() {
  docker compose --project-directory "$PROJECT_DIR" -f "$COMPOSE_FILE" "$@"
}

require_admin_value() {
  local variable_name="$1"
  local prompt="$2"
  local secret="${3:-false}"
  local value="${!variable_name:-}"

  if [[ -z "$value" && -t 0 ]]; then
    if [[ "$secret" == "true" ]]; then
      read -r -s -p "$prompt" value
      echo
    else
      read -r -p "$prompt" value
    fi
  fi
  if [[ -z "$value" ]]; then
    echo "Error: $variable_name is required" >&2
    exit 1
  fi
  printf -v "$variable_name" '%s' "$value"
}

cmd="${1:-}"
if [[ -z "$cmd" ]]; then
  usage
  exit 1
fi
shift

case "$cmd" in
  up)
    preflight
    compose config --quiet
    if [[ -n "${CMS_NG_BACKEND_IMAGE:-}" || -n "${CMS_NG_FRONTEND_IMAGE:-}" ]]; then
      if [[ -z "${CMS_NG_BACKEND_IMAGE:-}" || -z "${CMS_NG_FRONTEND_IMAGE:-}" ]]; then
        echo "Error: set both CMS_NG_BACKEND_IMAGE and CMS_NG_FRONTEND_IMAGE" >&2
        exit 1
      fi
      compose pull backend frontend proxy
      # Pulled application images are reused. Optional build-only services
      # such as the Elasticsearch+IK profile may still build on first use.
      compose up -d --remove-orphans "$@"
    else
      compose up -d --build --remove-orphans "$@"
    fi
    compose ps
    ;;
  down)
    preflight
    compose down "$@"
    ;;
  status)
    preflight
    compose ps "$@"
    ;;
  logs)
    preflight
    compose logs -f "$@"
    ;;
  migrate)
    preflight
    compose run --rm migrate
    ;;
  init-admin)
    preflight
    require_admin_value ADMIN_EMAIL "Admin email: "
    require_admin_value ADMIN_PASSWORD "Admin password: " true
    ADMIN_NAME="${ADMIN_NAME:-Super Admin}"
    ADMIN_EMAIL="$ADMIN_EMAIL" \
      ADMIN_PASSWORD="$ADMIN_PASSWORD" \
      ADMIN_NAME="$ADMIN_NAME" \
      compose run --rm --no-deps \
        -e ADMIN_EMAIL -e ADMIN_PASSWORD -e ADMIN_NAME \
        backend node dist/scripts/create-admin.js
    ;;
  config)
    preflight
    compose config --quiet
    echo "Compose configuration is valid."
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
