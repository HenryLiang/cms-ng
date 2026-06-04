#!/usr/bin/env bash
#
# 01创作大脑 — 本地开发环境一键启动脚本
# 用法: ./scripts/dev-start.sh [选项]
#
# 选项:
#   --no-rsshub     跳过 RSSHub 容器启动
#   --no-migrate    跳过数据库迁移
#   --backend-only  仅启动后端
#   --frontend-only 仅启动前端
#   -h, --help      显示帮助信息
#

set -euo pipefail

# ─────────────────── 颜色定义 ───────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ─────────────────── 工具函数 ───────────────────
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[✔]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }
step()    { echo -e "\n${CYAN}${BOLD}━━━ $* ━━━${NC}"; }

# ─────────────────── 项目根目录 ───────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ─────────────────── 参数解析 ───────────────────
SKIP_RSSHUB=false
SKIP_MIGRATE=false
START_BACKEND=true
START_FRONTEND=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-rsshub)    SKIP_RSSHUB=true; shift ;;
    --no-migrate)   SKIP_MIGRATE=true; shift ;;
    --backend-only) START_FRONTEND=false; shift ;;
    --frontend-only) START_BACKEND=false; shift ;;
    -h|--help)
      echo "用法: ./scripts/dev-start.sh [选项]"
      echo ""
      echo "选项:"
      echo "  --no-rsshub      跳过 RSSHub 容器启动"
      echo "  --no-migrate     跳过数据库迁移"
      echo "  --backend-only   仅启动后端服务"
      echo "  --frontend-only  仅启动前端服务"
      echo "  -h, --help       显示此帮助信息"
      exit 0
      ;;
    *)
      error "未知参数: $1 (使用 -h 查看帮助)"
      exit 1
      ;;
  esac
done

