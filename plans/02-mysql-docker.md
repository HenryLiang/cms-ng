# 计划：MySQL Docker 化 + 数据迁移

## Context

本地 MySQL（Homebrew 安装）服务无法启动，导致后端无法连接数据库。需要将 MySQL 纳入 docker-compose 统一编排，重新建库建表，并把旧数据迁移到新实例。

## 数据迁移策略

旧数据库数据通过 `mysqldump` 导出为 SQL 文件，新容器启动后导入。

## 步骤

### Step 1: 修改 docker-compose.yml

加入 MySQL 8 服务，与 redis 同网络：
- image: mysql:8
- container_name: cms-ng-mysql
- 端口: 3306:3306
- root 密码: root123
- 数据库名: cms_ng（启动时自动创建）
- 数据卷: mysql_data 持久化

### Step 2: 更新后端环境配置

`backend/.env` 中 `DATABASE_URL` 从 `localhost:3306` 改为容器名 `cms-ng-mysql:3306`。

### Step 3: 记录数据库连接信息（备忘）

在项目中创建 `docs/database.md`：
- MySQL 容器名、端口、root密码
- 数据库名、连接URL
- 常用命令（备份/恢复/进入容器）

### Step 4: 启动容器

```bash
docker-compose up -d
```

### Step 5: 数据迁移（如有旧数据）

如果旧本地 MySQL 能临时启动：
```bash
mysqldump -h localhost -u root -proot123 cms_ng > /tmp/cms_ng_backup.sql
```

然后导入新容器：
```bash
docker exec -i cms-ng-mysql mysql -u root -proot123 cms_ng < /tmp/cms_ng_backup.sql
```

如果旧库完全无法启动，则跳过迁移，直接进入 Step 6。

### Step 6: Prisma 重建表结构

```bash
cd backend
npx prisma migrate deploy      # 应用所有 migration
npx prisma generate            # 生成 Prisma Client
npx prisma db seed             # （如有种子数据）
```

### Step 7: 验证

启动后端，确认：
- 数据库连接成功
- API 接口正常响应
- 登录/注册流程可用

## 关键文件

- `docker-compose.yml`
- `backend/.env`
- `docs/database.md`（新建）
- `backend/prisma/schema.prisma`（已有，作为schema来源）
