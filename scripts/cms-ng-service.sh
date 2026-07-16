#!/bin/bash
set -e

# ============================================================
# CMS-NG 服务管理脚本
# 用法:
#   ./scripts/cms-ng-service.sh start  [--prod] [--no-build]
#   ./scripts/cms-ng-service.sh stop   [--prod]
#   ./scripts/cms-ng-service.sh restart [--prod] [--no-build]
#   ./scripts/cms-ng-service.sh status [--prod]
#   ./scripts/cms-ng-service.sh logs   [--prod] [backend|frontend|rsshub]
#
# 模式:
#   (默认)  开发模式 (npm run dev, turbo)
#   --prod   生产模式 (宿主机进程: nginx 反代 + node/next 后台进程 + rsshub 容器)
#
# 生产模式选项:
#   --no-build  跳过构建 (仅启动已有产物，用于快速重启非代码变更的场景)
#
# 生产架构:
#   nginx (80/443) -> 127.0.0.1:3000 (frontend next start)
#                 -> 127.0.0.1:3001 (backend node dist/src/main)
#   rsshub (docker, :1200)
#   MySQL/Redis 为外部中间件
#
# ============================================================
# 标准发布流程 (每次更新代码后执行)
# ============================================================
#
#   1. 拉取最新代码:
#        cd /data/cms-ng && git pull origin main
#
#   2. 检查 backend/.env 是否需要更新 (对照 backend/.env.example):
#        diff backend/.env.example backend/.env
#
#   3. 如有 schema 变更，先创建迁移:
#        cd backend && npx prisma migrate dev --name <描述>
#        (生产环境只用 migrate deploy，不会创建新迁移)
#
#   4. 执行完整发布:
#        ./scripts/cms-ng-service.sh start --prod
#      脚本自动完成: 前置检查 -> 构建 -> 停旧 -> 启动 -> 迁移 -> 健康检查 -> admin
#
#   5. 验证:
#        ./scripts/cms-ng-service.sh status --prod
#      或手动:
#        curl -sI http://localhost/login      # 期望 200
#        curl -sI http://localhost/users      # 期望 401 (无 token 为正常)
#
#   何时用 --no-build:
#     - 仅重启服务，代码未变更 (如改了 .env、调整 nginx 配置后重启)
#     - 不适用于 schema 变更、依赖更新、任何代码改动
#
# ============================================================
# 日志与 PID 文件
# ============================================================
#
#   backend  日志: .cms-ng-backend.log     PID: .cms-ng-backend.pid
#   frontend 日志: .cms-ng-frontend.log    PID: .cms-ng-frontend.pid
#   dev 合并日志: .cms-ng-dev.log          PID: .cms-ng-dev.pid
#
#   查看日志: ./scripts/cms-ng-service.sh logs --prod backend
#             ./scripts/cms-ng-service.sh logs --prod frontend
#             ./scripts/cms-ng-service.sh logs --prod rsshub
#
# ============================================================
# 故障排查
# ============================================================
#
#   Q: start --prod 后 backend/frontend 显示 "未响应"
#   A: 查看对应日志: logs --prod backend / logs --prod frontend
#      常见原因: 端口被占 (ss -ltnp | grep -E ':3000|:3001')、
#                .env 变量缺失、DATABASE_URL 不可达
#
#   Q: 数据库迁移失败
#   A: 脚本不会中断 (Warning 提示)，可手动重试:
#        cd backend && npx prisma migrate deploy
#      若需创建新迁移 (仅开发环境): npx prisma migrate dev --name <描述>
#
#   Q: frontend 容器/进程起来但页面 502
#   A: 检查 nginx: nginx -t && systemctl status nginx
#      nginx 反代配置: /etc/nginx/conf.d/cms-ng.conf
#
#   Q: 端口冲突 (3000/3001 被其他进程占用)
#   A: stop --prod 后重新 start --prod
#      或手动清理: pkill -f "node dist/src/main"; pkill -f "next start"
#
#   Q: RSSHub 容器未启动
#   A: 非致命，手动拉起: docker compose -f docker-compose.yml up -d
#
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# dev 模式
PID_FILE="$PROJECT_DIR/.cms-ng-dev.pid"
LOG_FILE="$PROJECT_DIR/.cms-ng-dev.log"

