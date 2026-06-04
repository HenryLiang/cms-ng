# 腾讯云 COS 对象存储改造设计

**日期**: 2026-06-04
**作者**: Chao Liang
**状态**: 待 review
**关联 issue**: WordPress 发布封面图未同步(2026-06-03 报告)

---

## 1. 目标与背景

### 1.1 背景

当前 CMS-NG 后端将 AI 生成的图片直接写入本地文件系统 `backend/uploads/articles/<articleId>/`,通过 `express.static` 在 `/uploads/...` 路径对外提供静态访问。数据库 `Article.coverImage` 字段存储相对路径如 `/uploads/articles/50ddda8a.../generated_1780482724999.png`。

这一架构在 2026-06-03 引出两个连锁问题:

1. **WordPress 封面图同步失败** — `WordPressService.publish()` 在 WordPress 站点(https://wuququ.com)发起 `fetch` 下载 `http://localhost:3001/uploads/...`,而 `BACKEND_URL` 在生产环境未配置,默认的 `localhost:3001` 从 WordPress 服务器视角无法访问,`uploadImage()` 静默返回 `null`,`featured_media` 未设置。
2. **后端容器有状态** — 图片存储在容器内,无法任意重启/扩缩容/迁移节点。

### 1.2 目标

- 将所有 AI 生成图片(及未来用户上传、富文本编辑器插图)统一存储到腾讯云 COS
- 数据库 `Article.coverImage` 存储**公网可访问的绝对 URL**(形如 `https://<bucket>-<appid>.cos.<region>.myqcloud.com/...`)
- 根除 WordPress 封面图同步问题(图片本身已经是 https:// 绝对 URL,WordPress 服务无需再去 fetch 后端)
- 抽象出 `StorageService` 接口,未来接 S3/OSS/微信公众号素材无侵入
- **完全替换**旧本地存储逻辑,旧 17 个文件和新代码不兼容,**访问失败无所谓**

### 1.3 非目标

- ❌ 不迁移任何旧数据
- ❌ 不保留 `backend/uploads/` 目录或 `/uploads` 静态路由
- ❌ 不做图片压缩/缩略图/CDN WebP 转码(后续单独议题)
- ❌ 不做 COS 故障降级到本地(COS 不可用时直接报错)
- ❌ 不做上传鉴权(本设计假设未来上传也走后端中转,COS 公有读)

---

## 2. 架构

### 2.1 总体架构

```
┌─────────────────────────────────────────────────────────┐
│ AIService.generateArticleImage()                        │
│   │                                                     │
│   ├─ 1. fetch temp image from Seedream (stream)         │
│   ├─ 2. storageService.put(key, buffer, contentType)    │
│   │       ↓                                             │
│   │   CosStorageService.put() → cos.putObject()         │
│   │       ↓                                             │
│   │   return { url: 'https://<bucket>.cos.<region>.…' } │
│   │                                                     │
│   └─ 3. update Article.coverImage = url                 │
└─────────────────────────────────────────────────────────┘

前端:
  Article.coverImage 直接是 https://,无需拼接 NEXT_PUBLIC_API_URL

WordPress 服务:
  uploadImage(url) 直接用,无需 resolveImageUrl 或 BACKEND_URL
```

### 2.2 模块拆分

新增 `backend/src/storage/` 模块,包含 3 个文件:

| 文件 | 角色 |
|---|---|
| `storage.service.ts` | 接口定义 + `STORAGE_SERVICE` InjectionToken |
| `cos-storage.service.ts` | `CosStorageService implements StorageService` |
| `storage.module.ts` | NestJS Module,导出 `STORAGE_SERVICE` |

### 2.3 关键接口

```ts
// storage.service.ts
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface PutResult {
  /** 公开可访问的完整 URL(末尾无 /) */
  url: string;
  /** 对象 key,供后续 delete 用 */
  key: string;
}

export interface StorageService {
  put(key: string, body: Buffer, contentType?: string): Promise<PutResult>;
  delete(key: string): Promise<void>;
}
```

### 2.4 COS 客户端配置

```ts
// cos-storage.service.ts
@Injectable()
export class CosStorageService implements StorageService {
  private readonly client: COS;
  private readonly bucket: string;
  private readonly region: string;
  private readonly baseUrl: string;
  private static readonly UPLOAD_TIMEOUT_MS = 60_000;

  constructor(private config: ConfigService) {
    const secretId = this.config.get<string>('COS_SECRET_ID');
    const secretKey = this.config.get<string>('COS_SECRET_KEY');
    if (!secretId || !secretKey) {
      throw new Error('COS_SECRET_ID 和 COS_SECRET_KEY 必须配置');
    }
    this.client = new COS({ SecretId: secretId, SecretKey: secretKey });
    this.bucket = this.config.get<string>('COS_BUCKET', '');
    this.region = this.config.get<string>('COS_REGION', 'ap-shanghai');
    this.baseUrl = this.config.get<string>(
      'COS_BASE_URL',
      `https://${this.bucket}.cos.${this.region}.myqcloud.com`,
    );
  }

  async put(key: string, body: Buffer, contentType = 'application/octet-stream'): Promise<PutResult> {
    await this.client.putObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    return { url: `${this.baseUrl.replace(/\/$/, '')}/${key}`, key };
  }

  async delete(key: string): Promise<void> {
    await this.client.deleteObject({ Bucket: this.bucket, Region: this.region, Key: key });
  }
}
```

### 2.5 key 命名规范

| 调用方 | key 模式 | 示例 |
|---|---|---|
| AI 生成封面图 | `cms-ng/articles/<articleId>/generated_<timestamp>.<ext>` | `cms-ng/articles/50ddda8a-.../generated_1780482724999.png` |
| 未来富文本上传 | `cms-ng/uploads/<yyyy>/<mm>/<uuid>.<ext>` | `cms-ng/uploads/2026/06/<uuid>.jpg` |
| 未来用户头像 | `cms-ng/avatars/<userId>.<ext>` | `cms-ng/avatars/u-123.jpg` |

`cms-ng/` 前缀用于在 bucket 内做逻辑隔离,方便后续按业务线/模块做 IAM 拆分。

---

## 3. 数据流

### 3.1 AI 封面图生成(核心场景)

```
调用栈:
  AIService.generateArticleImage(userId, articleId, title, content, opts)
    │
    ├─ 调用 Seedream API → tempImageUrl (临时 URL,几小时过期)
    │
    ├─ 1. const buffer = await fetchAsBuffer(tempImageUrl)
    │
    ├─ 2. const ext = contentType.split('/')[1] || 'png'
    │
    ├─ 3. const key = `cms-ng/articles/${articleId}/generated_${Date.now()}.${ext}`
    │
    ├─ 4. const { url } = await this.storageService.put(key, buffer, contentType)
    │
    └─ 5. return { url, ...其他元数据 }
         │
         └─ articles.service.ts: articles.update({ coverImage: url })
