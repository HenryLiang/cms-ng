# 腾讯云 COS 对象存储改造 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有 AI 生成图片从本地文件系统(`backend/uploads/`)迁移到腾讯云 COS 对象存储,根除 WordPress 封面图同步问题,并抽象出 `StorageService` 接口供未来扩展。

**Architecture:** 引入 `backend/src/storage/` 模块,定义 `StorageService` 接口,目前只实现 `CosStorageService`(基于 `cos-nodejs-sdk-v5`)。`AIService.downloadImage()` 改为 `storageService.put()`,`WordPressService` 同步删除 `BACKEND_URL` 和 `resolveImageUrl`。所有改动走 TDD,每 task 一个 commit。

**Tech Stack:** NestJS 11, TypeScript 5, Jest, `cos-nodejs-sdk-v5`(腾讯云官方 SDK)

**Spec:** `docs/superpowers/specs/2026-06-04-cos-storage-design.md`

---

## File Structure

| 类型 | 路径 | 角色 |
|---|---|---|
| 新建 | `backend/src/storage/storage.service.ts` | `StorageService` 接口 + `STORAGE_SERVICE` DI token + `PutResult` 类型 |
| 新建 | `backend/src/storage/cos-storage.service.ts` | `CosStorageService implements StorageService` — 调用 `cos.putObject` / `cos.deleteObject` |
| 新建 | `backend/src/storage/storage.module.ts` | NestJS Module,全局导出 `STORAGE_SERVICE` |
| 新建 | `backend/src/storage/cos-storage.service.spec.ts` | 单元测试 |
| 修改 | `backend/src/ai/ai.service.ts` | `downloadImage()` 改造为 `storageService.put()`;删除 `fs/path` 动态 import;删除 `uploadDir` 字段 |
| 修改 | `backend/src/ai/ai.service.spec.ts` | 改 mock:`storageService.put()` 替代 `downloadImage` spy |
| 修改 | `backend/src/app.module.ts` | `imports: [..., StorageModule]` |
| 修改 | `backend/src/main.ts` | 删除 `app.use('/uploads', express.static(...))`;删除 `path` import |
| 修改 | `backend/src/channels/wordpress.service.ts` | 删除 `backendUrl` 字段、`BACKEND_URL` 读取、`resolveImageUrl()` 私有方法 |
| 修改 | `backend/src/channels/wordpress.service.spec.ts` | 移除 BACKEND_URL mock,`coverImage` 改绝对 URL |
| 修改 | `backend/.env.example` | 新增 `COS_*` 配置段;删除 `UPLOAD_DIR` 和 `BACKEND_URL` |
| 修改 | `frontend/src/app/dashboard/articles/[id]/page.tsx` | 第 845、1335 行去掉 `NEXT_PUBLIC_API_URL` 拼接 |
| 清理 | `backend/uploads/` 目录 | 部署时 `rm -rf` |
| 清理 | `docs/` 中提到 `UPLOAD_DIR` / `BACKEND_URL` / `/uploads` 的文件 | grep 出来后人工修正 |

---

## Task 1: 安装 `cos-nodejs-sdk-v5`

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: 装包**

```bash
cd backend && npm install cos-nodejs-sdk-v5
```

- [ ] **Step 2: 验证 package.json 已写入**

Run: `grep "cos-nodejs-sdk-v5" backend/package.json`
Expected: `"cos-nodejs-sdk-v5": "^2.x.x",` 一行

- [ ] **Step 3: 验证 SDK 可正常 import**

Run:
```bash
cd backend && node -e "const COS = require('cos-nodejs-sdk-v5'); console.log(typeof COS);"
```
Expected: `function`

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(deps): 添加 cos-nodejs-sdk-v5 腾讯云 COS SDK"
```

---

## Task 2: StorageService 接口 + DI token

**Files:**
- Create: `backend/src/storage/storage.service.ts`
- Create: `backend/src/storage/storage.service.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `backend/src/storage/storage.service.spec.ts`:

```ts
import { STORAGE_SERVICE, StorageService, PutResult } from './storage.service';

describe('StorageService interface contract', () => {
  it('exports STORAGE_SERVICE as a unique symbol', () => {
    expect(typeof STORAGE_SERVICE).toBe('symbol');
  });

  it('StorageService interface has put and delete methods', () => {
    // 编译期断言:类型层面强制约束,运行时仅做 sanity check
    const fake: StorageService = {
      put: jest.fn(),
      delete: jest.fn(),
    };
    expect(typeof fake.put).toBe('function');
    expect(typeof fake.delete).toBe('function');
  });

  it('PutResult exposes url and key', () => {
    const r: PutResult = { url: 'https://x.com/k', key: 'k' };
    expect(r.url).toBe('https://x.com/k');
    expect(r.key).toBe('k');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/storage/storage.service.spec.ts`
