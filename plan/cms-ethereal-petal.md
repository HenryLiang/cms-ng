# CMS MVP 实现计划

## Context

开发一个 CMS MVP 系统，支持图片上传管理、文章创作管理、向量语义检索和关键词检索。技术栈以简洁高效为原则，Python 一栈到底，中间件用 Docker 本地容器。

## 技术栈

- **后端**: Python 3.11 + FastAPI + SQLAlchemy
- **数据库**: PostgreSQL 16 + pgvector（Docker 容器）
- **前端**: React 18 + Ant Design 5 + Vite
- **Embedding**: sentence-transformers（文本）+ Chinese-CLIP（图片），本地推理
- **图片存储**: 本地文件系统

## 项目结构

```
demo/
├── docker-compose.yml          # PostgreSQL + pgvector 容器
├── backend/
│   ├── requirements.txt
│   ├── main.py                 # FastAPI 入口
│   ├── config.py               # 配置
│   ├── database.py             # DB 连接
│   ├── models/
│   │   ├── image.py            # Image ORM 模型
│   │   └── article.py          # Article ORM 模型
│   ├── schemas/
│   │   ├── image.py            # Image Pydantic schema
│   │   └── article.py          # Article Pydantic schema
│   ├── routers/
│   │   ├── images.py           # 图片上传/管理/搜索 API
│   │   └── articles.py         # 文章 CRUD/搜索 API
│   ├── services/
│   │   ├── embedding.py        # embedding 生成服务（CLIP + sentence-transformers）
│   │   └── search.py           # 统一搜索服务（向量 + 关键词）
│   └── uploads/                # 图片文件存储目录
└── frontend/
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── api/                # API 调用
        ├── pages/
        │   ├── Images.jsx      # 图片管理页
        │   ├── Articles.jsx    # 文章列表页
        │   ├── ArticleEdit.jsx # 文章编辑页
        │   └── Search.jsx      # 统一搜索页
        └── components/         # 通用组件
```

## 数据库设计

### images 表
| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| filename | VARCHAR | 文件名 |
| filepath | VARCHAR | 存储路径 |
| mimetype | VARCHAR | MIME 类型 |
| size | INTEGER | 文件大小(bytes) |
| description | TEXT | 图片描述(可选) |
| embedding | vector(512) | CLIP 向量 |
| tsv | TSVECTOR | 全文检索向量(基于 description) |
| created_at | TIMESTAMP | 创建时间 |

### articles 表
| 列 | 类型 | 说明 |
|---|---|---|
| id | UUID | 主键 |
| title | VARCHAR(255) | 标题 |
| content | TEXT | 正文 |
| cover_image_id | UUID | 封面图(外键→images) |
| embedding | vector(768) | 文本语义向量 |
| tsv | TSVECTOR | 全文检索向量(基于 title+content) |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 索引
- `ivfflat` 索引用于向量近似搜索（images.embedding, articles.embedding）
- GIN 索引用于全文检索（images.tsv, articles.tsv）
- 全文检索使用 zhparser 中文分词，搜索配置为 `zhparser`

## API 设计

### 图片
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/images | 上传图片（自动生成 embedding） |
| GET | /api/images | 图片列表（分页） |
| GET | /api/images/{id} | 图片详情 |
| DELETE | /api/images/{id} | 删除图片 |
| PATCH | /api/images/{id} | 更新描述（重新生成 tsv） |
| GET | /api/images/search?q=&mode=semantic|keyword|hybrid | 图片搜索 |

### 文章
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/articles | 创建文章（自动生成 embedding） |
| GET | /api/articles | 文章列表（分页） |
| GET | /api/articles/{id} | 文章详情 |
| PUT | /api/articles/{id} | 更新文章（重新生成 embedding） |
| DELETE | /api/articles/{id} | 删除文章 |
| GET | /api/articles/search?q=&mode=semantic|keyword|hybrid | 文章搜索 |

### 搜索模式
- `semantic`: 纯向量语义搜索（余弦相似度）
- `keyword`: 纯关键词全文检索（tsvector）
- `hybrid`: 语义 + 关键词加权融合

## Embedding 服务

```
embedding.py
├── TextEmbedder        # sentence-transformers (paraphrase-multilingual-MiniLM-L12-v2)
│   └── 768维，支持中文，模型小(~470MB)
└── ImageEmbedder       # Chinese-CLIP (OFA-Sys/chinese-clip-vit-base-patch16)
    └── 512维，图文共享空间，支持文本搜图
```

- 图片上传时：生成 image embedding + 描述文本 tsv
- 文章创建/更新时：拼接 title+content 生成 text embedding + tsv
- 搜索时：query 文本同时生成 text embedding（768维）和 CLIP text embedding（512维）

## Docker 配置

docker-compose.yml：
- PostgreSQL 16 + pgvector + zhparser 中文分词（自定义 Dockerfile 基于 `pgvector/pgvector:pg16`，编译安装 zhparser）
- 端口映射 5432:5432
- 持久化数据卷
- 初始化脚本自动启用 pgvector 扩展和 zhparser 中文分词扩展

## 实现步骤

### Step 1: 项目初始化
- 创建 docker-compose.yml，启动 PostgreSQL
- 创建 backend/ 目录，写 requirements.txt，初始化 FastAPI
- 配置数据库连接，建表

### Step 2: Embedding 服务
- 实现 TextEmbedder（sentence-transformers 加载）
- 实现 ImageEmbedder（Chinese-CLIP 加载）
- 启动时预加载模型，避免首次请求延迟

### Step 3: 图片管理 API
- 上传接口：接收文件 → 保存到本地 → 生成 embedding → 存 DB
- 列表/详情/删除接口
- 图片描述更新接口（同步更新 tsv）

### Step 4: 文章管理 API
- CRUD 接口：创建/更新时自动生成 embedding 和 tsv
- 支持关联封面图

### Step 5: 搜索 API
- 语义搜索：query → embedding → pgvector 余弦相似度 TOP-K
- 关键词搜索：query → tsquery → GIN 索引匹配
- 混合搜索：两种结果加权融合（RRF 或线性加权）

### Step 6: 前端
- Vite + React + Ant Design 项目初始化
- 图片管理页：上传、列表、预览、删除
- 文章编辑页：富文本编辑器 + 封面图选择
- 统一搜索页：输入关键词，切换搜索模式和类型（图片/文章）

## 验证方案

1. `docker compose up -d` 启动数据库
2. `cd backend && uvicorn main:app --reload` 启动后端
3. 访问 `/docs` 查看 Swagger 文档，测试所有 API
4. 上传图片 → 验证 embedding 生成 → 语义搜索能找到
5. 创建文章 → 验证 embedding 生成 → 关键词和语义搜索都能找到
6. 前端启动后端到端验证上传、编辑、搜索流程
