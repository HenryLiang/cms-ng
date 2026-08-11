#!/bin/bash
set -e

# ============================================================
# CMS-NG 服务管理脚本
# 用法:
#   ./scripts/cms-ng-service.sh install [--prod]            # 首次/升级后: 安装 systemd 单元 + logrotate
#   ./scripts/cms-ng-service.sh start  [--prod] [--no-build]
#   ./scripts/cms-ng-service.sh stop   [--prod]
#   ./scripts/cms-ng-service.sh restart [--prod] [--no-build]
#   ./scripts/cms-ng-service.sh status [--prod]
#   ./scripts/cms-ng-service.sh logs   [--prod] [backend|frontend|rsshub]
#
# 模式:
#   (默认)  开发模式 (npm run dev, turbo)
#   --prod   生产模式 (systemd 守护: nginx 反代 + systemd 单元 + rsshub 容器)
#
# 生产模式选项:
#   --no-build  跳过构建 (仅启动已有产物，用于快速重启非代码变更的场景)
#
# 生产架构:
#   nginx (80/443) -> 127.0.0.1:3000 (cms-ng-frontend.service, next start)
#                 -> 127.0.0.1:3001 (cms-ng-backend.service, node dist/src/main)
#   应用进程由 systemd 守护: 崩溃自动拉起 (Restart=on-failure) + 开机自启 (enable)
#   rsshub (docker, :1200)
#   elasticsearch (外部;直连 backend/.env 中 ELASTICSEARCH_NODE,仅 ELASTICSEARCH_ENABLED=true 时使用,媒体全文检索)
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
#      脚本自动完成: 前置检查 -> Prisma Client 检查/生成 -> 构建 -> 停旧 -> 启动 -> 迁移 -> 健康检查 -> admin
#      如 schema.prisma 发生变更，会自动重新生成 Prisma Client，避免 build 阶段因类型缺失而失败。
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
#   首次部署或从旧版 (nohup+PID) 升级:
#     ./scripts/cms-ng-service.sh install --prod   # 写入 systemd 单元 + logrotate, enable 开机自启
#     (升级时先用旧脚本 stop --prod 停掉 nohup 进程,再 install + start --prod --no-build)
#
# ============================================================
# 日志文件
# ============================================================
#
#   backend  日志: .cms-ng-backend.log    (systemd append 写入; 亦可 journalctl -u cms-ng-backend -f)
#   frontend 日志: .cms-ng-frontend.log   (journalctl -u cms-ng-frontend -f)
#   dev 合并日志: .cms-ng-dev.log         PID: .cms-ng-dev.pid (仅 dev 模式用 PID 文件)
#   日志轮转: /etc/logrotate.d/cms-ng (daily, 保留 14 份, copytruncate)
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
#   A: 查看日志: logs --prod backend / logs --prod frontend
#      或:       journalctl -u cms-ng-backend -n 100 --no-pager
#      常见原因: 端口被占 (ss -ltnp | grep -E ':3000|:3001')、
#                .env 变量缺失、DATABASE_URL 不可达、
#                旧 nohup 进程残留占端口 (pkill -f "node dist/src/main"; pkill -f "next start")
#
#   Q: 数据库迁移失败
#   A: 脚本会中止发布 (exit 1)。迁移在启动前执行，不会出现新代码对旧 schema 运行。
#      此时应用已停 (未启动新版本)，修复后重跑: ./scripts/cms-ng-service.sh start --prod
#      可手动重试迁移: cd backend && npx prisma migrate deploy
#      若需创建新迁移 (仅开发环境): npx prisma migrate dev --name <描述>
#
#   Q: frontend 进程起来但页面 502
#   A: 检查 nginx: nginx -t && systemctl status nginx
#      nginx 反代配置: /etc/nginx/conf.d/cms-ng.conf
#      注意: 新增后端控制器 (@Controller('xxx')) 必须同步该配置中的路径前缀清单,否则公网 404
#
#   Q: 端口冲突 (3000/3001 被其他进程占用)
#   A: systemctl stop cms-ng-backend cms-ng-frontend 后重新 start --prod
#      或手动清理残留: pkill -f "node dist/src/main"; pkill -f "next start"
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

# prod 模式 (systemd 守护;日志仍落仓库根,保持 logs --prod 习惯不变)
BACKEND_LOG_FILE="$PROJECT_DIR/.cms-ng-backend.log"
FRONTEND_LOG_FILE="$PROJECT_DIR/.cms-ng-frontend.log"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"  # rsshub 中间件容器 (ES 已改为外部连接)
BACKEND_ENV="$BACKEND_DIR/.env"
PRISMA_SCHEMA="$BACKEND_DIR/prisma/schema.prisma"
PRISMA_CLIENT_HASH_FILE="$PROJECT_DIR/node_modules/.prisma-client-schema-hash"

