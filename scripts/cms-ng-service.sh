#!/bin/bash
set -e

# ============================================================
# CMS-NG 服务管理脚本
# 用法:
#   ./scripts/cms-ng-service.sh start  [--prod] [--no-build]
#   ./scripts/cms-ng-service.sh stop   [--prod]
#   ./scripts/cms-ng-service.sh restart [--prod] [--no-build]
#   ./scripts/cms-ng-service.sh status [--prod]
#   ./scripts/cms-ng-service.sh logs   [--prod] [backend|frontend|rsshub|elasticsearch]
#
# 模式:
#   (默认)  开发模式 (npm run dev, turbo)
#   --prod   生产模式 (宿主机进程: nginx 反代 + node/next 后台进程 + rsshub/elasticsearch 容器)
#
# 生产模式选项:
#   --no-build  跳过构建 (仅启动已有产物，用于快速重启非代码变更的场景)
#
# 生产架构:
#   nginx (80/443) -> 127.0.0.1:3000 (frontend next start)
#                 -> 127.0.0.1:3001 (backend node dist/src/main)
#   rsshub (docker, :1200)
#   elasticsearch (docker, 127.0.0.1:9200; 仅 ELASTICSEARCH_ENABLED=true 时启动,媒体全文检索)
#   MySQL 为外部中间件
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
#      脚本自动完成: 前置检查 -> 构建 -> 停旧 -> 迁移 -> 启动 -> 健康检查 -> admin
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
#   A: 脚本会中止发布 (exit 1)。迁移在启动前执行，不会出现新代码对旧 schema 运行。
#      此时应用已停 (未启动新版本)，修复后重跑: ./scripts/cms-ng-service.sh start --prod
#      可手动重试迁移: cd backend && npx prisma migrate deploy
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
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"  # rsshub + elasticsearch 两个中间件容器
BACKEND_ENV="$BACKEND_DIR/.env"

# 健康检查端口
PROD_FRONTEND_PORT=3000
PROD_BACKEND_PORT=3001

# backend/.env 中必须存在的变量
REQUIRED_ENV_VARS=(DATABASE_URL JWT_SECRET)

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

# backend/.env 中 ELASTICSEARCH_ENABLED=true 时返回 0。
# 与应用侧 dotenv 语义对齐:值先截断行内注释、去首尾空白与单/双引号、小写化后再比较
# (容忍 `ELASTICSEARCH_ENABLED = true # 注释`、`TRUE`、`"true"` 等写法),避免脚本与应用判定分叉。
es_enabled() {
    local raw
    raw=$(grep -E '^[[:space:]]*ELASTICSEARCH_ENABLED[[:space:]]*=' "$BACKEND_ENV" 2>/dev/null | head -n1 | cut -d= -f2-)
    raw=$(printf '%s' "$raw" | sed 's/[[:space:]]#.*$//' | tr -d "\"'[:space:]" | tr '[:upper:]' '[:lower:]')
    [ "$raw" = "true" ]
}

# 安全红线:ES 无认证,9200 只能绑环回(127.0.0.1/::1);公网暴露 = 勒索软件靶标。
# 静态校验(权威源):直接 grep compose 文件,容器未启动也能在 preflight 阶段拦截误配。
assert_es_loopback_static() {
    # 先剔除合法绑定 "127.0.0.1:9200:9200",残留里若还有 9200:9200(裸绑)或 0.0.0.0(公网)即拒绝
    local stripped
    stripped=$(sed 's/127\.0\.0\.1:9200:9200//g' "$COMPOSE_FILE" 2>/dev/null)
    if printf '%s' "$stripped" | grep -qE '9200:9200|0\.0\.0\.0[^"]*9200'; then
        echo "        Error: docker-compose.yml 中 ES 9200 未绑定 127.0.0.1(公网暴露,无认证 = 勒索靶标)"
        echo "               必须写成 \"127.0.0.1:9200:9200\"。发布中止。"
        exit 1
    fi
    if ! grep -qE '127\.0\.0\.1:9200:9200' "$COMPOSE_FILE" 2>/dev/null; then
        echo "        Error: docker-compose.yml 未找到 \"127.0.0.1:9200:9200\" 映射(ES 端口配置被改动?)"
        echo "               发布中止。"
        exit 1
    fi
}

# 运行时校验(白名单):inspect 实际运行容器的 9200 宿主绑定,逐一必须是环回。
# 发现非环回绑定立即停止该容器(消除暴露)并中止发布——0.0.0.0 的 ES 绝不合法。
assert_es_loopback_runtime() {
    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^cms-ng-elasticsearch$'; then
        return 0  # 容器未运行(首次发布),由静态校验兜底
    fi
    local ips bad=0 ip
    ips=$(docker inspect -f '{{json .NetworkSettings.Ports}}' cms-ng-elasticsearch 2>/dev/null \
          | grep -oE '"HostIp":"[^"]*"' | cut -d'"' -f4)
    for ip in $ips; do
        case "$ip" in
            127.0.0.1|::1|localhost) ;;        # 环回,放行
            *) bad=1 ;;                        # 0.0.0.0 / :: / 公网 IP -> 暴露
        esac
    done
    if [ "$bad" = "1" ]; then
        docker stop cms-ng-elasticsearch >/dev/null 2>&1 || true  # 立即消除公网暴露
        echo "        Error: Elasticsearch 9200 实际绑定非环回 IP($ips),公网暴露 = 勒索靶标"
        echo "               已停止暴露的 ES 容器。请在 docker-compose.yml 绑定 127.0.0.1:9200 后重发。发布中止。"
        exit 1
    fi
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
  --prod   生产模式 (宿主机进程 + rsshub/elasticsearch 容器)

