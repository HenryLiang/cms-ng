#!/bin/bash
set -e

# ============================================================
# CMS-NG 一键更新脚本
# 用法: GITHUB_TOKEN=ghp_xxx ./update-cms-ng.sh
# ============================================================

PROJECT_DIR="/root/cms-ng"
BACKUP_DIR="/root/cms-ng-backup-$(date +%Y%m%d-%H%M%S)"
GITHUB_REPO="HenryLiang/cms-ng"
BRANCH="main"
COMPOSE_FILE="docker-compose.prod.yml"

echo "========================================"
echo "  CMS-NG Deploy Update"
echo "  Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

# ---------- 0. 前置检查 ----------
if [ "$(id -u)" != "0" ]; then
    echo "Error: 请使用 root 用户执行此脚本"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "Error: Docker 未安装"
    exit 1
fi

# 校验 backend/.env（compose 通过 env_file 读取）存在且含必要变量
BACKEND_ENV="$PROJECT_DIR/backend/.env"
if [ ! -f "$BACKEND_ENV" ]; then
    # 首次部署 / 目录尚未创建时仅提示，不中断；恢复步骤会从备份回填
    echo "Warning: $BACKEND_ENV 不存在，稍后从备份恢复或首次部署时需手动放置"
    echo "         模板见 backend/.env.example"
else
    for var in DATABASE_URL REDIS_URL JWT_SECRET KIMI_API_KEY; do
        if ! grep -qE "^${var}=" "$BACKEND_ENV"; then
            echo "Error: $BACKEND_ENV 缺少 $var (backend 容器将拿到空值)"
            echo "       模板见 backend/.env.example"
            exit 1
        fi
    done
fi

# ---------- 1. 备份当前部署 ----------
echo "[1/7] 备份当前部署 -> $BACKUP_DIR"
if [ -d "$PROJECT_DIR" ]; then
    cp -a "$PROJECT_DIR" "$BACKUP_DIR"
    echo "      Backup OK"
else
    echo "      Warning: $PROJECT_DIR 不存在，将全新部署"
    mkdir -p "$PROJECT_DIR"
fi

# ---------- 2. 拉取最新代码 ----------
echo ""
echo "[2/7] 拉取最新代码 (branch: $BRANCH)"
cd /root

if [ -d "$PROJECT_DIR/.git" ]; then
    # 方式 A: Git 仓库直接更新
    echo "      检测到 git 仓库，执行 git pull..."
    cd "$PROJECT_DIR"
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"
    echo "      Git pull OK"
else
    # 方式 B: 非 git 仓库，通过 GitHub API/zipball 下载
    echo "      非 git 仓库，通过 GitHub 下载最新代码..."

    rm -rf /tmp/cms-ng-update /tmp/cms-ng.zip
    mkdir -p /tmp/cms-ng-update

    DOWNLOAD_OK=false

    # 尝试 1: 使用 GitHub Token (私有仓库必需)
    if [ -n "$GITHUB_TOKEN" ]; then
        echo "      使用 GitHub Token 下载..."
        if curl -fsL -H "Authorization: Bearer $GITHUB_TOKEN" \
               -H "Accept: application/vnd.github.v3+json" \
               "https://api.github.com/repos/$GITHUB_REPO/zipball/$BRANCH" \
               -o /tmp/cms-ng.zip 2>/dev/null; then

            # 验证是 zip 不是 JSON 错误
            if file /tmp/cms-ng.zip | grep -q "Zip"; then
                DOWNLOAD_OK=true
                echo "      Token 下载成功"
            else
                echo "      Token 验证失败 (返回非zip内容)，尝试其他方式..."
            fi
        fi
    fi

    # 尝试 2: git clone (token 在 URL 中)
    if [ "$DOWNLOAD_OK" = false ] && [ -n "$GITHUB_TOKEN" ]; then
        echo "      尝试 git clone..."
        rm -rf /tmp/cms-ng-git
        if git clone "https://oauth2:${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git" \
                      /tmp/cms-ng-git "$BRANCH" 2>/dev/null; then
            rm -rf "$PROJECT_DIR"
            mv /tmp/cms-ng-git "$PROJECT_DIR"
            DOWNLOAD_OK=true
            echo "      Git clone 成功"
        else
            echo "      Git clone 失败"
        fi
    fi

    # 尝试 3: 公开仓库直接下载
    if [ "$DOWNLOAD_OK" = false ]; then
        echo "      尝试公开 zipball 下载..."
        if curl -fsL "https://github.com/${GITHUB_REPO}/archive/refs/heads/${BRANCH}.zip" \
                   -o /tmp/cms-ng.zip 2>/dev/null; then
            if file /tmp/cms-ng.zip | grep -q "Zip"; then
                DOWNLOAD_OK=true
                echo "      公开下载成功"
            fi
        fi
    fi

    if [ "$DOWNLOAD_OK" = false ]; then
        echo ""
        echo "Error: 所有下载方式均失败"
        echo "      1) 如果是私有仓库，请设置 GITHUB_TOKEN 环境变量"
        echo "      2) 检查网络连接"
        echo "      3) 检查仓库地址是否正确: $GITHUB_REPO"
        echo ""
        echo "恢复备份..."
        rm -rf "$PROJECT_DIR"
        mv "$BACKUP_DIR" "$PROJECT_DIR"
        exit 1
    fi

    # 解压并覆盖
    if [ -f /tmp/cms-ng.zip ]; then
        echo "      解压代码..."
        unzip -q -o /tmp/cms-ng.zip -d /tmp/cms-ng-update
        # GitHub zipball 解压后目录名可能是 HenryLiang-cms-ng-xxxxxxx
        SRC_DIR=$(find /tmp/cms-ng-update -maxdepth 1 -type d | tail -1)
        if [ -n "$SRC_DIR" ] && [ "$SRC_DIR" != "/tmp/cms-ng-update" ]; then
            rm -rf "$PROJECT_DIR"
            mv "$SRC_DIR" "$PROJECT_DIR"
        fi
        rm -rf /tmp/cms-ng-update /tmp/cms-ng.zip
        echo "      解压完成"
    fi
