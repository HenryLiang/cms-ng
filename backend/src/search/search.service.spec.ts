import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import { SearchService, SearchUnavailableException } from './search.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import type { ArticleSearchQuery, MediaSearchQuery } from './search.types';

// Mock ES Client 构造器(与 cos-storage.service.spec 同一模式,不打真实 ES)
jest.mock('@elastic/elasticsearch');

/**
 * SearchService 单测:ensureIndex 成功/已存在跳过/IK 缺失降级、懒式自愈、
 * index/delete fail-open + 404 幂等、search 成功/重试/4xx 不重试/超时降级、
 * 序列化契约(tags JSON string -> 数组)、日志严禁打印凭证(P0:公开仓库 CI 日志)。
 */
describe('SearchService', () => {
  let service: SearchService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let config: { get: jest.Mock };
  let mockClient: {
    indices: { exists: jest.Mock; create: jest.Mock; putMapping: jest.Mock };
    index: jest.Mock;
    delete: jest.Mock;
    search: jest.Mock;
  };

  const ENABLED_ENV: Record<string, string> = {
    ELASTICSEARCH_ENABLED: 'true',
    ELASTICSEARCH_NODE: 'http://localhost:9200',
    ELASTICSEARCH_INDEX_MEDIA: 'media_assets',
    ELASTICSEARCH_INDEX_ARTICLES: 'articles',
  };

  const baseQuery: MediaSearchQuery = {
    ownerId: 'u1',
    status: 'ACTIVE',
    page: 1,
    pageSize: 20,
  };

  const baseAsset = {
    id: 'a1',
    fileName: '花海.png',
    title: '春日花海',
    altText: '一片花海',
    description: null,
    prompt: null,
    tags: '["新闻","春天"]', // DB 存 JSON string
    aiTags: '["花海","自然"]',
    ownerId: 'u1',
    status: 'ACTIVE',
    source: 'UPLOAD',
    mimeType: 'image/png',
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
  };

  const baseArticle = {
    id: 'article-1',
    title: '气候政策新进展',
    content: '<p>香港减碳计划</p>',
    tags: '["香港","减碳政策"]',
    authorId: 'reporter-1',
    editorId: 'editor-1',
    status: 'IN_REVIEW',
    storyId: 'story-1',
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
  };

  const baseArticleQuery: ArticleSearchQuery = {
    userId: 'editor-1',
    role: 'EDITOR',
    search: '气候政策',
    page: 1,
    pageSize: 20,
  };

  async function makeService(
    env: Record<string, string> = ENABLED_ENV,
    init = true,
  ): Promise<SearchService> {
    config.get.mockImplementation(
      (key: string, def?: string) => env[key] ?? def ?? undefined,
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    const svc = module.get<SearchService>(SearchService);
    if (init) await svc.onModuleInit();
    return svc;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrismaService();
    config = { get: jest.fn() };
    mockClient = {
      indices: {
        exists: jest.fn().mockResolvedValue(false),
        create: jest.fn().mockResolvedValue({ acknowledged: true }),
        putMapping: jest.fn().mockResolvedValue({ acknowledged: true }),
      },
      index: jest.fn().mockResolvedValue({ result: 'created' }),
      delete: jest.fn().mockResolvedValue({ result: 'deleted' }),
      search: jest.fn(),
    };
    (Client as jest.MockedClass<typeof Client>).mockImplementation(
      () => mockClient as unknown as Client,
    );
  });

  describe('开关与初始化', () => {
    it('ELASTICSEARCH_ENABLED!=true -> 不建 client,isEnabled false,检索走 LIKE', async () => {
      service = await makeService({ ELASTICSEARCH_ENABLED: 'false' });
      expect(Client).not.toHaveBeenCalled();
      expect(service.isEnabled()).toBe(false);
    });

    it('ensureIndex:索引不存在 -> 创建(ik_max_word mapping),isEnabled true', async () => {
      service = await makeService();
      expect(mockClient.indices.exists).toHaveBeenCalledWith({
        index: 'media_assets',
      });
      expect(mockClient.indices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'media_assets',
          mappings: expect.objectContaining({
            properties: expect.objectContaining({
              tags: expect.objectContaining({ analyzer: 'ik_max_word' }),
              aiTags: expect.objectContaining({ analyzer: 'ik_max_word' }),
            }),
          }),
        }),
      );
      expect(service.isEnabled()).toBe(true);
    });

    it('creates a separate IK index for article title and content search', async () => {
      service = await makeService();
      expect(mockClient.indices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'articles',
          mappings: expect.objectContaining({
            properties: expect.objectContaining({
              title: expect.objectContaining({ analyzer: 'ik_max_word' }),
              content: expect.objectContaining({ analyzer: 'ik_max_word' }),
            }),
          }),
        }),
      );
    });

    it('ensureIndex:索引已存在 -> 跳过创建,isEnabled true', async () => {
      mockClient.indices.exists.mockResolvedValue(true);
      service = await makeService();
      expect(mockClient.indices.create).not.toHaveBeenCalled();
      expect(service.isEnabled()).toBe(true);
    });

    it('updates an existing article mapping so tags use IK analysis', async () => {
      mockClient.indices.exists.mockResolvedValue(true);

      service = await makeService();

      expect(mockClient.indices.putMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'articles',
          properties: expect.objectContaining({
            tags: expect.objectContaining({ analyzer: 'ik_max_word' }),
          }),
        }),
      );
    });

    it('ES 不可达/IK 缺失 -> ensureIndex 抛错,降级 isEnabled false(不 fail-fast)', async () => {
      mockClient.indices.exists.mockRejectedValue(
        new Error('analyzer [ik_max_word] not found'),
      );
      service = await makeService();
      expect(service.isEnabled()).toBe(false);
    });

    it('article index failure does not degrade a healthy media index', async () => {
      mockClient.indices.exists.mockResolvedValue(false);
      mockClient.indices.create.mockImplementation(({ index }) => {
        if (index === 'articles') {
          return Promise.reject(new Error('article mapping failed'));
        }
        return Promise.resolve({ acknowledged: true });
      });

      service = await makeService();

      expect(service.isEnabled()).toBe(true);
      expect(service.isArticleEnabled()).toBe(false);
    });

    it('懒式自愈:初始化降级后,写路径重试 ensureReady 成功 -> 恢复可用', async () => {
      // 初始化时 ES down
      mockClient.indices.exists.mockRejectedValueOnce(
        new Error('conn refused'),
      );
      service = await makeService();
      expect(service.isEnabled()).toBe(false);
      expect(service.isArticleEnabled()).toBe(true);
      // isConfigured 与 isEnabled 的区分:配置已开但索引未就绪 -> 检索仍降级
      expect(service.isConfigured()).toBe(true);
      expect(service.isEnabled()).toBe(false);
      // 恢复:exists 成功(索引已存在,无需 create)。
      // 节流:onModuleInit 已置 lastHealAttempt=now,需重置为 0 强制一次自愈
      mockClient.indices.exists.mockResolvedValue(true);
      prisma.mediaAsset.findUnique.mockResolvedValue(baseAsset);
      (service as unknown as { lastHealAttempt: number }).lastHealAttempt = 0;
      await service.indexAsset('a1');
      expect(service.isEnabled()).toBe(true);
      expect(mockClient.index).toHaveBeenCalled();
    });

    it('节流:刚自愈失败后,HEAL_RETRY_MS 内再写不重复打 ensureIndex,记脏等下轮', async () => {
      mockClient.indices.exists.mockRejectedValueOnce(new Error('down'));
      service = await makeService();
      expect(service.isEnabled()).toBe(false);
      // 此时 lastHealAttempt=now,15000ms 内 ensureReady 直接返回 false
      mockClient.indices.exists.mockResolvedValue(true);
      prisma.mediaAsset.findUnique.mockResolvedValue(baseAsset);
      await service.indexAsset('a1'); // 被节流,不 heal
      expect(mockClient.indices.exists).toHaveBeenCalledTimes(2); // 启动时媒体/稿件各一次
      expect(mockClient.index).not.toHaveBeenCalled(); // 未就绪,跳过写
      // 投影被记脏(indexReady 恢复后 drainDirty 补投)
      expect(
        (service as unknown as { dirtyIds: Set<string> }).dirtyIds.size,
      ).toBe(1);
    });

    it('恢复(false->true)触发 onHealed:宕机窗口记脏的投影被 drainDirty 补投', async () => {
      mockClient.indices.exists.mockRejectedValueOnce(new Error('down'));
      service = await makeService();
      // 节流期内写两条 -> 记脏
      mockClient.indices.exists.mockResolvedValue(true);
      prisma.mediaAsset.findUnique.mockResolvedValue(baseAsset);
      (service as unknown as { lastHealAttempt: number }).lastHealAttempt = 0;
      // 第一条触发自愈(heal 成功)-> onHealed 异步 drainDirty(此时脏集合已空)
      await service.indexAsset('a1');
      expect(service.isEnabled()).toBe(true);
      // 恢复后再写应正常索引
      await service.indexAsset('a2');
      expect(mockClient.index).toHaveBeenCalledTimes(2);
    });
  });

  describe('indexAsset / deleteAsset', () => {
    beforeEach(async () => {
      service = await makeService();
    });

    it('ACTIVE 资产 -> 索引;tags/aiTags 由 JSON string 解析为数组(序列化契约)', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(baseAsset);
      await service.indexAsset('a1');
      expect(mockClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'media_assets',
          id: 'a1',
          document: expect.objectContaining({
            tags: ['新闻', '春天'], // 数组,非整串
            aiTags: ['花海', '自然'],
            ownerId: 'u1',
            status: 'ACTIVE',
          }),
        }),
      );
      const doc = mockClient.index.mock.calls[0][0].document;
      expect(Array.isArray(doc.tags)).toBe(true);
    });

    it('C5:tags/aiTags 脏数据(非字符串数组/解析异常)-> 容错为空数组,不写噪声', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        tags: '[1, 2]', // JSON 合法但元素非字符串
        aiTags: '{"a":1}', // JSON 合法但非数组
      });
      await service.indexAsset('a1');
      const doc = mockClient.index.mock.calls[0][0].document;
      expect(doc.tags).toEqual([]);
      expect(doc.aiTags).toEqual([]);
    });

    it('资产不存在 -> 空操作,不索引', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(null);
      await service.indexAsset('ghost');
      expect(mockClient.index).not.toHaveBeenCalled();
    });

    it('非 ACTIVE(软删)-> 走删除而非索引(删竞态双保险)', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({
        ...baseAsset,
        status: 'DELETED',
      });
      await service.indexAsset('a1');
      expect(mockClient.index).not.toHaveBeenCalled();
      expect(mockClient.delete).toHaveBeenCalledWith(
        expect.objectContaining({ index: 'media_assets', id: 'a1' }),
      );
    });

    it('delete 404 -> 幂等,不抛错', async () => {
      const err = new Error('not found') as Error & {
        meta?: { statusCode?: number };
      };
      err.meta = { statusCode: 404 };
      mockClient.delete.mockRejectedValue(err);
      await expect(service.deleteAsset('a1')).resolves.toBeUndefined();
    });

    it('delete 非 404 错误 -> 抛错(由事件处理器捕获 fail-open)', async () => {
      mockClient.delete.mockRejectedValue(new Error('shard failure'));
      await expect(service.deleteAsset('a1')).rejects.toThrow('shard failure');
    });

    it('handleAssetUpsert:index 抛错仅 warn,不产生未捕获拒绝(fail-open)', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(baseAsset);
      mockClient.index.mockRejectedValue(new Error('bulk rejected'));
      const warnSpy = jest.spyOn(
        (service as unknown as { logger: { warn: (m: string) => void } })
          .logger,
        'warn',
      );
      service.handleAssetUpsert({ assetId: 'a1' });
      await new Promise((r) => setTimeout(r, 0)); // 排空微任务
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('searchMedia', () => {
    const hitsResp = (ids: string[], total: number) => ({
      hits: {
        total: { value: total, relation: 'eq' },
        hits: ids.map((id) => ({ _id: id })),
      },
    });

    beforeEach(async () => {
      service = await makeService();
    });

    it('成功 -> 返回 ids(按 ES 顺序)+ total;requestTimeout 在第二参(传输层)', async () => {
      mockClient.search.mockResolvedValue(hitsResp(['a2', 'a1'], 2));
      const res = await service.searchMedia({ ...baseQuery, search: '花海' });
      expect(res).toEqual({ ids: ['a2', 'a1'], total: 2 });
      const [body, opts] = mockClient.search.mock.calls[0];
      expect(opts).toEqual({ requestTimeout: 3000 });
      expect(body.requestTimeout).toBeUndefined();
      // 检索字段加权 + 双侧过滤
      expect(body.query.bool.filter).toEqual(
        expect.arrayContaining([
          { term: { ownerId: 'u1' } },
          { term: { status: 'ACTIVE' } },
        ]),
      );
      const mm = body.query.bool.must.find((m: unknown) => {
        const x = m as { multi_match?: { fields?: string[] } };
        return !!x.multi_match;
      });
      expect(mm.multi_match.fields).toEqual(
        expect.arrayContaining(['tags^2', 'aiTags^2', 'fileName^2']),
      );
      // C7 排序 tiebreak:createdAt desc 同毫秒并列时按 id asc 稳定分页
      expect(body.sort).toEqual([
        { createdAt: { order: 'desc' } },
        { id: { order: 'asc' } },
      ]);
    });

    it('index_not_found(索引被外部删除)-> 复位 indexReady,抛 SearchUnavailable 触发 LIKE 降级', async () => {
      const err = new Error('missing') as Error & {
        meta?: {
          body?: { error?: { type?: string } };
          statusCode?: number;
        };
      };
      err.meta = {
        statusCode: 404,
        body: { error: { type: 'index_not_found_exception' } },
      };
      mockClient.search.mockRejectedValue(err);
      await expect(service.searchMedia(baseQuery)).rejects.toThrow(
        SearchUnavailableException,
      );
      // indexReady 被复位,下轮 ensureReady 才会重建索引(而非持续打一个不存在的索引)
      expect(service.isEnabled()).toBe(false);
      expect(service.isArticleEnabled()).toBe(true);
    });

    it('tag 过滤 -> tags.keyword 与 aiTags.keyword OR(term 精确)', async () => {
      mockClient.search.mockResolvedValue(hitsResp(['a1'], 1));
      await service.searchMedia({ ...baseQuery, tag: '花海' });
      const [body] = mockClient.search.mock.calls[0];
      const tagClause = body.query.bool.must.find(
        (m: unknown) => (m as { bool?: unknown }).bool,
      );
      expect(tagClause.bool.should).toEqual([
        { term: { 'tags.keyword': '花海' } },
        { term: { 'aiTags.keyword': '花海' } },
      ]);
    });

    it('瞬时故障(无 statusCode)-> 重试一次后成功', async () => {
      mockClient.search
        .mockRejectedValueOnce(new Error('socket hang up'))
        .mockResolvedValueOnce(hitsResp(['a1'], 1));
      const res = await service.searchMedia(baseQuery);
      expect(mockClient.search).toHaveBeenCalledTimes(2);
      expect(res.ids).toEqual(['a1']);
    });

    it('重试仍失败 -> 抛 SearchUnavailableException 触发 LIKE 降级', async () => {
      mockClient.search.mockRejectedValue(new Error('timeout'));
      await expect(service.searchMedia(baseQuery)).rejects.toThrow(
        SearchUnavailableException,
      );
      expect(mockClient.search).toHaveBeenCalledTimes(2);
    });

    it('4xx(深翻页越界等)-> 不重试,直接抛 SearchUnavailableException', async () => {
      const err = new Error('bad request') as Error & {
        meta?: { statusCode?: number };
      };
      err.meta = { statusCode: 400 };
      mockClient.search.mockRejectedValue(err);
      await expect(service.searchMedia(baseQuery)).rejects.toThrow(
        SearchUnavailableException,
      );
      expect(mockClient.search).toHaveBeenCalledTimes(1);
    });

    it('未启用 -> 抛 SearchUnavailableException', async () => {
      service = await makeService({ ELASTICSEARCH_ENABLED: 'false' });
      await expect(service.searchMedia(baseQuery)).rejects.toThrow(
        SearchUnavailableException,
      );
    });
  });

  describe('article projection and search', () => {
    const hitsResp = (ids: string[], total: number) => ({
      hits: {
        total: { value: total, relation: 'eq' },
        hits: ids.map((id) => ({ _id: id })),
      },
    });

    beforeEach(async () => {
      service = await makeService();
    });

    it('indexes the latest article title, body and access fields', async () => {
      prisma.article.findUnique.mockResolvedValue(baseArticle);

      await service.indexArticle('article-1');

      expect(mockClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'articles',
          id: 'article-1',
          document: expect.objectContaining({
            title: '气候政策新进展',
            content: '香港减碳计划',
            tags: ['香港', '减碳政策'],
            authorId: 'reporter-1',
            editorId: 'editor-1',
            status: 'IN_REVIEW',
            storyId: 'story-1',
          }),
          version: baseArticle.updatedAt.getTime(),
          version_type: 'external_gte',
        }),
      );
    });

    it('searches title, tags and content with editor access filters before pagination', async () => {
      mockClient.search.mockResolvedValue(
        hitsResp(['article-2', 'article-1'], 2),
      );

      await expect(
        service.searchArticles({
          ...baseArticleQuery,
          storyId: 'story-1',
          page: 2,
          pageSize: 10,
        }),
      ).resolves.toEqual({ ids: ['article-2', 'article-1'], total: 2 });

      const [body] = mockClient.search.mock.calls[0];
      expect(body).toEqual(
        expect.objectContaining({
          index: 'articles',
          from: 10,
          size: 10,
          track_total_hits: true,
        }),
      );
      expect(body.query.bool.must).toEqual([
        {
          multi_match: expect.objectContaining({
            query: '气候政策',
            fields: ['title^3', 'tags^2', 'content'],
          }),
        },
      ]);
      expect(body.query.bool.filter).toEqual(
        expect.arrayContaining([
          { term: { storyId: 'story-1' } },
          {
            bool: {
              should: [
                { term: { authorId: 'editor-1' } },
                { term: { editorId: 'editor-1' } },
                {
                  terms: {
                    status: ['PENDING_REVIEW', 'IN_REVIEW', 'REVISION'],
                  },
                },
              ],
              minimum_should_match: 1,
            },
          },
        ]),
      );
    });

    it('restricts reporter searches to their own articles', async () => {
      mockClient.search.mockResolvedValue(hitsResp([], 0));
      await service.searchArticles({
        ...baseArticleQuery,
        userId: 'reporter-1',
        role: 'REPORTER',
      });
      const [body] = mockClient.search.mock.calls[0];
      expect(body.query.bool.filter).toContainEqual({
        term: { authorId: 'reporter-1' },
      });
    });

    it('deletes article projections idempotently', async () => {
      await service.deleteArticle('article-1');
      expect(mockClient.delete).toHaveBeenCalledWith(
        expect.objectContaining({ index: 'articles', id: 'article-1' }),
      );
    });

    it('records a dirty article and enters degraded mode when an async projection write fails', async () => {
      prisma.article.findUnique.mockResolvedValue(baseArticle);
      mockClient.index.mockRejectedValue(new Error('connection reset'));

      service.handleArticleUpsert({ articleId: 'article-1' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        (
          service as unknown as {
            dirtyArticleIds: Set<string>;
          }
        ).dirtyArticleIds,
      ).toContain('article-1');
      expect(service.isEnabled()).toBe(true);
      expect(service.isArticleEnabled()).toBe(false);
    });

    it('serializes updates for the same article so an older request cannot finish last', async () => {
      const first = {
        ...baseArticle,
        title: '旧标题',
        updatedAt: new Date('2026-08-10T00:00:00.000Z'),
      };
      const second = {
        ...baseArticle,
        title: '新标题',
        updatedAt: new Date('2026-08-10T00:00:01.000Z'),
      };
      prisma.article.findUnique
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second);
      let releaseFirst: (() => void) | undefined;
      mockClient.index
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseFirst = () => resolve({ result: 'updated' });
            }),
        )
        .mockResolvedValueOnce({ result: 'updated' });

      service.handleArticleUpsert({ articleId: 'article-1' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      service.handleArticleUpsert({ articleId: 'article-1' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(prisma.article.findUnique).toHaveBeenCalledTimes(1);
      releaseFirst?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        mockClient.index.mock.calls.map(([request]) => request.document.title),
      ).toEqual(['旧标题', '新标题']);
    });

    it('re-enters degraded mode when a dirty projection retry fails, then heals again', async () => {
      const internal = service as unknown as {
        articleIndexReady: boolean;
        articleLastHealAttempt: number;
        dirtyArticleIds: Set<string>;
        drainDirtyArticles: () => Promise<void>;
        ensureArticleReady: () => Promise<boolean>;
      };
      internal.dirtyArticleIds.add('article-1');
      prisma.article.findUnique.mockResolvedValue(baseArticle);
      mockClient.index.mockRejectedValueOnce(new Error('still down'));

      await internal.drainDirtyArticles();

      expect(internal.articleIndexReady).toBe(false);
      expect(internal.dirtyArticleIds).toContain('article-1');

      mockClient.indices.exists.mockResolvedValue(true);
      mockClient.index.mockResolvedValue({ result: 'updated' });
      internal.articleLastHealAttempt = 0;
      await internal.ensureArticleReady();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(internal.articleIndexReady).toBe(true);
      expect(internal.dirtyArticleIds.size).toBe(0);
    });
  });

  describe('日志凭证脱敏(P0:公开仓库 CI 日志)', () => {
    it('node 含 userinfo 时,降级 warn 不打印密码', async () => {
      mockClient.indices.exists.mockRejectedValue(new Error('conn refused'));
      service = await makeService(
        {
          ELASTICSEARCH_ENABLED: 'true',
          ELASTICSEARCH_NODE: 'http://elastic:secretpass@localhost:9200',
          ELASTICSEARCH_USERNAME: 'elastic',
          ELASTICSEARCH_PASSWORD: 'secretpass',
        },
        false, // 先不 init,spy 后再触发
      );
      const logger = (
        service as unknown as {
          logger: { warn: (m: string) => void; log: (m: string) => void };
        }
      ).logger;
      const warnSpy = jest.spyOn(logger, 'warn');
      const logSpy = jest.spyOn(logger, 'log');
      await service.onModuleInit();
      const allLogs = [...warnSpy.mock.calls, ...logSpy.mock.calls]
        .flat()
        .join(' ');
      expect(allLogs).not.toContain('secretpass');
      expect(allLogs).toContain('***@');
    });

    it('密码含 @ 时贪婪脱敏:整段 userinfo 被吞,不留残段(P0)', async () => {
      mockClient.indices.exists.mockRejectedValue(new Error('conn refused'));
      service = await makeService(
        {
          ELASTICSEARCH_ENABLED: 'true',
          // 密码 p@ss 含 @ --非贪婪 [^/@]*@ 只剥到第一个 @,会泄露 "p"
          ELASTICSEARCH_NODE: 'http://user:p@ss@localhost:9200',
        },
        false,
      );
      const logger = (
        service as unknown as {
          logger: { warn: (m: string) => void; log: (m: string) => void };
        }
      ).logger;
      const warnSpy = jest.spyOn(logger, 'warn');
      const logSpy = jest.spyOn(logger, 'log');
      await service.onModuleInit();
      const allLogs = [...warnSpy.mock.calls, ...logSpy.mock.calls]
        .flat()
        .join(' ');
      expect(allLogs).not.toContain('p@ss');
      expect(allLogs).not.toContain('secretpass');
      expect(allLogs).toContain('***@');
    });
  });
});