Expected: FAIL — `Cannot find module './storage.service'`

- [ ] **Step 3: 创建 storage.service.ts**

```ts
/**
 * 对象存储抽象接口
 *
 * 当前实现:CosStorageService(腾讯云 COS)
 * 未来可扩展:S3StorageService、OssStorageService 等
 */
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface PutResult {
  /** 公开可访问的完整 URL(末尾无 /) */
  url: string;
  /** 对象 key,供后续 delete 用 */
  key: string;
}

export interface StorageService {
  /**
   * 上传一个对象
   * @param key 对象 key(相对 bucket 根,不含前导 /)
   * @param body 二进制内容
   * @param contentType MIME 类型,默认 application/octet-stream
   */
  put(key: string, body: Buffer, contentType?: string): Promise<PutResult>;

  /**
   * 删除一个对象(找不到不抛错)
   */
  delete(key: string): Promise<void>;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/storage/storage.service.spec.ts`
Expected: PASS — 3 tests passed

- [ ] **Step 5: Commit**

```bash
git add backend/src/storage/storage.service.ts backend/src/storage/storage.service.spec.ts
git commit -m "feat(storage): 定义 StorageService 抽象接口和 STORAGE_SERVICE DI token"
```

---

## Task 3: CosStorageService 实现

**Files:**
- Create: `backend/src/storage/cos-storage.service.ts`
- Create: `backend/src/storage/cos-storage.service.spec.ts`

- [ ] **Step 1: 写失败测试**

创建 `backend/src/storage/cos-storage.service.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import COS from 'cos-nodejs-sdk-v5';
import { CosStorageService } from './cos-storage.service';

// Mock COS SDK constructor
jest.mock('cos-nodejs-sdk-v5');

describe('CosStorageService', () => {
  let service: CosStorageService;
  let mockPutObject: jest.Mock;
  let mockDeleteObject: jest.Mock;
  let config: { get: jest.Mock };

  const setupConfig = (env: Record<string, string>) => {
    config = {
      get: jest.fn((key: string, def?: string) => env[key] ?? def ?? ''),
    };
  };

  beforeEach(() => {
    mockPutObject = jest.fn().mockResolvedValue({});
    mockDeleteObject = jest.fn().mockResolvedValue({});
    (COS as jest.MockedClass<typeof COS>).mockImplementation(
      () =>
        ({
          putObject: mockPutObject,
          deleteObject: mockDeleteObject,
        } as any),
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('construction', () => {
    it('throws when COS_SECRET_ID is missing', async () => {
      setupConfig({ COS_SECRET_KEY: 'k', COS_BUCKET: 'b', COS_REGION: 'r' });
      await expect(
        Test.createTestingModule({
          providers: [CosStorageService, { provide: ConfigService, useValue: config }],
        }).compile(),
      ).rejects.toThrow(/COS_SECRET_ID/);
    });

    it('throws when COS_SECRET_KEY is missing', async () => {
      setupConfig({ COS_SECRET_ID: 'i', COS_BUCKET: 'b', COS_REGION: 'r' });
      await expect(
        Test.createTestingModule({
          providers: [CosStorageService, { provide: ConfigService, useValue: config }],
        }).compile(),
      ).rejects.toThrow(/COS_SECRET_KEY/);
    });
  });

  describe('put', () => {
    let serviceRef: CosStorageService;
    beforeEach(async () => {
      setupConfig({
        COS_SECRET_ID: 'sid',
        COS_SECRET_KEY: 'skey',
        COS_BUCKET: 'bkt-1300000000',
        COS_REGION: 'ap-shanghai',
      });
      const mod = await Test.createTestingModule({
        providers: [CosStorageService, { provide: ConfigService, useValue: config }],
      }).compile();
      serviceRef = mod.get(CosStorageService);
    });

    it('calls cos.putObject with correct args and returns COS URL', async () => {
      const buf = Buffer.from('hello');
      const result = await serviceRef.put('cms-ng/x.png', buf, 'image/png');

      expect(mockPutObject).toHaveBeenCalledWith({
        Bucket: 'bkt-1300000000',
        Region: 'ap-shanghai',
        Key: 'cms-ng/x.png',
        Body: buf,
        ContentType: 'image/png',
      });
      expect(result).toEqual({
        url: 'https://bkt-1300000000.cos.ap-shanghai.myqcloud.com/cms-ng/x.png',
        key: 'cms-ng/x.png',
      });
    });

    it('uses COS_BASE_URL when set, stripping trailing slash', async () => {
      config.get.mockImplementation((k: string, d?: string) => {
        if (k === 'COS_BASE_URL') return 'https://cdn.example.com/';
        if (k === 'COS_BUCKET') return 'bkt-1300000000';
        return d ?? '';
      });
      const mod = await Test.createTestingModule({
        providers: [CosStorageService, { provide: ConfigService, useValue: config }],
      }).compile();
      const s = mod.get(CosStorageService);
      const r = await s.put('cms-ng/x.png', Buffer.from('x'), 'image/png');
      expect(r.url).toBe('https://cdn.example.com/cms-ng/x.png');
    });

    it('defaults contentType to application/octet-stream', async () => {
      await serviceRef.put('k', Buffer.from('x'));
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({ ContentType: 'application/octet-stream' }),
      );
    });
  });

  describe('delete', () => {
    it('calls cos.deleteObject with correct args', async () => {
      setupConfig({
        COS_SECRET_ID: 'sid',
        COS_SECRET_KEY: 'skey',
        COS_BUCKET: 'bkt-1300000000',
        COS_REGION: 'ap-shanghai',
      });
      const mod = await Test.createTestingModule({
        providers: [CosStorageService, { provide: ConfigService, useValue: config }],
      }).compile();
      const s = mod.get(CosStorageService);
      await s.delete('cms-ng/x.png');
      expect(mockDeleteObject).toHaveBeenCalledWith({
        Bucket: 'bkt-1300000000',
        Region: 'ap-shanghai',
        Key: 'cms-ng/x.png',
      });
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx jest src/storage/cos-storage.service.spec.ts`
Expected: FAIL — `Cannot find module './cos-storage.service'`