生产模式选项 (仅 start/restart --prod):
  --no-build  跳过构建 (仅启动已有产物)

示例:
  $0 start                      # 开发模式启动
  $0 start --prod               # 生产发布 (build+启动+迁移+验证)
  $0 start --prod --no-build    # 生产启动 (跳过构建)
  $0 status --prod              # 生产状态 + 健康检查
  $0 logs --prod backend        # 查看 backend 日志
  $0 logs --prod elasticsearch  # 查看 elasticsearch 日志
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

    # Elasticsearch(媒体全文检索,可选)。仅当 ELASTICSEARCH_ENABLED=true 时检查。
    if es_enabled; then
        # 安全红线双保险:静态 grep compose(权威源,容器未起也拦截)+ 运行时 inspect 实际绑定
        assert_es_loopback_static
        assert_es_loopback_runtime
        # 可达性(非致命):容器尚未启动(首次发布)或宕机时检索降级 LIKE
        if curl -sf http://localhost:9200/_cluster/health >/dev/null 2>&1; then
            echo "        Elasticsearch OK (localhost:9200)"
        else
            echo "        Warn: ELASTICSEARCH_ENABLED=true 但 localhost:9200 暂不可达"
            echo "               检索将降级 LIKE;容器随本次发布启动(start_apps)后可恢复"
        fi
    fi
}

prod_build() {
    if has_flag "--no-build" "$@"; then
        echo "[2/7] 跳过构建 (--no-build)"
        return
    fi

    echo "[2/7] 构建 (可能需要 3-10 分钟)..."

    # 部署机不会自己装依赖:新代码引入的新包(如 helmet/@nestjs/throttler)
    # 不在旧 node_modules 里,缺了会在启动时才崩。每次发布先按 lockfile 同步。
    echo "        同步依赖 (npm ci)..."
    if ! (cd "$PROJECT_DIR" && npm ci >/tmp/cms-ng-build.log 2>&1); then
        echo "        ✗ npm ci 失败,日志末尾:"
        tail -n 20 /tmp/cms-ng-build.log
        exit 1
    fi

    echo "        构建 shared..."
    if ! (cd "$PROJECT_DIR/packages/shared" && npm run build >/tmp/cms-ng-build.log 2>&1); then
        echo "        ✗ shared 构建失败,日志末尾:"
        tail -n 20 /tmp/cms-ng-build.log
        exit 1
    fi

    echo "        构建 backend..."
    if ! (cd "$BACKEND_DIR" && npm run build >/tmp/cms-ng-build.log 2>&1); then
        echo "        ✗ backend 构建失败,日志末尾:"
        tail -n 20 /tmp/cms-ng-build.log
        exit 1
    fi

    echo "        构建 frontend..."
    if ! (cd "$FRONTEND_DIR" && npm run build >/tmp/cms-ng-build.log 2>&1); then
        echo "        ✗ frontend 构建失败,日志末尾:"
        tail -n 20 /tmp/cms-ng-build.log
        exit 1
    fi

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
    echo "[5/7] 启动应用..."

    cd "$BACKEND_DIR"
    # NODE_ENV=production: Swagger 不挂载、helmet CSP 生效(main.ts 依赖此判断)。
    # 不设置时后端按 development 运行,生产会意外暴露 /api-docs。
    NODE_ENV=production nohup node dist/src/main > "$BACKEND_LOG_FILE" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    echo "        backend  PID: $(cat "$BACKEND_PID_FILE")  日志: $BACKEND_LOG_FILE"

    cd "$FRONTEND_DIR"
    nohup npm run start > "$FRONTEND_LOG_FILE" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    echo "        frontend PID: $(cat "$FRONTEND_PID_FILE")  日志: $FRONTEND_LOG_FILE"

    echo "        启动 RSSHub 容器..."
    cd "$PROJECT_DIR"
    docker compose -f "$COMPOSE_FILE" up -d rsshub >/dev/null 2>&1 || echo "        Warning: RSSHub 启动失败 (非致命)"

    # Elasticsearch 仅当启用时启动(避免功能关闭白跑 512m 容器;首次需构建含 IK 的镜像)
    if es_enabled; then
        echo "        启动 Elasticsearch 容器(首次构建镜像较慢)..."
        docker compose -f "$COMPOSE_FILE" up -d elasticsearch >/dev/null 2>&1 || echo "        Warning: Elasticsearch 启动失败 (非致命,检索降级 LIKE)"
        # 启动后复检实际端口绑定(闭合 preflight 静态校验与运行时之间的 TOCTOU 窗口)
        assert_es_loopback_runtime
    fi
}