```

错误处理:
- 步骤 1 失败(Seedream URL fetch 失败):抛 `BadGatewayException`,AIOperation 记 status=FAILED
- 步骤 4 失败(COS 不可用或鉴权错误):抛 `ServiceUnavailableException`,AIOperation 记 status=FAILED,**不写数据库,文章 coverImage 保持原值**

### 3.2 WordPress 发布(根除旧问题)

发布流程 `WordPressService.publish(articleId)`:

```ts
// 旧逻辑(L249-255)— 删掉
if (article.coverImage) {
  const coverUrl = this.resolveImageUrl(article.coverImage);  // ❌ 删
  const uploaded = await this.uploadImage(coverUrl);
  ...
}

// 新逻辑
if (article.coverImage) {
  // article.coverImage 已是 https://... 绝对 URL,直接传
  const uploaded = await this.uploadImage(article.coverImage);
  if (uploaded) featuredMediaId = uploaded.id;
}
```

`processContentImages()` 同样改造:
- 删除 `resolveImageUrl` 调用,直接用原始 `src`
- 保留"已上传到 WordPress 的图跳过"逻辑(`if (absoluteUrl.startsWith(this.siteUrl)) continue`)

`WordPressService` 构造函数中删除:
- `this.backendUrl` 字段
- `BACKEND_URL` config 读取

`WordPressService` 私有方法删除:
- `resolveImageUrl()` 整段

### 3.3 前端展示

- `Article.coverImage` 直接是 `https://...` 完整 URL
- 前端 `frontend/src/app/dashboard/articles/[id]/page.tsx` 第 845/1335 行 `src={...NEXT_PUBLIC_API_URL + article.coverImage}` 改为 `src={article.coverImage}`(去掉拼接)
- **新代码完全不再依赖 `NEXT_PUBLIC_API_URL` 来拼图片**
- **旧文章(17 篇)的相对路径**(`/uploads/articles/...`)在展示时浏览器会得到无效 URL,加载失败;这是用户已接受的代价,本设计不做兼容