# prod 模式
BACKEND_PID_FILE="$PROJECT_DIR/.cms-ng-backend.pid"
FRONTEND_PID_FILE="$PROJECT_DIR/.cms-ng-frontend.pid"
BACKEND_LOG_FILE="$PROJECT_DIR/.cms-ng-backend.log"
FRONTEND_LOG_FILE="$PROJECT_DIR/.cms-ng-frontend.log"
RSSHUB_COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
BACKEND_ENV="$BACKEND_DIR/.env"

# 健康检查端口
PROD_FRONTEND_PORT=3000
PROD_BACKEND_PORT=3001

# admin 账号
ADMIN_EMAIL="admin@cms-ng.local"
ADMIN_PASSWORD="123456"
ADMIN_PASSWORD_HASH='$2b$12$J7rpHCrlCYUeDlxLcqQjKeLBdDZjpzKC5KaDO0NqgQ8TkmVnIk1nS'

# backend/.env 中必须存在的变量
REQUIRED_ENV_VARS=(DATABASE_URL REDIS_URL JWT_SECRET)

# ---- 参数解析 ----

is_prod() {
    for arg in "$@"; do
        [[ "$arg" == "--prod" ]] && return 0
    done
    return 1
}

has_flag() {
    local flag="$1"
    shift
    for arg in "$@"; do
        [[ "$arg" == "$flag" ]] && return 0
    done
    return 1
}

usage() {
    cat <<EOF
用法: $0 {start|stop|restart|status|logs} [--prod] [--no-build]

命令:
  start    启动服务
  stop     停止服务
  restart  重启服务
  status   查看服务状态
  logs     查看日志

模式:
  (默认)  开发模式 (npm run dev)
  --prod   生产模式 (宿主机进程 + rsshub 容器)

生产模式选项 (仅 start/restart --prod):
  --no-build  跳过构建 (仅启动已有产物)

示例:
  $0 start                      # 开发模式启动
  $0 start --prod               # 生产发布 (build+启动+迁移+验证)
  $0 start --prod --no-build    # 生产启动 (跳过构建)
  $0 status --prod              # 生产状态 + 健康检查
  $0 logs --prod backend        # 查看 backend 日志
EOF
    exit 1
}

# ============================================================
# 开发模式
# ============================================================

start_dev() {
    echo "[start] 开发模式启动 (npm run dev)..."

    if pgrep -f "turbo run dev" > /dev/null 2>&1; then
        echo "        turbo dev 已在运行 (PID: $(pgrep -f "turbo run dev" | tr '\n' ' '))"
        exit 1
    fi

    cd "$PROJECT_DIR"
    nohup npm run dev > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "        PID: $(cat "$PID_FILE")"

    sleep 3
    if ! ps -p "$(cat "$PID_FILE")" > /dev/null 2>&1; then
        echo "        Error: 进程启动失败，查看日志: $LOG_FILE"
        rm -f "$PID_FILE"
        exit 1
    fi

    echo "        日志: $LOG_FILE"
    echo "        Frontend: http://localhost:3000"
    echo "        Backend:  http://localhost:3001"
    echo "        启动完成"
}

stop_dev() {
    echo "[stop] 停止开发模式..."

    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
            echo "        已停止 PID: $pid"
        fi
        rm -f "$PID_FILE"
    fi

    pkill -f "turbo run dev" 2>/dev/null || true
    echo "        停止完成"
}

status_dev() {
    echo "[status] 开发模式:"

    if pgrep -f "turbo run dev" > /dev/null 2>&1; then
        local pids=$(pgrep -f "turbo run dev" | tr '\n' ' ')
        echo "        状态: 运行中"
        echo "        PID:   $pids"
        echo "        日志:  $LOG_FILE"

        if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200\|302"; then
            echo "        Frontend (:3000): ✓ 可访问"
        else
            echo "        Frontend (:3000): ✗ 未响应"
        fi

        if curl -s -o /dev/null http://localhost:3001 2>/dev/null; then
            echo "        Backend  (:3001): ✓ 可访问"
        else
            echo "        Backend  (:3001): ✗ 未响应"
        fi
    else
        echo "        状态: 未运行"
    fi
}