- [ ] **Step 3: 实现 CosStorageService**

创建 `backend/src/storage/cos-storage.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import COS from 'cos-nodejs-sdk-v5';
import { PutResult, StorageService } from './storage.service';

@Injectable()
export class CosStorageService implements StorageService {
  private readonly client: COS;
  private readonly bucket: string;
  private readonly region: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    const secretId = config.get<string>('COS_SECRET_ID');
    const secretKey = config.get<string>('COS_SECRET_KEY');
    if (!secretId || !secretKey) {
      throw new Error('COS_SECRET_ID 和 COS_SECRET_KEY 必须配置');
    }
    this.client = new COS({ SecretId: secretId, SecretKey: secretKey });
    this.bucket = config.get<string>('COS_BUCKET', '');
    this.region = config.get<string>('COS_REGION', 'ap-shanghai');
    const explicit = config.get<string>('COS_BASE_URL');
    this.baseUrl = (
      explicit && explicit.length > 0
        ? explicit
        : `https://${this.bucket}.cos.${this.region}.myqcloud.com`
    ).replace(/\/$/, '');
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string = 'application/octet-stream',
  ): Promise<PutResult> {
    await this.client.putObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    return { url: `${this.baseUrl}/${key}`, key };
  }

  async delete(key: string): Promise<void> {
    await this.client.deleteObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
    });
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx jest src/storage/cos-storage.service.spec.ts`
Expected: PASS — 6 tests passed

- [ ] **Step 5: Commit**

```bash
git add backend/src/storage/cos-storage.service.ts backend/src/storage/cos-storage.service.spec.ts
git commit -m "feat(storage): 实现 CosStorageService(腾讯云 COS SDK 封装)"
```

---

## Task 4: StorageModule + app.module 注册

**Files:**
- Create: `backend/src/storage/storage.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: 写 StorageModule**

创建 `backend/src/storage/storage.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CosStorageService } from './cos-storage.service';
import { STORAGE_SERVICE, StorageService } from './storage.service';

@Module({
  providers: [
    CosStorageService,
    {
      provide: STORAGE_SERVICE,
      useExisting: CosStorageService,
    },
  ],
  exports: [STORAGE_SERVICE, CosStorageService],
})
export class StorageModule {}
```

- [ ] **Step 2: 在 app.module.ts 注册**

修改 `backend/src/app.module.ts`,在 import 段添加:

```ts
import { StorageModule } from './storage/storage.module';
```

在 `imports: [...]` 数组中追加 `StorageModule`(放在 `PrismaModule` 后):

```ts
imports: [
  ConfigModule.forRoot({ isGlobal: true }),
  PrismaModule,
  StorageModule,         // ← 新增
  RedisModule,
  AuthModule,
  UsersModule,
  StoriesModule,
  ArticlesModule,
  AIModule,
  TrendingTopicsModule,
  ChannelsModule,
  AutoPublishModule,
],
```

- [ ] **Step 3: 验证后端能编译(不需要启动,只看 TypeScript 编译)**

Run: `cd backend && npx tsc --noEmit`
Expected: 退出码 0,无错误输出

