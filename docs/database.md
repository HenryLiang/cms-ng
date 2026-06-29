# 数据库配置备忘

## MySQL（外部中间件）

MySQL 8 不再随 `docker-compose` 启动，由独立宿主或云 RDS 提供。

| 项目 | 值 |
|------|-----|
| 引擎版本 | MySQL 8.x |
| 字符集 | `utf8mb4` |
| 字符序 | `utf8mb4_unicode_ci` |
| 数据库名 | `cms_ng`（需事先建好） |
| 认证插件 | `mysql_native_password`（如 Prisma 报 caching_sha2_password 错误请按此调整） |

### 连接 URL（环境变量 `DATABASE_URL`）

格式：

```
mysql://USER:PASSWORD@HOST:PORT/DATABASE
```

示例：

```
# 本机开发（指向你自管的本地 MySQL）
mysql://root:root123@localhost:3306/cms_ng

# 生产（指向远程 MySQL 主机）
mysql://cms_user:strongpass@mysql.internal.example.com:3306/cms_ng
```

后端 `PrismaService` 在启动时通过 `env("DATABASE_URL")` 直接读取，无须额外配置。

### 常用命令

```bash
# 命令行连接外部 MySQL
mysql -h <HOST> -P <PORT> -u <USER> -p cms_ng

# 导出备份
mysqldump -h <HOST> -P <PORT> -u <USER> -p cms_ng > backup.sql

# 导入恢复
mysql -h <HOST> -P <PORT> -u <USER> -p cms_ng < backup.sql

# Prisma 应用迁移（开发环境，会生成新迁移文件）
cd backend && npx prisma migrate dev --name <change-name>

# Prisma 应用迁移（生产环境，不生成新文件）
cd backend && npx prisma migrate deploy && npx prisma generate
```

## Redis（外部中间件）

Redis 同样不在 compose 内，由外部实例提供（自管或云托管 Redis 皆可）。

| 项目 | 值 |
|------|-----|
| 引擎 | Redis 5+（推荐 7.x） |
| 协议 | RESP2 / RESP3 |
| 连接超时 | 服务端代码内置 `lazyConnect: true` + 重试策略 |

连接 URL（环境变量 `REDIS_URL`）：

```
# 标准
redis://HOST:PORT

# 带密码
redis://:PASSWORD@HOST:PORT

# 指定 DB
redis://HOST:PORT/2
```

`RedisService` 在 `REDIS_URL` 不可达或未设置时会 fail-open（只打 warn 日志），不会让后端启动失败 — 这是设计上故意的，便于本地开发时跳过 Redis。

## Schema 来源

数据库 Schema 由 Prisma 管理，单一定义源：

```
backend/prisma/schema.prisma
```

包含主要模型：User、Story、Article、ArticleVersion、AIOperation、TrendingTopic、PlatformPublish、AutoPublishTask、AutoPublishRun、AutoPublishArticle 等。

## 容器化范围

仓库内 docker-compose 文件仅编排 RSSHub，不再编排应用本身与数据中间件：

- `docker-compose.yml`：仅 `rsshub` 一个服务（dev 与 prod 共用，端口 `1200`）
- 应用（backend + frontend）以宿主机进程运行，由 nginx 反代；生产发布由 `scripts/cms-ng-service.sh --prod` 管理（模板见 `backend/.env.example`）