# systemd 单元
SYSTEMD_DIR="/etc/systemd/system"
BACKEND_UNIT="cms-ng-backend.service"
FRONTEND_UNIT="cms-ng-frontend.service"
LOGROTATE_CONF="/etc/logrotate.d/cms-ng"

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

# 读取 backend/.env 中 ELASTICSEARCH_NODE 的值(去掉行内注释/引号/空白)。
# 生产环境不再启动本地 ES 容器,直接连接 .env 配置的 ES 地址(可为远端/云端/本地均可)。
# 未配置时回退到 http://localhost:9200(与 search.service.ts 默认值一致)。
es_node() {
    local raw
    raw=$(grep -E '^[[:space:]]*ELASTICSEARCH_NODE[[:space:]]*=' "$BACKEND_ENV" 2>/dev/null | head -n1 | cut -d= -f2-)
    raw=$(printf '%s' "$raw" | sed 's/[[:space:]]#.*$//' | tr -d "\"'[:space:]" )
    if [ -z "$raw" ]; then
        echo "http://localhost:9200"
    else
        echo "$raw"
    fi
}

# 读取 backend/.env 中 ELASTICSEARCH_USERNAME / PASSWORD(与 es_node 同样的清洗)。
es_auth_user() {
    local raw
    raw=$(grep -E '^[[:space:]]*ELASTICSEARCH_USERNAME[[:space:]]*=' "$BACKEND_ENV" 2>/dev/null | head -n1 | cut -d= -f2-)
    printf '%s' "$raw" | sed 's/[[:space:]]#.*$//' | tr -d "\"'[:space:]"
}
es_auth_pass() {
    local raw
    raw=$(grep -E '^[[:space:]]*ELASTICSEARCH_PASSWORD[[:space:]]*=' "$BACKEND_ENV" 2>/dev/null | head -n1 | cut -d= -f2-)
    printf '%s' "$raw" | sed 's/[[:space:]]#.*$//' | tr -d "\"'[:space:]"
}

# 统一的 ES curl 调用:自动带 -k(HTTPS 自签证书放行)和 Basic 认证(若 .env 配了账号密码)。
# 用法: es_curl <url> [额外 curl 参数...]
es_curl() {
    local url="$1"; shift
    local user pass auth_args=()
    user=$(es_auth_user)
    pass=$(es_auth_pass)
    if [ -n "$user" ] && [ -n "$pass" ]; then
        auth_args+=( --user "${user}:${pass}" )
    fi
    curl -sk "${auth_args[@]}" "$@" "$url"
}