fi

# ---------- 3. 恢复环境配置 ----------
echo ""
echo "[3/7] 恢复环境配置"
cd "$PROJECT_DIR"

# 恢复 backend/.env（git pull / zipball 不带它进来，因为已 gitignore）
if [ -f "$BACKUP_DIR/backend/.env" ]; then
    mkdir -p "$PROJECT_DIR/backend"
    cp "$BACKUP_DIR/backend/.env" "$PROJECT_DIR/backend/.env"
    echo "      backend/.env 已恢复"
fi

# 兼容旧版本：也恢复 frontend/.env.local（若存在）
if [ -f "$BACKUP_DIR/frontend/.env.local" ]; then
    mkdir -p "$PROJECT_DIR/frontend"
    cp "$BACKUP_DIR/frontend/.env.local" "$PROJECT_DIR/frontend/.env.local"
    echo "      frontend/.env.local 已恢复"
fi

# 确保 docker-compose.prod.yml 端口正确
if [ -f "$PROJECT_DIR/docker-compose.prod.yml" ]; then
    sed -i 's/3000:3000/80:3000/g' "$PROJECT_DIR/docker-compose.prod.yml"
    echo "      端口映射已确认 (80:3000)"
fi

# ---------- 4. 构建 Docker 镜像 ----------
echo ""
echo "[4/7] 构建 Docker 镜像 (可能需要 5-15 分钟)..."
docker compose -f "$COMPOSE_FILE" build --no-cache backend frontend
echo "      构建完成"

# ---------- 5. 启动服务 ----------
echo ""
echo "[5/7] 启动服务..."
docker compose -f "$COMPOSE_FILE" up -d
echo "      服务已启动"

# ---------- 6. 数据库迁移 ----------
echo ""
echo "[6/7] 执行数据库迁移..."

# 等待 backend 容器进入可 exec 状态（最多 ~30s）
# MySQL 已外部部署、应处于稳态，无需等待容器内 mysqld 启动
for i in {1..15}; do
    if docker compose -f "$COMPOSE_FILE" exec -T backend node -e "process.exit(0)" 2>/dev/null; then
        break
    fi
    sleep 2
done

if docker compose -f "$COMPOSE_FILE" exec -T backend npx prisma migrate deploy 2>&1; then
    echo "      迁移完成"
else
    echo "      Warning: 迁移执行失败，请手动检查 (常见原因：DATABASE_URL 不可达 / .env 未挂入容器)"
fi

# ---------- 7. 验证 ----------
echo ""
echo "[7/7] 验证部署..."
sleep 3

FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:80/login || echo "000")
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/users || echo "000")

echo "      Frontend (http://43.134.11.194): HTTP $FRONTEND_STATUS"
echo "      Backend  (http://43.134.11.194:3001): HTTP $BACKEND_STATUS"

# 显示容器状态
echo ""
echo "容器状态:"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "========================================"
echo "  更新完成: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  备份位置: $BACKUP_DIR"
echo "========================================"

# 清理 7 天前的备份
echo ""
echo "清理旧备份..."
find /root -maxdepth 1 -name 'cms-ng-backup-*' -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true