logs_dev() {
    if [ -f "$LOG_FILE" ]; then
        echo "[logs] 开发日志 ($LOG_FILE):"
        tail -f "$LOG_FILE"
    else
        echo "        日志文件不存在: $LOG_FILE"
        exit 1
    fi
}

# ============================================================
# 生产模式 (宿主机进程)
# ============================================================

prod_preflight() {
    echo "[1/7] 前置检查..."

    if [ ! -f "$BACKEND_ENV" ]; then
        echo "        Error: $BACKEND_ENV 不存在"
        echo "               模板见 backend/.env.example"
        exit 1
    fi

    local missing=()
    for var in "${REQUIRED_ENV_VARS[@]}"; do
        if ! grep -qE "^${var}=" "$BACKEND_ENV"; then
            missing+=("$var")
        fi
    done
    if [ ${#missing[@]} -gt 0 ]; then
        echo "        Error: $BACKEND_ENV 缺少变量: ${missing[*]}"
        exit 1
    fi

    if ! command -v node &> /dev/null; then
        echo "        Error: node 未安装"
        exit 1
    fi

    echo "        node $(node --version)"
    echo "        backend/.env OK (含 ${#REQUIRED_ENV_VARS[@]} 个必要变量)"

    # 非致命：PLAYWRIGHT_ENABLED=true 时检查 Chromium 是否已安装
    # （Google Trends 实时源依赖）。缺失仅告警，服务 fail-open 回退 RSS 每日源。
    if grep -qE '^PLAYWRIGHT_ENABLED="true"' "$BACKEND_ENV" 2>/dev/null; then
        local browsers_path="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
        if [ ! -d "$browsers_path" ] || [ -z "$(ls -A "$browsers_path" 2>/dev/null)" ]; then
            echo "        Warn: PLAYWRIGHT_ENABLED=true 但 Chromium 未安装于 $browsers_path"
            echo "               Google Trends 实时源将 fail-open 回退到 RSS 每日源"
            echo "               一次性安装: cd backend && npx playwright install --with-deps chromium"
        else
            echo "        Playwright Chromium OK ($browsers_path)"
        fi
    fi
}

prod_build() {
    if has_flag "--no-build" "$@"; then
        echo "[2/7] 跳过构建 (--no-build)"
        return
    fi

    echo "[2/7] 构建 (可能需要 3-10 分钟)..."

    echo "        构建 shared..."
    cd "$PROJECT_DIR/packages/shared" && npm run build >/dev/null 2>&1

    echo "        构建 backend..."
    cd "$BACKEND_DIR" && npm run build >/dev/null 2>&1

    echo "        构建 frontend..."
    cd "$FRONTEND_DIR" && npm run build >/dev/null 2>&1

    echo "        构建完成"
}

prod_stop_apps() {
    echo "[3/7] 停止旧应用进程..."

    # backend
    if [ -f "$BACKEND_PID_FILE" ]; then
        local pid=$(cat "$BACKEND_PID_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
            echo "        backend 已停止 (PID: $pid)"
        fi
        rm -f "$BACKEND_PID_FILE"
    fi
    pkill -f "node dist/main" 2>/dev/null || true
    pkill -f "node dist/src/main" 2>/dev/null || true

    # frontend
    if [ -f "$FRONTEND_PID_FILE" ]; then
        local pid=$(cat "$FRONTEND_PID_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
            echo "        frontend 已停止 (PID: $pid)"
        fi
        rm -f "$FRONTEND_PID_FILE"
    fi
    pkill -f "next start" 2>/dev/null || true
    pkill -f "next-server" 2>/dev/null || true

    sleep 1
    echo "        旧进程已清理"
}

prod_start_apps() {
    echo "[4/7] 启动应用..."

    cd "$BACKEND_DIR"
    nohup node dist/src/main > "$BACKEND_LOG_FILE" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    echo "        backend  PID: $(cat "$BACKEND_PID_FILE")  日志: $BACKEND_LOG_FILE"

    cd "$FRONTEND_DIR"
    nohup npm run start > "$FRONTEND_LOG_FILE" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    echo "        frontend PID: $(cat "$FRONTEND_PID_FILE")  日志: $FRONTEND_LOG_FILE"

    echo "        启动 RSSHub 容器..."
    cd "$PROJECT_DIR"
    docker compose -f "$RSSHUB_COMPOSE_FILE" up -d >/dev/null 2>&1 || echo "        Warning: RSSHub 启动失败 (非致命)"
}

prod_migrate() {
    echo "[5/7] 数据库迁移 (prisma migrate deploy)..."

    local ready=false
    for i in $(seq 1 15); do
        if curl -s -o /dev/null "http://localhost:${PROD_BACKEND_PORT}/users" 2>/dev/null; then
            ready=true
            break
        fi
        sleep 2
    done

    if [ "$ready" != "true" ]; then
        echo "        Warning: backend 未就绪，跳过迁移"
        echo "               可手动执行: cd backend && npx prisma migrate deploy"
        return
    fi

    cd "$BACKEND_DIR"
    if npx prisma migrate deploy 2>&1; then
        echo "        迁移完成"
    else
        echo "        Warning: 迁移失败 (常见原因: DATABASE_URL 不可达)"
    fi
}

prod_health() {
    echo "[6/7] 健康验证..."
    sleep 3

    local fe_status be_status
    fe_status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PROD_FRONTEND_PORT}/login" 2>/dev/null || echo "000")
    be_status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PROD_BACKEND_PORT}/users" 2>/dev/null || echo "000")

    if echo "$fe_status" | grep -q "200\|302\|307"; then
        echo "        Frontend (:${PROD_FRONTEND_PORT}): ✓ 可访问 (HTTP $fe_status)"
    else
        echo "        Frontend (:${PROD_FRONTEND_PORT}): ✗ 未响应 (HTTP $fe_status)"
    fi

    if echo "$be_status" | grep -q "200\|401\|403"; then
        echo "        Backend  (:${PROD_BACKEND_PORT}): ✓ 可访问 (HTTP $be_status)"
    else
        echo "        Backend  (:${PROD_BACKEND_PORT}): ✗ 未响应 (HTTP $be_status)"
    fi
}

prod_init_admin() {
    echo "[7/7] 初始化 admin 账号..."

    if ! curl -s -o /dev/null "http://localhost:${PROD_BACKEND_PORT}/users" 2>/dev/null; then
        echo "        Warning: backend 未就绪，跳过 admin 初始化"
        return
    fi

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:${PROD_BACKEND_PORT}/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$ADMIN_EMAIL\",\"name\":\"Super Admin\",\"password\":\"$ADMIN_PASSWORD\",\"role\":\"ADMIN\"}")

    if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
        echo "        Admin 账号已创建: $ADMIN_EMAIL"
    elif [ "$http_code" = "409" ]; then
        echo "        Admin 账号已存在: $ADMIN_EMAIL"
    else
        echo "        Warning: Admin 注册返回 HTTP $http_code"
    fi
}

start_prod() {
    echo "========================================"
    echo "  CMS-NG 生产环境发布"
    echo "  Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "========================================"

    prod_preflight
    prod_build "$@"
    prod_stop_apps
    prod_start_apps
    prod_migrate
    prod_health
    prod_init_admin

    echo ""
    echo "========================================"
    echo "  发布完成: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "  Frontend: http://localhost:${PROD_FRONTEND_PORT}"
    echo "  Backend:  http://localhost:${PROD_BACKEND_PORT}"
    echo "  (nginx 反代 80/443 -> 3000/3001)"
    echo "========================================"
}

stop_prod() {
    echo "[stop] 停止生产模式..."

    if [ -f "$BACKEND_PID_FILE" ]; then
        local pid=$(cat "$BACKEND_PID_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
            echo "        backend 已停止 (PID: $pid)"
        fi
        rm -f "$BACKEND_PID_FILE"
    fi
    pkill -f "node dist/main" 2>/dev/null || true
    pkill -f "node dist/src/main" 2>/dev/null || true

    if [ -f "$FRONTEND_PID_FILE" ]; then
        local pid=$(cat "$FRONTEND_PID_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
            echo "        frontend 已停止 (PID: $pid)"
        fi
        rm -f "$FRONTEND_PID_FILE"
    fi
    pkill -f "next start" 2>/dev/null || true
    pkill -f "next-server" 2>/dev/null || true

    echo "        应用进程已停止 (rsshub 容器保留)"
}

restart_prod() {
    stop_prod
    start_prod "$@"
}

status_prod() {
    echo "[status] 生产模式:"

    local be_pid=""
    if [ -f "$BACKEND_PID_FILE" ]; then
        be_pid=$(cat "$BACKEND_PID_FILE" 2>/dev/null || echo "")
    fi
    if [ -n "$be_pid" ] && ps -p "$be_pid" > /dev/null 2>&1; then
        echo "        backend:  运行中 (PID: $be_pid)"
        echo "                  日志: $BACKEND_LOG_FILE"
    else
        echo "        backend:  未运行"
    fi

    local fe_pid=""
    if [ -f "$FRONTEND_PID_FILE" ]; then
        fe_pid=$(cat "$FRONTEND_PID_FILE" 2>/dev/null || echo "")
    fi
    if [ -n "$fe_pid" ] && ps -p "$fe_pid" > /dev/null 2>&1; then
        echo "        frontend: 运行中 (PID: $fe_pid)"
        echo "                  日志: $FRONTEND_LOG_FILE"
    else
        echo "        frontend: 未运行"
    fi

    echo "        rsshub:   $(docker ps --filter name=cms-ng-rsshub --format '{{.Status}}' 2>/dev/null || echo '未运行')"

    echo ""
    echo "        健康检查:"
    local fe_status be_status
    fe_status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PROD_FRONTEND_PORT}/login" 2>/dev/null || echo "000")
    be_status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PROD_BACKEND_PORT}/users" 2>/dev/null || echo "000")

    if echo "$fe_status" | grep -q "200\|302\|307"; then
        echo "          Frontend (:${PROD_FRONTEND_PORT}): ✓ 可访问 (HTTP $fe_status)"
    else
        echo "          Frontend (:${PROD_FRONTEND_PORT}): ✗ 未响应 (HTTP $fe_status)"
    fi
    if echo "$be_status" | grep -q "200\|401\|403"; then
        echo "          Backend  (:${PROD_BACKEND_PORT}): ✓ 可访问 (HTTP $be_status)"
    else
        echo "          Backend  (:${PROD_BACKEND_PORT}): ✗ 未响应 (HTTP $be_status)"
    fi
}

logs_prod() {
    local service="${1:-}"
    case "$service" in
        backend)
            echo "[logs] backend 日志 ($BACKEND_LOG_FILE) (Ctrl+C 退出):"
            tail -f "$BACKEND_LOG_FILE"
            ;;
        frontend)
            echo "[logs] frontend 日志 ($FRONTEND_LOG_FILE) (Ctrl+C 退出):"
            tail -f "$FRONTEND_LOG_FILE"
            ;;
        rsshub)
            echo "[logs] rsshub 日志 (Ctrl+C 退出):"
            docker compose -f "$RSSHUB_COMPOSE_FILE" logs -f rsshub
            ;;
        "")
            echo "[logs] backend 日志 ($BACKEND_LOG_FILE) (Ctrl+C 退出):"
            echo "        (指定 backend|frontend|rsshub 查看其他)"
            tail -f "$BACKEND_LOG_FILE"
            ;;
        *)
            echo "        未知服务: $service (可选: backend | frontend | rsshub)"
            exit 1
            ;;
    esac
}

# ---- main ----

CMD="${1:-usage}"
shift 2>/dev/null || true

case "$CMD" in
    start)
        if is_prod "$@"; then
            start_prod "$@"
        else
            start_dev
        fi
        ;;
    stop)
        if is_prod "$@"; then
            stop_prod
        else
            stop_dev
        fi
        ;;
    restart)
        if is_prod "$@"; then
            restart_prod "$@"
        else
            stop_dev
            start_dev
        fi
        ;;
    status)
        if is_prod "$@"; then
            status_prod
        else
            status_dev
        fi
        ;;
    logs)
        if is_prod "$@"; then
            svc=""
            for arg in "$@"; do
                [[ "$arg" == "--prod" ]] && continue
                [[ "$arg" == --* ]] && continue
                svc="$arg"
                break
            done
            logs_prod "$svc"
        else
            logs_dev
        fi
        ;;
    *)
        usage
        ;;
esac
