# 数据库配置备忘

## MySQL

| 项目 | 值 |
|------|-----|
| 容器名 | `cms-ng-mysql` |
| 镜像 | `mysql:8.0` |
| 端口 | `3307`（宿主机）→ `3306`（容器内） |
| Root 密码 | `root123` |
| 数据库名 | `cms_ng` |
| 字符集 | `utf8mb4` |

### 连接 URL

```
mysql://root:root123@localhost:3307/cms_ng
```

> 后端服务通过 Docker 网络访问容器名 `cms-ng-mysql`。
> 本地命令行访问需用 `localhost:3306`。

### 常用命令

```bash
# 启动所有服务
docker-compose up -d

# 进入 MySQL 容器
docker exec -it cms-ng-mysql mysql -u root -proot123 cms_ng

# 导出备份
docker exec cms-ng-mysql mysqldump -u root -proot123 cms_ng > backup.sql

# 导入恢复
docker exec -i cms-ng-mysql mysql -u root -proot123 cms_ng < backup.sql

# Prisma 重建表结构
cd backend && npx prisma migrate deploy && npx prisma generate
```

## Redis

| 项目 | 值 |
|------|-----|
| 容器名 | `cms-ng-redis` |
| 镜像 | `redis:7-alpine` |
| 端口 | `6379` |

## 数据卷（持久化）

- `mysql_data` — MySQL 数据文件
- `redis_data` — Redis 数据文件

## Schema 来源

数据库 Schema 由 Prisma 管理，单一定义源：

```
backend/prisma/schema.prisma
```

包含模型：User、Story、Article、ArticleVersion、AIOperation、TrendingTopic