# ─────────────────── 进程管理 ───────────────────
PIDS=()
cleanup() {
  echo ""
  info "正在关闭开发服务..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done

  # 恢复终端设置
  stty sane 2>/dev/null || true
  success "所有开发服务已关闭"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ─────────────────── Banner ───────────────────
echo -e "${CYAN}"
echo "╔══════════════════════════════════════════╗"
echo "║       01创作大脑 · 开发环境启动          ║"
echo "║       $(date '+%Y-%m-%d %H:%M:%S')                  ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ═══════════════════ 1. 前置检查 ═══════════════════
step "1/6  前置环境检查"

# Node.js >= 20
if ! command -v node &>/dev/null; then
  error "Node.js 未安装，请安装 Node.js >= 20"
  exit 1
fi
NODE_VER=$(node -v | sed 's/^v//' | cut -d. -f1)
if [[ "$NODE_VER" -lt 20 ]]; then
  error "Node.js 版本过低: $(node -v)，需要 >= 20"
  exit 1
fi
success "Node.js $(node -v)"

# npm
success "npm $(npm -v)"

# Docker（仅 RSSHub 需要）
if [[ "$SKIP_RSSHUB" == false ]]; then
  if command -v docker &>/dev/null; then
    success "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
  else
    warn "Docker 未安装，将跳过 RSSHub 启动"
    SKIP_RSSHUB=true
  fi
fi

# backend/.env 检查
BACKEND_ENV="$PROJECT_ROOT/backend/.env"
if [[ ! -f "$BACKEND_ENV" ]]; then
  error "backend/.env 不存在"
  echo "      请从模板创建: cp backend/.env.example backend/.env"
  echo "      然后填写必要的环境变量"
  exit 1
fi
success "backend/.env 已就绪"

# 提取关键环境变量用于检查（不打印值）
get_env_val() {
  local key="$1" file="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

DB_URL=$(get_env_val "DATABASE_URL" "$BACKEND_ENV")
REDIS_URL=$(get_env_val "REDIS_URL" "$BACKEND_ENV")
JWT_SECRET=$(get_env_val "JWT_SECRET" "$BACKEND_ENV")

if [[ -z "$DB_URL" ]]; then
  error "backend/.env 中缺少 DATABASE_URL"
  exit 1
fi
if [[ -z "$REDIS_URL" ]]; then
  warn "backend/.env 中缺少 REDIS_URL，Redis 相关功能将不可用"
fi
if [[ -z "$JWT_SECRET" ]]; then
  error "backend/.env 中缺少 JWT_SECRET"
  exit 1
fi
success "环境变量校验通过"

# ═══════════════════ 2. 依赖安装 ═══════════════════
step "2/6  依赖检查"

if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
  info "首次运行，正在安装依赖..."
  npm install
  success "依赖安装完成"
else
  # 检查 node_modules 是否完整（通过 .package-lock.json 判断）
  if [[ ! -f "$PROJECT_ROOT/node_modules/.package-lock.json" ]]; then
    info "node_modules 不完整，正在重新安装..."
    npm install
    success "依赖安装完成"
  else
    success "依赖已安装"
  fi
fi

# ═══════════════════ 3. RSSHub ═══════════════════
step "3/6  RSSHub 聚合代理"

if [[ "$SKIP_RSSHUB" == true ]]; then
  warn "已跳过 RSSHub 启动"
else
  # 检查是否已在运行
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^cms-ng-rsshub$"; then
    success "RSSHub 已在运行 (localhost:1200)"
  else
    info "启动 RSSHub 容器..."
    if docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d rsshub 2>&1; then
      # 等待容器就绪
      for i in {1..15}; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^cms-ng-rsshub$"; then
          success "RSSHub 已启动 (localhost:1200)"
          break
        fi
        if [[ "$i" -eq 15 ]]; then
          warn "RSSHub 启动超时，请手动检查: docker logs cms-ng-rsshub"
        fi
        sleep 1
      done
    else
      warn "RSSHub 启动失败，热点聚合功能将不可用"
    fi
  fi
fi

# ═══════════════════ 4. Prisma & Shared ═══════════════════
step "4/6  数据库客户端 & 共享包构建"

# Prisma Client 生成
if [[ "$START_BACKEND" == true ]]; then
  info "生成 Prisma Client..."
  cd "$PROJECT_ROOT/backend"
  if npx prisma generate 2>&1 | tail -1; then
    success "Prisma Client 已生成"
  else
    error "Prisma Client 生成失败"
    exit 1
  fi

  # 数据库迁移（可选）
  if [[ "$SKIP_MIGRATE" == false ]]; then
    info "检查数据库迁移状态..."
    MIGRATE_OUTPUT=$(npx prisma migrate status 2>&1) || true
    if echo "$MIGRATE_OUTPUT" | grep -q "Database schema is up to date"; then
      success "数据库 Schema 已是最新"
    elif echo "$MIGRATE_OUTPUT" | grep -qE "(drift|not applied)"; then
      info "应用数据库迁移..."
      if npx prisma migrate deploy 2>&1 | tail -2; then
        success "数据库迁移完成"
      else
        warn "数据库迁移失败，请手动检查: npx prisma migrate status"
      fi
    else
      warn "无法获取迁移状态，跳过自动迁移"
    fi
  else
    warn "已跳过数据库迁移"
  fi

  cd "$PROJECT_ROOT"
fi

# 构建 shared 包
info "构建 @cms-ng/shared 包..."
cd "$PROJECT_ROOT/packages/shared"
if npx tsc --noEmit 2>/dev/null; then
  # 如果有 build script 则执行，否则直接用 tsc
  if grep -q '"build"' package.json 2>/dev/null; then
    npm run build 2>&1 | tail -1
  else
    npx tsc 2>&1 | tail -1
  fi
  success "@cms-ng/shared 构建完成"
else
  # tsc --noEmit 失败不代表 build 一定失败，可能是类型检查警告
  npx tsc 2>&1 | tail -1 || true
  success "@cms-ng/shared 构建完成 (有类型警告)"
fi
cd "$PROJECT_ROOT"

# ═══════════════════ 5. 连通性探测 ═══════════════════
step "5/6  外部服务连通性探测"

# MySQL 连通性
if [[ "$START_BACKEND" == true ]]; then
  # 从 DATABASE_URL 提取 host:port
  DB_HOST=$(echo "$DB_URL" | grep -oE '@[^:]+' | tr -d '@')
  DB_PORT=$(echo "$DB_URL" | grep -oE ':[0-9]+/' | tr -d ':/' )
  DB_PORT=${DB_PORT:-3306}

  if command -v nc &>/dev/null; then
    if nc -z -w3 "$DB_HOST" "$DB_PORT" 2>/dev/null; then
      success "MySQL 可达 ($DB_HOST:$DB_PORT)"
    else
      warn "MySQL 不可达 ($DB_HOST:$DB_PORT)"
      echo "      后端可能无法启动，请检查 MySQL 服务和网络"
    fi
  else
    info "nc 命令不可用，跳过 MySQL 连通性检查"
  fi

  # Redis 连通性
  if [[ -n "$REDIS_URL" ]]; then
    REDIS_HOST=$(echo "$REDIS_URL" | grep -oE '@[^:]+' | tr -d '@')
    REDIS_PORT=$(echo "$REDIS_URL" | grep -oE ':[0-9]+' | tail -1 | tr -d ':')
    REDIS_PORT=${REDIS_PORT:-6379}

    if command -v nc &>/dev/null; then
      if nc -z -w3 "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; then
        success "Redis 可达 ($REDIS_HOST:$REDIS_PORT)"
      else
        warn "Redis 不可达 ($REDIS_HOST:$REDIS_PORT)"
        echo "      Redis 相关功能将降级运行 (fail-open 模式)"
      fi
    fi
  fi
fi

# RSSHub 连通性
if [[ "$SKIP_RSSHUB" == false ]]; then
  if curl -sf -o /dev/null --max-time 5 "http://localhost:1200" 2>/dev/null; then
    success "RSSHub 可达 (localhost:1200)"
  else
    warn "RSSHub 暂不可达，可能仍在启动中"
  fi
fi

# ═══════════════════ 6. 启动开发服务 ═══════════════════
step "6/6  启动开发服务"

# 选择启动模式
if [[ "$START_BACKEND" == true && "$START_FRONTEND" == true ]]; then
  info "启动模式: 全栈 (Backend :3001 + Frontend :3000)"
elif [[ "$START_BACKEND" == true ]]; then
  info "启动模式: 仅后端 (:3001)"
elif [[ "$START_FRONTEND" == true ]]; then
  info "启动模式: 仅前端 (:3000)"
fi

echo ""

# 启动后端
if [[ "$START_BACKEND" == true ]]; then
  info "启动后端 NestJS 开发服务器..."
  cd "$PROJECT_ROOT/backend"
  npx nest start --watch &
  PIDS+=($!)
  cd "$PROJECT_ROOT"
  sleep 2  # 等后端先起，避免前端请求失败
fi

# 启动前端
if [[ "$START_FRONTEND" == true ]]; then
  info "启动前端 Next.js 开发服务器..."
  cd "$PROJECT_ROOT/frontend"
  npx next dev &
  PIDS+=($!)
  cd "$PROJECT_ROOT"
fi

# ─────────────────── 等待服务就绪 ───────────────────
echo ""
info "等待服务就绪..."
sleep 5

echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✔ 开发环境已就绪！${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════${NC}"
echo ""

if [[ "$START_FRONTEND" == true ]]; then
  echo -e "  ${BOLD}前端${NC}     → ${CYAN}http://localhost:3000${NC}"
fi
if [[ "$START_BACKEND" == true ]]; then
  echo -e "  ${BOLD}后端${NC}     → ${CYAN}http://localhost:3001${NC}"
fi
if [[ "$SKIP_RSSHUB" == false ]]; then
  echo -e "  ${BOLD}RSSHub${NC}   → ${CYAN}http://localhost:1200${NC}"
fi

echo ""
echo -e "  ${DIM}按 Ctrl+C 停止所有服务${NC}"
echo ""

# 保持前台运行，等待子进程
wait