- [ ] **Step 4: 跑后端所有单元测试,确认无回归**

Run: `cd backend && npx jest`
Expected: 所有既有测试 PASS(Task 2/3 的新测试也 PASS,共 +9 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/storage/storage.module.ts backend/src/app.module.ts
git commit -m "feat(storage): 注册 StorageModule 到 AppModule"
```

---

## Task 5: ai.service.ts 改造 — downloadImage → storageService.put

**Files:**
- Modify: `backend/src/ai/ai.service.ts`
- Modify: `backend/src/ai/ai.service.spec.ts`

### 现状参考

- `backend/src/ai/ai.service.ts:1523` `const localUrl = await this.downloadImage(tempImageUrl, articleId);` — 调用入口
- `backend/src/ai/ai.service.ts:1623-1651` `private async downloadImage()` — 私有方法
- `backend/src/ai/ai.service.ts:65` `this.uploadDir = this.config.get<string>('UPLOAD_DIR') || './uploads';` — 字段定义
- `backend/src/ai/ai.service.spec.ts:1024-1025, 1080, 1101, 1122, 1143` — 5 处 `jest.spyOn(service as any, 'downloadImage')` mock

- [ ] **Step 1: 先看 spec 现状,定位 mock 位置**

Run:
```bash
grep -n "downloadImage\|UPLOAD_DIR\|uploadDir" backend/src/ai/ai.service.spec.ts | head -20
```
Expected: 列出所有相关行号,后续修改按行号定位

- [ ] **Step 2: 写失败测试 — StorageService 集成**

在 `backend/src/ai/ai.service.spec.ts` 文件顶部 import 段添加:

```ts
import { STORAGE_SERVICE, StorageService, PutResult } from '../storage/storage.service';
```

找到 `describe('generateArticleImage', ...)` 这个顶层 describe(也可能是 `describe('AIService', ...)` 内的子 describe),在 `beforeEach` 里(给 prisma / config 等 mock 准备的位置)追加 `StorageService` mock。

具体定位:在文件顶部 `beforeEach` 后追加 storage provider(参考 `prisma` 和 `configService` 的现有 mock 风格),并在 `Test.createTestingModule({ providers: [...] })` 中加 `{ provide: STORAGE_SERVICE, useValue: storageMock }`。

把 `generateArticleImage` 成功路径的 `expect(result.url).toBe('/uploads/articles/article-123/generated_123.png')` 这类断言改为断言返回的是 COS URL。

**示例改动(对 spec 第 1024-1037 行的现有测试做调整)**:

把现有:
```ts
jest.spyOn(service as any, 'downloadImage').mockResolvedValue(
  '/uploads/articles/article-123/generated_123.png',
);
// ...
expect(result.url).toBe('/uploads/articles/article-123/generated_123.png');
```

改为:
```ts
storageMock.put.mockResolvedValue({
  url: 'https://bkt-1300000000.cos.ap-shanghai.myqcloud.com/cms-ng/articles/article-123/generated_123.png',
  key: 'cms-ng/articles/article-123/generated_123.png',
});
// ...
expect(result.url).toBe('https://bkt-1300000000.cos.ap-shanghai.myqcloud.com/cms-ng/articles/article-123/generated_123.png');
expect(storageMock.put).toHaveBeenCalledWith(
  'cms-ng/articles/article-123/generated_123.png',
  expect.any(Buffer),
  'image/png',
);
```

类似地更新 `generateArticleImage` 失败路径测试(原 1080/1101/1122/1143 行的 `downloadImage` mock),改为对 `storageMock.put` mock 或对 `axios.get` 的 mock 调整。

- [ ] **Step 3: 跑测试确认失败**

Run: `cd backend && npx jest src/ai/ai.service.spec.ts`
Expected: 多个测试 FAIL — `STORAGE_SERVICE` 找不到,或 `result.url` 断言对不上

- [ ] **Step 4: 改造 ai.service.ts**

在 `backend/src/ai/ai.service.ts`:

**(4a)** 在 import 段加 `STORAGE_SERVICE` 和 `StorageService`:

```ts
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
```

**(4b)** 找到 `private readonly uploadDir: string;` 字段(约 65 行),**删除整行**。

**(4c)** 找到构造函数,在 `private config: ConfigService,` 后(约 70-75 行)注入 StorageService,完整构造函数签名改为:

```ts
constructor(
  private prisma: PrismaService,
  private config: ConfigService,
  @Inject(STORAGE_SERVICE) private storageService: StorageService,
) {
  this.seedreamApiKey = this.config.get<string>('SEEDREAM_API_KEY', '');
  // ... 其他 config 读取保持不变,但删除 this.uploadDir 这一行
}
```

并在 `import` 段加 `@Inject` 的 import:

```ts
import { Inject, Injectable, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
```

**(4d)** 改 `generateArticleImage` 调用点(约 1523 行):

把:
```ts
// Step 3: 下载图片到本地
const localUrl = await this.downloadImage(tempImageUrl, articleId);
```

改为:
```ts
// Step 3: 下载图片并上传到 COS
const publicUrl = await this.uploadToStorage(tempImageUrl, articleId);
```

同时把后面对 `localUrl` 的引用(约 1534 行 AIOperation result 字段)改为 `publicUrl`:

```ts
result: JSON.stringify({ imagePrompt, publicUrl }),
```

以及 `return { url: localUrl, prompt: imagePrompt };` 改为 `return { url: publicUrl, prompt: imagePrompt };`

**(4e)** 删除 `downloadImage` 私有方法(约 1623-1651 行),替换为:

```ts
/**
 * 下载临时图片并上传到对象存储,返回公网 URL
 */
private async uploadToStorage(
  tempUrl: string,
  articleId: string,
): Promise<string> {
  const imageResponse = await axios.get(tempUrl, {
    responseType: 'arraybuffer',
    timeout: 300_000,
  });
  const buffer = Buffer.from(imageResponse.data);
  const contentType: string =
    (imageResponse.headers['content-type'] as string) || 'image/png';
  const mimeExt = contentType.split('/')[1]?.split(';')[0]?.trim() || 'png';
  const ext = mimeExt === 'jpeg' ? 'jpg' : mimeExt;
  const key = `cms-ng/articles/${articleId}/generated_${Date.now()}.${ext}`;
  try {
    const { url } = await this.storageService.put(key, buffer, contentType);
    return url;
  } catch (error: any) {
    this.logger.error(
      `Failed to upload image to storage: ${error.message}`,
      error.stack,
    );
    throw new ServiceUnavailableException(
      `图片上传到对象存储失败: ${error.message}`,
    );
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd backend && npx jest src/ai/ai.service.spec.ts`
Expected: 所有测试 PASS(包括刚改的 `generateArticleImage` 和原本的 `downloadImage` mock 测试 — 后者如果还在,需要确认是否被新 mock 替代)

- [ ] **Step 6: 跑全部后端测试**

Run: `cd backend && npx jest`
Expected: 全部 PASS,无回归

- [ ] **Step 7: Commit**

```bash
git add backend/src/ai/ai.service.ts backend/src/ai/ai.service.spec.ts
git commit -m "refactor(ai): downloadImage 改为 storageService.put,图片走 COS"
```

---

## Task 6: main.ts 删 static 服务

**Files:**
- Modify: `backend/src/main.ts`

- [ ] **Step 1: 删 main.ts 中的 static 中间件**

在 `backend/src/main.ts`:

把:
```ts
import * as express from 'express';
import * as path from 'path';
import { AppModule } from './app.module';
```

改为:
```ts
import { AppModule } from './app.module';
```

把:
```ts
  // Serve uploaded files statically
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  await app.listen(process.env.PORT ?? 3001);
```

改为:
```ts
  await app.listen(process.env.PORT ?? 3001);
```

- [ ] **Step 2: 验证编译**

Run: `cd backend && npx tsc --noEmit`
Expected: 退出码 0

- [ ] **Step 3: 跑后端全部测试**

Run: `cd backend && npx jest`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/main.ts
git commit -m "refactor(main): 删除 /uploads 静态文件服务(图片已迁移到 COS)"
```

---

## Task 7: .env.example 改

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: 删除 UPLOAD_DIR 段**

定位到 `# ===== 文件存储 =====` 段(包含 `UPLOAD_DIR="./uploads"`),整段删除,包括上方 `# ===== 文件存储 =====` 标题。

- [ ] **Step 2: 删除 BACKEND_URL 段**

定位到 `# ===== 后端 URL(用于 WordPress 发布时解析文章内嵌的相对路径图片) =====` 段(含 `BACKEND_URL="http://localhost:3001"`),整段删除,包括标题。

- [ ] **Step 3: 新增 COS 配置段**

在 `.env.example` 文件末尾(或 `# ===== SMTP 邮件通知 =====` 段之前)追加:

```env

# ===== 腾讯云 COS 对象存储 =====
# 公有读 + 私有写 bucket,前端和 WordPress 通过 https:// 直接读取
# 1. 在 https://console.cloud.tencent.com/cos 创建 bucket
# 2. 桶策略:公有读(读不需要签名),私有写
# 3. 在 CAM 创建子账号,只授予本 bucket 的 PutObject / GetObject / DeleteObject 权限
# 4. CORS: 允许 http://localhost:3000 和生产前端域名 GET
COS_SECRET_ID="your-cos-secret-id"
COS_SECRET_KEY="your-cos-secret-key"
COS_BUCKET="your-bucket-name-1300000000"
COS_REGION="ap-shanghai"
# 可选 — 不填则用默认 https://<bucket>.cos.<region>.myqcloud.com
# COS_BASE_URL="https://cdn.your-domain.com"
```

- [ ] **Step 4: 验证**

Run: `cd backend && grep -n "UPLOAD_DIR\|BACKEND_URL\|COS_" .env.example`
Expected: 不出现 `UPLOAD_DIR` 或 `BACKEND_URL`,出现 `COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION`、`COS_BASE_URL` 5 行

- [ ] **Step 5: Commit**

```bash
git add backend/.env.example
git commit -m "docs(env): 用 COS 配置替换 UPLOAD_DIR 和 BACKEND_URL"
```

---

## Task 8: wordpress.service.ts 简化

**Files:**
- Modify: `backend/src/channels/wordpress.service.ts`
- Modify: `backend/src/channels/wordpress.service.spec.ts`

### 现状参考

- `backend/src/channels/wordpress.service.ts:14-17` 字段定义 — 删 `backendUrl` 字段
- `backend/src/channels/wordpress.service.ts:33` `this.backendUrl = ...` — 删整行
- `backend/src/channels/wordpress.service.ts:153-163` `resolveImageUrl()` — 删整段
- `backend/src/channels/wordpress.service.ts:179` `const absoluteUrl = this.resolveImageUrl(originalSrc);` — 改直接用 `originalSrc`
- `backend/src/channels/wordpress.service.ts:250` `const coverUrl = this.resolveImageUrl(article.coverImage);` — 改直接用 `article.coverImage`

- [ ] **Step 1: 跑现有 spec,确认 baseline 绿**

Run: `cd backend && npx jest src/channels/wordpress.service.spec.ts`
Expected: 全部 PASS(任务 8 之前的 baseline)

- [ ] **Step 2: 改 wordpress.service.ts**

**(2a)** 删字段定义(约 14-17 行)。整段 `private readonly siteUrl: ...` 块中,删除:

```ts
private readonly backendUrl: string;
```

**(2b)** 删构造函数中 backendUrl 赋值(约 33 行)。删除:

```ts
this.backendUrl = this.configService.get<string>('BACKEND_URL', 'http://localhost:3001');
```

**(2c)** 删 `resolveImageUrl` 私有方法(约 153-163 行)。删除整个方法:

```ts
  /**
   * 将相对路径图片 URL 解析为绝对 URL
   */
  private resolveImageUrl(src: string): string {
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      return src;
    }
    if (src.startsWith('/')) {
      const base = this.backendUrl.replace(/\/$/, '');
      return `${base}${src}`;
    }
    const base = this.backendUrl.replace(/\/$/, '');
    return `${base}/${src}`;
  }
```

**(2d)** 改 `processContentImages`(约 179 行)。把:

```ts
const absoluteUrl = this.resolveImageUrl(originalSrc);
```

改为:
```ts
const absoluteUrl = originalSrc; // 图片已是公网 https:// 绝对 URL
```

同时把后面对 `absoluteUrl` 的 `if (absoluteUrl.startsWith(this.siteUrl))` 跳过逻辑保留。

**(2e)** 改 `publish()` 中封面图上传(约 248-255 行)。把:

```ts
let featuredMediaId: number | null = null;
if (article.coverImage) {
  const coverUrl = this.resolveImageUrl(article.coverImage);
  const uploaded = await this.uploadImage(coverUrl);
  if (uploaded) {
    featuredMediaId = uploaded.id;
  }
}
```

改为:

```ts
let featuredMediaId: number | null = null;
if (article.coverImage) {
  // article.coverImage 已是 https://... 绝对 URL(COS),直接传
  const uploaded = await this.uploadImage(article.coverImage);
  if (uploaded) {
    featuredMediaId = uploaded.id;
  }
}
```

- [ ] **Step 3: 改 spec — 删除 BACKEND_URL mock 引用**

在 `backend/src/channels/wordpress.service.spec.ts`:

**(3a)** 找到 `mockArticle` 定义(约 21-28 行),把 `coverImage` 改为绝对 URL:

```ts
const mockArticle = {
  id: 'article-1',
  title: '测试文章',
  content: '<p>测试内容</p>',
  excerpt: '摘要',
  coverImage: 'https://bkt-1300000000.cos.ap-shanghai.myqcloud.com/cms-ng/articles/article-1/cover.png',
  tags: '["标签1"]',
};
```

**(3b)** 找到 `configService` 的 mock 实现(约 50-58 行),在 env 字典中确认没有 `BACKEND_URL`(本来就没有,只是显式确认)。

- [ ] **Step 4: 跑测试**

Run: `cd backend && npx jest src/channels/wordpress.service.spec.ts`
Expected: 全部 PASS

- [ ] **Step 5: 跑全部测试**

Run: `cd backend && npx jest`
Expected: 全部 PASS,无回归

- [ ] **Step 6: Commit**

```bash
git add backend/src/channels/wordpress.service.ts backend/src/channels/wordpress.service.spec.ts
git commit -m "refactor(wordpress): 删除 BACKEND_URL 和 resolveImageUrl(图片已是绝对 URL)"
```

---

## Task 9: 前端去拼接

**Files:**
- Modify: `frontend/src/app/dashboard/articles/[id]/page.tsx`

- [ ] **Step 1: 定位拼接代码**

Run:
```bash
grep -n "NEXT_PUBLIC_API_URL.*coverImage\|coverImage.*NEXT_PUBLIC_API_URL" frontend/src/app/dashboard/articles/\[id\]/page.tsx
```
Expected: 845、1335 两行(详见 spec 3.3)

- [ ] **Step 2: 改第 845 行**

把:
```tsx
src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${article.coverImage}`}
```

改为:
```tsx
src={article.coverImage}
```

- [ ] **Step 3: 改第 1335 行**

把同样模式的拼接改为 `src={article.coverImage}`。

- [ ] **Step 4: 验证 TypeScript 编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 退出码 0

- [ ] **Step 5: 跑前端测试(若存在)**

Run: `cd frontend && npm test 2>&1 | tail -20`
Expected: 全部 PASS(若失败,排查但**不**为这个改动引入新功能)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/dashboard/articles/\[id\]/page.tsx
git commit -m "refactor(frontend): 封面图 src 直接用 article.coverImage(已是绝对 URL)"
```

---

## Task 10: 部署 + 手动验证

**Files:**
- Cleanup: `backend/uploads/` 目录(部署后)
- Cleanup: `backend/.env` 删除 `UPLOAD_DIR` 和 `BACKEND_URL`(若仍在)

- [ ] **Step 1: 在 .env 中添加 COS 配置**

在部署主机上编辑 `backend/.env`,追加:

```env
COS_SECRET_ID="<你的子账号 SecretId>"
COS_SECRET_KEY="<你的子账号 SecretKey>"
COS_BUCKET="cms-ng-prod-imgs-1300000000"
COS_REGION="ap-shanghai"
```

- [ ] **Step 2: 在 .env 中删除 UPLOAD_DIR 和 BACKEND_URL**

删除 `UPLOAD_DIR="./uploads"` 和 `BACKEND_URL="http://localhost:3001"` 两行(若仍在)。

- [ ] **Step 3: 部署后端**

```bash
cd /root/cms-ng && git pull && docker compose -f docker-compose.prod.yml build backend && docker compose -f docker-compose.prod.yml up -d backend
```

- [ ] **Step 4: 验证后端启动成功**

Run: `docker logs cms-ng-backend --tail 30`
Expected: 无 `COS_SECRET_ID` 错误,看到 `Nest application successfully started` 或类似

- [ ] **Step 5: 触发一篇新文章的 AI 生图**

在前端:打开任一篇文章,触发"AI 生图"。预期:
- API 返回 200,`result.url` 是 `https://<bucket>.cos.<region>.myqcloud.com/cms-ng/articles/<id>/generated_*.png`
- 在浏览器新标签打开这个 URL,能直接看到图片

- [ ] **Step 6: 验证 WordPress 封面图同步**

在 CMS 里把刚生成图的文章发布到 WordPress。预期:
- WordPress 后台看到 `featured_media` 已设置
- WordPress 前台文章页显示封面图(根除上一轮问题)

- [ ] **Step 7: 验证错误路径(可选)**

临时把 `COS_SECRET_KEY` 改成一个无效值,重启后端。预期:
- 后端启动失败,日志清晰显示 `COS_SECRET_ID 和 COS_SECRET_KEY 必须配置`

恢复正确值重启,确认正常。

- [ ] **Step 8: 清理 backend/uploads/**

```bash
rm -rf /root/cms-ng/backend/uploads
```

- [ ] **Step 9: 跑一次完整后端测试套件**

Run: `cd backend && npx jest`
Expected: 全部 PASS

- [ ] **Step 10: 记录部署结果(可选,无 commit)**

在 PR 描述里记录:
- 部署时间、版本 commit hash
- 手动验证清单结果(步骤 5/6/7)
- 是否有任何回滚

---

## Task 11: 文档同步更新

**Files:**
- Modify: 任何还提到 `UPLOAD_DIR` / `BACKEND_URL` / `/uploads` 静态服务的 doc(若有)

- [ ] **Step 1: 扫描文档**

Run:
```bash
grep -rn "UPLOAD_DIR\|BACKEND_URL\|/uploads/\|express.static" docs/ --include="*.md" 2>/dev/null
```
Expected: 列出所有需要更新的位置

- [ ] **Step 2: 逐个修正**

对每个匹配项:
- `UPLOAD_DIR` → 改为 `COS_*` 相关配置
- `BACKEND_URL` → 删除(不再需要)
- `/uploads/` 静态服务 → 删除相关说明
- 提到 "本地存储"/"express.static" 的段落 → 改为"对象存储(COS)"

- [ ] **Step 3: 验证**

Run:
```bash
grep -rn "UPLOAD_DIR\|BACKEND_URL" docs/ --include="*.md" 2>/dev/null
```
Expected: 无输出

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: 同步更新 — 移除 UPLOAD_DIR/BACKEND_URL 引用,改为 COS"
```

---

## Self-Review Checklist

✅ **Spec 覆盖**:
- Spec 1.1 背景 — 由所有 task 共同实现
- Spec 1.2 目标 — Task 5/8/9 实现"根除 WP 同步问题";Task 1-4 实现"抽象 + COS"
- Spec 1.3 非目标 — 明确不实现
- Spec 2.1 架构 — Task 1-4
- Spec 2.2 模块拆分 — Task 4
- Spec 2.3 接口 — Task 2
- Spec 2.4 COS 客户端 — Task 3
- Spec 2.5 key 命名 — Task 5(`cms-ng/articles/<id>/generated_<ts>.<ext>`)
- Spec 3.1 AI 数据流 — Task 5
- Spec 3.2 WP 数据流 — Task 8
- Spec 3.3 前端 — Task 9
- Spec 4 错误处理 — Task 3(启动抛错)、Task 5(ServiceUnavailableException)
- Spec 5 配置 — Task 7 + Task 10 step 1-2
- Spec 6.1 新增文件 — Task 2/3/4
- Spec 6.2 修改文件 — Task 5/6/7/8
- Spec 6.3 前端 — Task 9
- Spec 6.4 清理 — Task 10 step 8 + Task 11
- Spec 7 依赖 — Task 1
- Spec 8 测试 — 散落在 Task 2/3/5/8 各自的测试
- Spec 9 部署 — Task 10
- Spec 10 风险 — 在设计阶段考虑(Task 3 启动校验、Task 5 硬失败)
- Spec 11 后续议题 — 不在本计划范围
- Spec 12 工作量 — 11 个 task,与估算 2-2.5 天一致

✅ **占位符扫描**:无 TBD/TODO/"implement later"

✅ **类型一致性**:
- `STORAGE_SERVICE` symbol: Task 2 定义,Task 3/4 消费
- `StorageService` 接口:Task 2 定义,Task 3 实现,Task 5 消费
- `PutResult`: Task 2 定义,Task 3 返回
- `cos-storage.service.ts` 路径: Task 3 创建,Task 4 引用,Task 5 mock 引用
- `cms-ng/articles/<articleId>/generated_<timestamp>.<ext>`: Task 5 创建,符合 spec 2.5

✅ **任务粒度**:每 task 1-2 小时,内部 5-7 步,每步 2-5 分钟

---

## 执行总览

| Task | 时间估计 | 关键交付 |
|---|---|---|
| 1. 装 cos-nodejs-sdk-v5 | 5 min | package.json + lockfile |
| 2. StorageService 接口 | 20 min | 接口 + DI token + 3 单测 |
| 3. CosStorageService 实现 | 45 min | 6 单测,覆盖构造/put/delete/URL 拼接 |
| 4. StorageModule 注册 | 15 min | Module + app.module 集成 + 全测无回归 |
| 5. ai.service.ts 改造 | 1.5 h | 核心改动,改方法 + 改 5 处 mock |
| 6. main.ts 删 static | 10 min | 一行删 + 一个 import 删 |
| 7. .env.example 改 | 10 min | 新增 COS 段,删 2 旧段 |
| 8. wordpress.service.ts 简化 | 45 min | 删 1 字段 + 1 方法 + 改 2 处调用 |
| 9. 前端去拼接 | 15 min | 2 行 src 拼接去掉 |
| 10. 部署 + 手动验证 | 1-2 h | COS bucket 创建 + 配置 + 6 项手动验证 |
| 11. 文档同步 | 15 min | grep + 修正 |
| **合计** | **5-7 小时(1-2 工作日)** | |