---

## 4. 错误处理

| 失败点 | 行为 | 可见性 |
|---|---|---|
| Seedream 临时 URL 过期/fetch 失败 | 抛 `BadGatewayException`,AIOperation.status=FAILED | 日志 + 前端 toast |
| COS 鉴权失败(SecretId/Key 错) | 启动时构造函数抛 Error,后端启动失败 | 启动日志清晰 |
| COS 网络不可达 | `putObject` 抛 `CosServiceError`,AIService 捕获后抛 `ServiceUnavailableException` | 日志 ERROR + AIOperation 记 error |
| COS 5xx | 同上,直接抛错不重试(用户选硬失败) | 日志 |
| 文章 coverImage 已存在,新生成又失败 | **保留旧值,本次失败仅记日志** | 不覆盖 |

**降级策略**:用户确认硬失败 — COS 不可用即报错,不通融。

---

## 5. 配置

### 5.1 新增环境变量(`backend/.env`)

```env
# ===== 腾讯云 COS 对象存储 =====
# 公有读 + 私有写 bucket,WordPress/前端通过 https:// 直接读取
COS_SECRET_ID="AKIDxxxxxxxxxxxxxxxxxxxxxx"
COS_SECRET_KEY="xxxxxxxxxxxxxxxxxxxxxx"
COS_BUCKET="cms-ng-prod-imgs-1300000000"
COS_REGION="ap-shanghai"
# 可选 — 不填则用默认 https://<bucket>.cos.<region>.myqcloud.com
COS_BASE_URL=""
```

### 5.2 移除的环境变量

- `UPLOAD_DIR` — 不再需要
- `BACKEND_URL` — 上一轮修复的临时变量,本设计根治后删除

### 5.3 .env.example 同步更新

```env
# ===== 腾讯云 COS =====
COS_SECRET_ID="your-cos-secret-id"
COS_SECRET_KEY="your-cos-secret-key"
COS_BUCKET="your-bucket-1300000000"
COS_REGION="ap-shanghai"
# COS_BASE_URL="https://cdn.your-domain.com"   # 留空走默认域名
```

---

## 6. 文件改动清单

### 6.1 新增文件 (3)

| 文件 | 行数估计 | 角色 |
|---|---|---|
| `backend/src/storage/storage.service.ts` | ~30 | 接口 + DI token |
| `backend/src/storage/cos-storage.service.ts` | ~80 | COS SDK 封装 |
| `backend/src/storage/storage.module.ts` | ~20 | NestJS Module |

### 6.2 修改文件 (7)