usage() {
    cat <<EOF
用法: $0 {install|start|stop|restart|status|logs} [--prod] [--no-build]

命令:
  install  安装生产运行环境 (systemd 单元 + logrotate, 仅 --prod; 首次/升级后执行一次)
  start    启动服务
  stop     停止服务
  restart  重启服务
  status   查看服务状态
  logs     查看日志

模式:
  (默认)  开发模式 (npm run dev)
  --prod   生产模式 (systemd 单元守护 + rsshub 容器; ES 为外部连接)

生产模式选项 (仅 start/restart --prod):
  --no-build  跳过构建 (仅启动已有产物)

示例:
  $0 install --prod             # 首次: 安装 systemd 单元 + 日志轮转
  $0 start                      # 开发模式启动
  $0 start --prod               # 生产发布 (build+启动+迁移+验证)
  $0 start --prod --no-build    # 生产启动 (跳过构建)
  $0 status --prod              # 生产状态 + 健康检查
  $0 logs --prod backend        # 查看 backend 日志
  $0 logs --prod rsshub         # 查看 rsshub 日志
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
# 生产模式 (systemd 守护)
# ============================================================

prod_units_installed() {
    [ -f "$SYSTEMD_DIR/$BACKEND_UNIT" ] && [ -f "$SYSTEMD_DIR/$FRONTEND_UNIT" ]
}

prod_require_units() {
    if ! prod_units_installed; then
        echo "        Error: systemd 单元未安装 ($SYSTEMD_DIR/$BACKEND_UNIT 等不存在)"
        echo "               首次部署或脚本升级后请先执行: $0 install --prod"
        exit 1
    fi
}

# 安装生产运行环境: 生成两个 systemd 单元 + logrotate 配置, daemon-reload + enable。
# 幂等: 重复执行只是覆盖同样的文件。只安装不启动 (启动走 start --prod)。
prod_install() {
    echo "[install] 安装生产运行环境 (systemd 单元 + 日志轮转)..."

    if [ "$(id -u)" -ne 0 ]; then
        echo "        Error: 需要 root 运行 (写入 $SYSTEMD_DIR 与 /etc/logrotate.d)"
        exit 1
    fi

    local node_bin next_bin
    node_bin=$(command -v node || true)
    if [ -z "$node_bin" ]; then
        echo "        Error: node 未安装"
        exit 1
    fi
    # npm workspaces 会把 next 提升到仓库根 node_modules, frontend/node_modules 下未必有
    next_bin="$FRONTEND_DIR/node_modules/next/dist/bin/next"
    [ -f "$next_bin" ] || next_bin="$PROJECT_DIR/node_modules/next/dist/bin/next"
    if [ ! -f "$next_bin" ]; then
        echo "        Error: 未找到 next 可执行文件 (先执行 npm ci 安装依赖)"
        exit 1
    fi

    echo "        node: $node_bin ($("$node_bin" --version))"
    echo "        next: $next_bin"

    # backend 单元。StartLimitIntervalSec=0: DB/ES 等外部依赖抖动导致连续崩溃时
    # 不进入 failed 放弃态,持续按 RestartSec 重试(单机个人项目,宁可重试不要躺平)。
    cat > "$SYSTEMD_DIR/$BACKEND_UNIT" <<EOF
[Unit]
Description=CMS-NG Backend (NestJS)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=$BACKEND_DIR
Environment=NODE_ENV=production
ExecStart=$node_bin dist/src/main
Restart=on-failure
RestartSec=5
# 优雅退出: SIGTERM 后最多等 15s 再 SIGKILL (替代旧 nohup 脚本的 2s 后 kill -9)
TimeoutStopSec=15
# 日志仍落仓库根 .cms-ng-backend.log (logs --prod 不变), journald 同时留存:
# journalctl -u $BACKEND_UNIT -f
StandardOutput=append:$BACKEND_LOG_FILE
StandardError=append:$BACKEND_LOG_FILE

[Install]
WantedBy=multi-user.target
EOF
    echo "        已写入 $SYSTEMD_DIR/$BACKEND_UNIT"

    # frontend 单元: 直跑 next bin 而非 npm run start, 去掉 npm 包装层,
    # 进程树干净、SIGTERM 直接送达 next-server。
    cat > "$SYSTEMD_DIR/$FRONTEND_UNIT" <<EOF
[Unit]
Description=CMS-NG Frontend (Next.js)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=$FRONTEND_DIR
Environment=NODE_ENV=production
ExecStart=$node_bin $next_bin start
Restart=on-failure
RestartSec=5
TimeoutStopSec=15
StandardOutput=append:$FRONTEND_LOG_FILE
StandardError=append:$FRONTEND_LOG_FILE

[Install]
WantedBy=multi-user.target
EOF
    echo "        已写入 $SYSTEMD_DIR/$FRONTEND_UNIT"

    # 日志轮转: systemd append 写文件, copytruncate 原地截断, 无需通知进程
    if command -v logrotate > /dev/null 2>&1; then
        cat > "$LOGROTATE_CONF" <<EOF
$BACKEND_LOG_FILE $FRONTEND_LOG_FILE $LOG_FILE {
    daily
    rotate 14
    compress
    missingok
    notifempty
    copytruncate
}
EOF
        echo "        已写入 $LOGROTATE_CONF (daily, 保留 14 份)"
    else
        echo "        Warn: 未安装 logrotate, 跳过日志轮转配置"
    fi

    systemctl daemon-reload
    systemctl enable "$BACKEND_UNIT" "$FRONTEND_UNIT" > /dev/null 2>&1
    echo "        已 enable (开机自启): $BACKEND_UNIT, $FRONTEND_UNIT"
    echo ""
    echo "        安装完成。启动服务: $0 start --prod [--no-build]"
    echo "        从旧 nohup 方式升级: 先 pkill 旧进程, 再 $0 start --prod --no-build"
}

prod_preflight() {
    echo "[1/8] 前置检查..."

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
    # 生产环境直连 .env 中 ELASTICSEARCH_NODE 配置的 ES(远端/云端/本地均可),不再启动本地容器。
    if es_enabled; then
        local node
        node=$(es_node)
        # 可达性(非致命):ES 不可达时检索降级 LIKE。
        # es_curl 自动处理 HTTPS 自签证书(-k)和 Basic 认证(ES 8.x xpack security)
        if es_curl "${node}/_cluster/health" -f -o /dev/null 2>/dev/null; then
            echo "        Elasticsearch OK ($node)"
        else
            echo "        Warn: ELASTICSEARCH_ENABLED=true 但 $node 暂不可达"
            echo "               检索将降级 LIKE;请检查 ELASTICSEARCH_NODE / 凭证 / 网络连通性"
        fi
    fi
}

prod_prisma_check_and_generate() {
    # 注意:本步骤只做预检(报告 schema 与 client 是否一致),不在此生成 client。
    # 实际生成在 prod_build 的 npm ci 之后执行--npm ci 会重置 node_modules,
    # 在此生成会被冲掉,所以生成时机必须在 npm ci 之后、nest build 之前。
    if has_flag "--no-build" "$@"; then
        echo "[2/8] 跳过 Prisma Client 检查 (--no-build)"
        return
    fi

    if [ ! -f "$PRISMA_SCHEMA" ]; then
        echo "[2/8] 跳过 Prisma Client 检查 (未找到 $PRISMA_SCHEMA)"
        return
    fi

    echo "[2/8] 检查 Prisma Client 是否需要在 build 阶段重新生成..."

    local current_hash=""
    if command -v sha256sum &> /dev/null; then
        current_hash=$(sha256sum "$PRISMA_SCHEMA" | awk '{print $1}')
    elif command -v shasum &> /dev/null; then
        current_hash=$(shasum -a 256 "$PRISMA_SCHEMA" | awk '{print $1}')
    fi

    local client_missing=false
    if [ ! -d "$PROJECT_DIR/node_modules/.prisma/client" ]; then
        client_missing=true
    fi

    if [ "$client_missing" = true ]; then
        echo "        Prisma Client 未生成，将在 build 阶段 (npm ci 后) 生成"
    elif [ -f "$PRISMA_CLIENT_HASH_FILE" ]; then
        local saved_hash=$(cat "$PRISMA_CLIENT_HASH_FILE" 2>/dev/null | tr -d '[:space:]')
        if [ "$current_hash" != "$saved_hash" ]; then
            echo "        schema.prisma 已变更，将在 build 阶段 (npm ci 后) 重新生成"
        else
            echo "        Prisma Client hash 一致 (build 阶段 npm ci 后仍会重新生成以保证一致)"
        fi
    else
        echo "        未找到 Prisma Client hash 记录，将在 build 阶段 (npm ci 后) 生成"
    fi
}

prod_build() {
    if has_flag "--no-build" "$@"; then
        echo "[3/8] 跳过构建 (--no-build)"
        return
    fi

    echo "[3/8] 构建 (可能需要 3-10 分钟)..."

    # 部署机不会自己装依赖:新代码引入的新包(如 helmet/@nestjs/throttler)
    # 不在旧 node_modules 里,缺了会在启动时才崩。每次发布先按 lockfile 同步。
    echo "        同步依赖 (npm ci)..."
    if ! (cd "$PROJECT_DIR" && npm ci >/tmp/cms-ng-build.log 2>&1); then
        echo "        ✗ npm ci 失败,日志末尾:"
        tail -n 20 /tmp/cms-ng-build.log
        exit 1
    fi

    # npm ci 会重置 node_modules,把之前 prisma generate 的产物冲掉,
    # 必须在 npm ci 之后、nest build 之前重新生成 Prisma Client,
    # 否则 schema 与 client 类型不一致导致 backend 编译失败。
    echo "        生成 Prisma Client (npm ci 后)..."
    (cd "$BACKEND_DIR" && npx prisma generate >/tmp/cms-ng-build.log 2>&1) || {
        echo "        ✗ prisma generate 失败,日志末尾:"
        tail -n 20 /tmp/cms-ng-build.log
        exit 1
    }
    # 记录 schema hash,供下次发布预检比对
    if command -v sha256sum &> /dev/null; then
        sha256sum "$PRISMA_SCHEMA" | awk '{print $1}' > "$PRISMA_CLIENT_HASH_FILE"
    elif command -v shasum &> /dev/null; then
        shasum -a 256 "$PRISMA_SCHEMA" | awk '{print $1}' > "$PRISMA_CLIENT_HASH_FILE"
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
    echo "[4/8] 停止旧应用进程 (systemd)..."

    # systemctl stop 对已停止的单元是 no-op;
    # SIGTERM -> TimeoutStopSec=15 -> SIGKILL, 优雅退出替代旧脚本的 kill -9
    systemctl stop "$BACKEND_UNIT" "$FRONTEND_UNIT" 2>/dev/null || true
    echo "        应用进程已停止"
}

prod_start_apps() {
    echo "[6/8] 启动应用 (systemd)..."

    systemctl start "$BACKEND_UNIT"
    echo "        backend  已启动 ($BACKEND_UNIT)  日志: $BACKEND_LOG_FILE"
    systemctl start "$FRONTEND_UNIT"
    echo "        frontend 已启动 ($FRONTEND_UNIT)  日志: $FRONTEND_LOG_FILE"

    echo "        启动 RSSHub 容器..."
    cd "$PROJECT_DIR"
    docker compose -f "$COMPOSE_FILE" up -d rsshub >/dev/null 2>&1 || echo "        Warning: RSSHub 启动失败 (非致命)"

    # Elasticsearch:生产环境不再启动本地容器,直连 backend/.env 中 ELASTICSEARCH_NODE
    # 配置的 ES(远端/云端/自建均可)。这里只打印连接目标便于排查,不做容器操作。
    if es_enabled; then
        echo "        Elasticsearch: 直连 $(es_node) (ELASTICSEARCH_ENABLED=true)"
    fi
}

prod_migrate() {
    echo "[5/8] 数据库迁移 (prisma migrate deploy)..."

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
    echo "[7/8] 健康验证..."
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

    # Elasticsearch(仅启用时;未响应非致命,检索降级 LIKE)。直连 .env 配置的 ES 地址。
    if es_enabled; then
        local es_status
        local node
        node=$(es_node)
        es_status=$(es_curl "${node}/_cluster/health" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
        if [ "$es_status" = "200" ]; then
            echo "        Elasticsearch ($node): ✓ 可访问"
        else
            echo "        Elasticsearch ($node): ✗ 未响应 (HTTP $es_status) - 检索降级 LIKE (非致命)"
        fi
    fi
}

prod_init_admin() {
    echo "[8/8] 初始化 admin 账号..."

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

    prod_require_units
    prod_preflight
    prod_prisma_check_and_generate "$@"
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
    echo "[stop] 停止生产模式 (systemd)..."

    prod_require_units
    systemctl stop "$BACKEND_UNIT" "$FRONTEND_UNIT"
    echo "        应用进程已停止 (rsshub 容器保留; systemd 会在开机时自动拉起, 如需禁用: systemctl disable $BACKEND_UNIT $FRONTEND_UNIT)"
}

restart_prod() {
    stop_prod
    start_prod "$@"
}

status_prod() {
    echo "[status] 生产模式 (systemd):"

    if ! prod_units_installed; then
        echo "        Warn: systemd 单元未安装, 请先执行: $0 install --prod"
    fi

    local be_active be_enabled fe_active fe_enabled
    be_active=$(systemctl is-active "$BACKEND_UNIT" 2>/dev/null || echo "unknown")
    be_enabled=$(systemctl is-enabled "$BACKEND_UNIT" 2>/dev/null || echo "unknown")
    fe_active=$(systemctl is-active "$FRONTEND_UNIT" 2>/dev/null || echo "unknown")
    fe_enabled=$(systemctl is-enabled "$FRONTEND_UNIT" 2>/dev/null || echo "unknown")

    echo "        backend:  $be_active (enabled: $be_enabled)  日志: $BACKEND_LOG_FILE"
    echo "        frontend: $fe_active (enabled: $fe_enabled)  日志: $FRONTEND_LOG_FILE"

    echo "        rsshub:   $(docker ps --filter name=cms-ng-rsshub --format '{{.Status}}' 2>/dev/null || echo '未运行')"
    if es_enabled; then
        local node
        node=$(es_node)
        local es_status
        es_status=$(es_curl "${node}/_cluster/health" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
        if [ "$es_status" = "200" ]; then
            echo "        elasticsearch: ✓ 可访问 ($node)"
        else
            echo "        elasticsearch: ✗ 未响应 ($node, HTTP $es_status) - 检索降级 LIKE"
        fi
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
            echo "[logs] backend 日志 ($BACKEND_LOG_FILE; 亦可 journalctl -u $BACKEND_UNIT -f) (Ctrl+C 退出):"
            tail -f "$BACKEND_LOG_FILE"
            ;;
        frontend)
            echo "[logs] frontend 日志 ($FRONTEND_LOG_FILE; 亦可 journalctl -u $FRONTEND_UNIT -f) (Ctrl+C 退出):"
            tail -f "$FRONTEND_LOG_FILE"
            ;;
        rsshub)
            echo "[logs] rsshub 日志 (Ctrl+C 退出):"
            docker compose -f "$COMPOSE_FILE" logs -f rsshub
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
    install)
        if is_prod "$@"; then
            prod_install
        else
            echo "install 仅用于 --prod (开发模式无需安装)"
            exit 1
        fi
        ;;
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