prod_migrate() {
    echo "[4/7] 数据库迁移 (prisma migrate deploy)..."

    # 迁移在启动应用之前执行: prisma migrate deploy 直连 DATABASE_URL，
    # 不依赖 backend 进程就绪。失败必须 exit 1 中断发布，
    # 避免新代码对旧 schema 运行 / 迁移失败假成功。
    cd "$BACKEND_DIR"
    if npx prisma migrate deploy 2>&1; then
        echo "        迁移完成"
    else
        echo "        Error: 数据库迁移失败 (常见原因: DATABASE_URL 不可达 / 迁移 SQL 错误)"
        echo "               发布中止。此时应用已停，修复后重跑: ./scripts/cms-ng-service.sh start --prod"
        exit 1
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

    # Elasticsearch(仅启用时;未响应非致命,检索降级 LIKE)
    if es_enabled; then
        local es_status
        es_status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:9200/_cluster/health" 2>/dev/null || echo "000")
        if [ "$es_status" = "200" ]; then
            echo "        Elasticsearch (:9200): ✓ 可访问"
        else
            echo "        Elasticsearch (:9200): ✗ 未响应 (HTTP $es_status) — 检索降级 LIKE (非致命)"
        fi
    fi
}

prod_init_admin() {
    echo "[7/7] 初始化 admin 账号..."

    # 安全基线(issue #105 后续):公开注册接口永远只创建 REPORTER,admin 必须由
    # 本机脚本直写 DB(backend/scripts/create-admin.ts)。仅在显式提供
    # ADMIN_BOOTSTRAP_PASSWORD 时执行,避免每次发布都确保一个"公开仓库里的
    # 已知凭证账号"存在(红队审查发现)。
    local bootstrap_email="$1"
    local bootstrap_password="$2"
    if [ -z "$bootstrap_password" ]; then
        echo "        跳过: 未设置 ADMIN_BOOTSTRAP_PASSWORD"
        echo "        初始化/重置 admin: ADMIN_BOOTSTRAP_EMAIL=ops@example.com ADMIN_BOOTSTRAP_PASSWORD='强密码' $0 start --prod --no-build"
        return
    fi

    cd "$BACKEND_DIR"
    # 优先运行构建产物:ts-node 是 devDependency,生产环境未必可用
    # (红队审查 round 2)。dist/scripts/create-admin.js 由 nest build 生成。
    local runner="npx ts-node scripts/create-admin.ts"
    if [ -f "dist/scripts/create-admin.js" ]; then
        runner="node dist/scripts/create-admin.js"
    fi
    if ADMIN_EMAIL="${bootstrap_email:-admin@cms-ng.local}" \
       ADMIN_PASSWORD="$bootstrap_password" \
       $runner; then
        echo "        Admin 账号已就绪(密码未记录于日志)"
    else
        echo "        Warning: admin 初始化失败,可稍后手动执行上面的命令"
    fi
}

start_prod() {
    echo "========================================"
    echo "  CMS-NG 生产环境发布"
    echo "  Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "========================================"

    # 捕获引导凭证后立即从环境移除:否则它们会随环境变量传给长驻的
    # node/next 进程,任何能读 /proc/<pid>/environ 的人都能拿到明文密码
    # (红队审查 round 2)。之后通过函数参数传递,不再依赖环境。
    local bootstrap_email="${ADMIN_BOOTSTRAP_EMAIL:-}"
    local bootstrap_password="${ADMIN_BOOTSTRAP_PASSWORD:-}"
    unset ADMIN_BOOTSTRAP_EMAIL ADMIN_BOOTSTRAP_PASSWORD

    prod_preflight
    prod_build "$@"
    prod_stop_apps
    prod_migrate
    prod_start_apps
    prod_health
    prod_init_admin "$bootstrap_email" "$bootstrap_password"

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

    echo "        应用进程已停止 (rsshub/elasticsearch 容器保留)"
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
    if es_enabled; then
        echo "        elasticsearch: $(docker ps --filter name=cms-ng-elasticsearch --format '{{.Status}}' 2>/dev/null || echo '未运行')"
    else
        echo "        elasticsearch: 已禁用 (ELASTICSEARCH_ENABLED!=true)"
    fi

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
            docker compose -f "$COMPOSE_FILE" logs -f rsshub
            ;;
        elasticsearch|es)
            echo "[logs] elasticsearch 日志 (Ctrl+C 退出):"
            docker compose -f "$COMPOSE_FILE" logs -f elasticsearch
            ;;
        "")
            echo "[logs] backend 日志 ($BACKEND_LOG_FILE) (Ctrl+C 退出):"
            echo "        (指定 backend|frontend|rsshub|elasticsearch 查看其他)"
            tail -f "$BACKEND_LOG_FILE"
            ;;
        *)
            echo "        未知服务: $service (可选: backend | frontend | rsshub | elasticsearch)"
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