| 文件 | 改动 |
|---|---|
| `backend/src/ai/ai.service.ts` | `downloadImage()` 改造为 `storageService.put()`;删除 `import fs/path`;删除 `uploadDir` 字段(若不再别处用) |
| `backend/src/ai/ai.service.spec.ts` | 改 mock:`storageService.put()` 替代 `downloadImage()` 私有方法 spy |
| `backend/src/app.module.ts` | `imports: [..., StorageModule]` |
| `backend/src/main.ts` | **删除** `app.use('/uploads', express.static(...))`;删除 `path` import |
| `backend/src/channels/wordpress.service.ts` | 删 `backendUrl`/`resolveImageUrl`/`BACKEND_URL`;`uploadImage` 直接接收绝对 URL |
| `backend/src/channels/wordpress.service.spec.ts` | 移除 BACKEND_URL 相关 mock;测试数据 `coverImage` 改为 `https://...` 绝对 URL |
| `backend/.env.example` | 新增 COS 配置段;删除 `UPLOAD_DIR` 和 `BACKEND_URL` |

### 6.3 前端改动 (1,小)

| 文件 | 改动 |
|---|---|
| `frontend/src/app/dashboard/articles/[id]/page.tsx` | 第 845、1335 行去掉 `NEXT_PUBLIC_API_URL` 拼接,直接用 `article.coverImage` |

### 6.4 删除/清理

- `backend/uploads/` 目录(代码侧 fs/path 引用已在 6.2 改造时清除,部署时 `rm -rf` 即可)
- `.env` 中删除 `UPLOAD_DIR` 和 `BACKEND_URL`(若仍在)
- `docs/` 中提到 `UPLOAD_DIR`/`BACKEND_URL`/`/uploads` 静态服务的地方同步更新(若有,grep 出来人工清理)

---

## 7. 依赖

### 7.1 新增 npm 包

```bash
cd backend && npm install cos-nodejs-sdk-v5
```

- `cos-nodejs-sdk-v5@^2.14.0`(腾讯云官方维护,体积 ~1MB,支持 V5 API + V4 签名,使用 Promise/async)

### 7.2 TypeScript 类型

- 腾讯云 SDK 自带 `.d.ts`,无需 `@types/cos-nodejs-sdk-v5`

### 7.3 包体积影响

- `cos-nodejs-sdk-v5` 本身 + 间接依赖(`mime-types`、`xml2js` 等)预计 +5MB node_modules,运行时无影响

---

## 8. 测试

### 8.1 单元测试

#### 新增 `backend/src/storage/cos-storage.service.spec.ts`
- 构造时无 COS_SECRET_ID 或 COS_SECRET_KEY → 抛错(`Error('COS_SECRET_ID 和 COS_SECRET_KEY 必须配置')`)
- 构造时无 COS_BUCKET → `putObject` 调用时 SDK 抛错(Bucket name required)
- `put(key, buffer, 'image/png')` → 验证 cos.putObject 收到正确 Bucket/Region/Key/Body/ContentType
- `put` 返回 `url` 拼接正确:
  - 未设 `COS_BASE_URL` → `https://<bucket>.cos.<region>.myqcloud.com/<key>`
  - 设了 `COS_BASE_URL` → `<base>/<key>`(base 去掉尾部 `/`)
- `delete(key)` → 验证 cos.deleteObject 收到正确 Bucket/Region/Key

#### 改造 `backend/src/ai/ai.service.spec.ts`
- 用 `StorageService` mock 替代 `downloadImage` spy
- `generateArticleImage` 成功 → 返回 `url` 是 COS URL(`https://...`)
- COS put 失败 → 抛 `ServiceUnavailableException`,**不调用** prisma.article.update

#### 改造 `backend/src/channels/wordpress.service.spec.ts`
- 移除 `BACKEND_URL` config mock
- `coverImage: 'https://cos-bucket.cos.ap-shanghai.myqcloud.com/...'` 走通 publish 流程
- 验证 `fetch` 第一个图片下载调用 URL 就是 `https://cos-bucket..../cover.png`,不经过任何拼接

### 8.2 集成测试(可选)

- 起本地 mock COS server(用 `nock` 拦截 SDK HTTP 调用),跑通 `AIService → Storage → COS SDK` 全链路
- 不强求,单元测试 + 手动 staging 验证即可

### 8.3 手动验证清单(staging 部署后)

1. ✅ 后端启动时,无 `COS_SECRET_ID` 即拒绝启动(防遗忘配置)
2. ✅ AI 生图成功 → `Article.coverImage` 是 `https://<bucket>.cos.<region>.myqcloud.com/...`
3. ✅ 该 URL 公网可访问,返回 image/png
4. ✅ 文章发布到 WordPress,`featured_media` 正确设置,WordPress 后台和前台都看到封面图
5. ✅ 富文本编辑器插入一张图(等以后实现上传功能)→ 存储到 COS
6. ❌ 临时关掉 COS 凭据重启后端 → 启动失败,日志清晰
7. ❌ COS 不可达(改错 region)→ AI 生图 API 返回 503,前端看到错误 toast

---

## 9. 部署步骤(staging/prod)

1. 腾讯云控制台创建 COS bucket,名称建议 `cms-ng-prod-imgs-1300000000`(<130...> 是 APPID),地域 `ap-shanghai`
2. 桶策略:公有读(读不需要签名),私有写(写只能用 SecretId/Key)
3. CORS 配置:`https://cms.wuququ.com` 和 `http://localhost:3000` 允许 GET
4. 创建 CAM 子账号,授权 `QcloudCOSFullAccess` 或更细的 `QcloudCOSDataFullControl + QcloudCOSPutObject`,只给本 bucket 范围
5. 把 `SecretId/SecretKey/Bucket/Region` 写入 `backend/.env`
6. 部署新版本,旧 `backend/uploads/` 可选 `rm -rf` 或保留作历史
7. 任选一篇文章,触发 AI 重新生图,验证封面图 URL 是 COS 域名
8. 重新发布到 WordPress,验证 featured_media 生效

---

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| COS 鉴权错(开发/部署配错) | 启动时强制校验,无配置即拒绝启动 |
| COS region 错(配置不一致) | bucket 名称 + region 一起在启动时校验:`cos.headBucket()` 试探 |
| 第一次部署后,旧 17 张图访问失败 | **用户已确认可接受** — 不需迁移 |
| 之前 WordPress 服务对 `BACKEND_URL` 的依赖 | 同步删除(本设计 `BACKEND_URL` 完全移除) |
| CDN/防盗链(用户暂未要求) | 后续议题,本设计不引入 |
| COS 成本(流量/存储) | CMS 用量小,公有读+ap-shanghai 标准存储,预估月成本 < ¥5 |
| 富文本编辑器未实现上传(目前图片都从外部 URL 插入) | 本设计不实现上传,只把 `StorageService` 接口留出来,后续接 |

---

## 11. 不在本设计范围(后续议题)

1. 富文本编辑器的图片上传(上传按钮 + FormData + `StorageService.put()`),等用户单独提出
2. 用户头像上传
3. 图片压缩/缩略图/CDN WebP
4. CDN 加速 + 自定义域名(`https://cdn.wuququ.com`)
5. 防盗链(Referer/Token 鉴权)
6. 跨区复制/容灾

---

## 12. 工作量估算

| 任务 | 估计 |
|---|---|
| 写 `storage.module.ts` 三个文件 | 0.5 天 |
| 改造 `ai.service.ts` + spec | 0.5 天 |
| 改造 `wordpress.service.ts` + spec | 0.5 天 |
| 改造 `main.ts`、`.env.example`、前端拼接 | 0.25 天 |
| COS bucket 创建 + 凭据 + CORS | 0.25 天(用户操作) |
| 手动 staging 验证 + 修 bug | 0.5 天 |
| **总计** | **2-2.5 天** |
