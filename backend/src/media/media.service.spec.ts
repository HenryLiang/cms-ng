import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import { STORAGE_SERVICE } from '../storage/storage.service';
import { MediaTaggingService } from './tagging/media-tagging.service';
import {
  SearchService,
  SearchUnavailableException,
} from '../search/search.service';
import { MediaSource, MediaStatus, MediaLibraryType } from '@cms-ng/shared';

describe('MediaService', () => {
  let service: MediaService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let storage: { put: jest.Mock; delete: jest.Mock; copy: jest.Mock };
  let search: { isConfigured: jest.Mock; searchMedia: jest.Mock };
  let events: { emit: jest.Mock };
  const config = { get: jest.fn() };

  const mockAsset = (override?: Record<string, unknown>) => ({
    id: 'asset-1',
    storageKey: 'cms-ng/media/u1/202607/abc.png',
    url: 'https://bkt.cos.ap-shanghai.myqcloud.com/cms-ng/media/u1/202607/abc.png',
    thumbnailUrl:
      'https://bkt.cos.ap-shanghai.myqcloud.com/cms-ng/media/u1/202607/abc.png?imageMogr2/thumbnail/300x300/strip',
    fileName: 'test.png',
    mimeType: 'image/png',
    size: 1024,
    width: 100,
    height: 100,
    source: MediaSource.UPLOAD,
    sourceRef: null,
    prompt: null,
    altText: null,
    title: null,
    description: null,
    tags: '["新闻"]',
    ownerId: 'u1',
    libraryType: MediaLibraryType.PERSONAL,
    teamId: null,
    status: MediaStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...override,
  });

  // 最小图片头（magic number）
  const pngBuf = () =>
    Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
  const jpgBuf = () =>
    Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);

  beforeEach(async () => {
    prisma = createMockPrismaService();
    storage = {
      put: jest.fn().mockResolvedValue({
        url: 'https://bkt.cos.ap-shanghai.myqcloud.com/x.png',
        key: 'x.png',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      copy: jest.fn(),
      thumbnailUrl: jest
        .fn()
        .mockReturnValue(
          'https://bkt.cos.ap-shanghai.myqcloud.com/x.png?imageMogr2/thumb',
        ),
    };
    config.get.mockImplementation(() => undefined);
    // 默认 ES 未配置:走 LIKE 路径;具体 ES 用例在各测试内覆写 isConfigured/searchMedia
    search = {
      isConfigured: jest.fn().mockReturnValue(false),
      searchMedia: jest.fn(),
    };
    events = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: prisma },
        { provide: STORAGE_SERVICE, useValue: storage },
        { provide: ConfigService, useValue: config },
        { provide: EventEmitter2, useValue: events },
        {
          provide: MediaTaggingService,
          useValue: { isEnabled: () => false, retag: jest.fn() },
        },
        { provide: SearchService, useValue: search },
      ],
    }).compile();
    service = module.get<MediaService>(MediaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('upload', () => {
    it('throws when no files provided', async () => {
      await expect(service.upload([], 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws on unsupported type (magic number mismatch)', async () => {
      const txtBuf = Buffer.from('not an image!!'); // 12 字节非图片头
      await expect(
        service.upload(
          [
            {
              buffer: txtBuf,
              originalname: 'fake.png',
              mimetype: 'image/png',
              size: 12,
            },
          ],
          'u1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on oversized file', async () => {
      await expect(
        service.upload(
          [
            {
              buffer: pngBuf(),
              originalname: 'big.png',
              mimetype: 'image/png',
              size: 11 * 1024 * 1024,
            },
          ],
          'u1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('uploads valid png: calls storage.put + prisma.create, returns VO with tags array', async () => {
      prisma.mediaAsset.create.mockResolvedValue(mockAsset());
      const result = await service.upload(
        [
          {
            buffer: pngBuf(),
            originalname: 'test.png',
            mimetype: 'image/png',
            size: 1024,
          },
        ],
        'u1',
      );
      expect(storage.put).toHaveBeenCalledWith(
        expect.stringMatching(/^cms-ng\/media\/u1\/\d{6}\/[0-9a-f-]+\.png$/),
        expect.any(Buffer),
        'image/png',
      );
      expect(prisma.mediaAsset.create).toHaveBeenCalled();
      expect(result[0].tags).toEqual(['新闻']); // JSON string 解析为数组
      // P2:入库后发射 created 事件(SearchService ES 索引 + 打标入队)
      expect(events.emit).toHaveBeenCalledWith('media.asset.created', {
        assetId: 'asset-1',
      });
    });

    it('trusts magic number over client mimetype (jpg buffer labeled png)', async () => {
      prisma.mediaAsset.create.mockResolvedValue(
        mockAsset({ mimeType: 'image/jpeg' }),
      );
      await service.upload(
        [
          {
            buffer: jpgBuf(),
            originalname: 'a.jpg',
            mimetype: 'image/png',
            size: 100,
          },
        ],
        'u1',
      );
      // detected 'image/jpeg'，key 扩展名 jpg
      expect(storage.put).toHaveBeenCalledWith(
        expect.stringMatching(/\.jpg$/),
        expect.any(Buffer),
        'image/jpeg',
      );
    });
  });

  describe('findAll', () => {
    it('filters by ownerId and returns paginated result', async () => {
      prisma.mediaAsset.count.mockResolvedValue(1);
      prisma.mediaAsset.findMany.mockResolvedValue([mockAsset()]);
      const res = await service.findAll('u1', { page: 1, pageSize: 20 });
      expect(prisma.mediaAsset.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ownerId: 'u1' }),
        }),
      );
      expect(res.meta.total).toBe(1);
      expect(res.data[0].tags).toEqual(['新闻']);
    });

    it('applies source filter', async () => {
      prisma.mediaAsset.count.mockResolvedValue(0);
      prisma.mediaAsset.findMany.mockResolvedValue([]);
      await service.findAll('u1', { source: MediaSource.UPLOAD });
      expect(prisma.mediaAsset.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ source: MediaSource.UPLOAD }),
        }),
      );
    });

    describe('ES 全文检索路径(P2)', () => {
      it('ES 启用 + search:按 ES ids 回表取 VO + 保序,用 ES total,不走 LIKE count', async () => {
        search.isConfigured.mockReturnValue(true);
        search.searchMedia.mockResolvedValue({ ids: ['a2', 'a1'], total: 7 });
        // 回表乱序返回,验证按 ES 顺序重排
        prisma.mediaAsset.findMany.mockResolvedValue([
          mockAsset({ id: 'a1' }),
          mockAsset({ id: 'a2' }),
        ]);
        const res = await service.findAll('u1', {
          page: 1,
          pageSize: 20,
          search: '花海',
        });
        expect(search.searchMedia).toHaveBeenCalledWith(
          expect.objectContaining({
            ownerId: 'u1',
            status: MediaStatus.ACTIVE,
            search: '花海',
            page: 1,
            pageSize: 20,
          }),
        );
        // 回表仍双侧同源过滤 owner/status
        expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: { in: ['a2', 'a1'] },
              ownerId: 'u1',
              status: MediaStatus.ACTIVE,
            }),
          }),
        );
        expect(prisma.mediaAsset.count).not.toHaveBeenCalled(); // ES 路径不算 LIKE count
        expect(res.meta.total).toBe(7); // 用 ES 侧 total
        expect(res.data.map((d) => d.id)).toEqual(['a2', 'a1']); // 保 ES 序
      });

      it('ES 命中为空 -> 直接返回空页(用 ES total),不回表', async () => {
        search.isConfigured.mockReturnValue(true);
        search.searchMedia.mockResolvedValue({ ids: [], total: 0 });
        const res = await service.findAll('u1', {
          page: 1,
          pageSize: 20,
          search: '不存在',
        });
        expect(prisma.mediaAsset.findMany).not.toHaveBeenCalled();
        expect(prisma.mediaAsset.count).not.toHaveBeenCalled();
        expect(res.data).toEqual([]);
        expect(res.meta.total).toBe(0);
      });

      it('ES 抛 SearchUnavailableException -> 降级 LIKE 路径', async () => {
        search.isConfigured.mockReturnValue(true);
        search.searchMedia.mockRejectedValue(
          new SearchUnavailableException('ES degraded'),
        );
        prisma.mediaAsset.count.mockResolvedValue(1);
        prisma.mediaAsset.findMany.mockResolvedValue([mockAsset()]);
        const res = await service.findAll('u1', {
          page: 1,
          pageSize: 20,
          search: '花海',
        });
        // 降级:走 LIKE,LIKE 覆盖 tags/aiTags 列
        expect(prisma.mediaAsset.count).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ ownerId: 'u1' }),
          }),
        );
        expect(res.meta.total).toBe(1);
      });

      it('ES 抛非 SearchUnavailable 错误 -> 不吞,继续上抛', async () => {
        search.isConfigured.mockReturnValue(true);
        search.searchMedia.mockRejectedValue(new Error('unexpected boom'));
        await expect(
          service.findAll('u1', { page: 1, pageSize: 20, search: '花海' }),
        ).rejects.toThrow('unexpected boom');
      });

      it('ES 未配置(isConfigured false)+ search -> LIKE,不调 searchMedia', async () => {
        search.isConfigured.mockReturnValue(false);
        prisma.mediaAsset.count.mockResolvedValue(0);
        prisma.mediaAsset.findMany.mockResolvedValue([]);
        await service.findAll('u1', { page: 1, pageSize: 20, search: '花海' });
        expect(search.searchMedia).not.toHaveBeenCalled();
        expect(prisma.mediaAsset.count).toHaveBeenCalled();
      });

      it('无 search/tag -> 即使 ES 启用也不走 ES(纯列表)', async () => {
        search.isConfigured.mockReturnValue(true);
        prisma.mediaAsset.count.mockResolvedValue(0);
        prisma.mediaAsset.findMany.mockResolvedValue([]);
        await service.findAll('u1', { page: 1, pageSize: 20 });
        expect(search.searchMedia).not.toHaveBeenCalled();
      });

      it('status=DELETED(回收站)+ search -> 直走 LIKE,不调 ES(非 ACTIVE 文档不入 ES)', async () => {
        search.isConfigured.mockReturnValue(true);
        prisma.mediaAsset.count.mockResolvedValue(1);
        prisma.mediaAsset.findMany.mockResolvedValue([
          mockAsset({ status: MediaStatus.DELETED }),
        ]);
        const res = await service.findAll('u1', {
          page: 1,
          pageSize: 20,
          search: '花海',
          status: MediaStatus.DELETED,
        });
        // C6:非 ACTIVE 查询必须绕过 ES 直走 LIKE,否则回收站永远查空(ES 只存 ACTIVE)
        expect(search.searchMedia).not.toHaveBeenCalled();
        expect(prisma.mediaAsset.count).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ status: MediaStatus.DELETED }),
          }),
        );
        expect(res.meta.total).toBe(1);
      });
    });
  });

  describe('findOne', () => {
    it('returns asset when owned', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset());
      const res = await service.findOne('asset-1', 'u1');
      expect(res.id).toBe('asset-1');
    });

    it('throws NotFound when not found', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(null);
      await expect(service.findOne('x', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFound when owned by another user (no existence leak)', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        mockAsset({ ownerId: 'u2' }),
      );
      await expect(service.findOne('asset-1', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates owned asset and serializes tags', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset());
      prisma.mediaAsset.update.mockResolvedValue(
        mockAsset({ tags: '["a","b"]', altText: 'alt' }),
      );
      const res = await service.update('asset-1', 'u1', {
        altText: 'alt',
        tags: ['a', 'b'],
      });
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tags: '["a","b"]',
            altText: 'alt',
          }),
        }),
      );
      expect(res.tags).toEqual(['a', 'b']);
      // P2:更新后发射 updated 事件(SearchService 重建 ES 文档)
      expect(events.emit).toHaveBeenCalledWith('media.asset.updated', {
        assetId: 'asset-1',
      });
    });

    it('throws NotFound when not owned', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        mockAsset({ ownerId: 'u2' }),
      );
      await expect(service.update('x', 'u1', { altText: 'a' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes and removes COS object', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset());
      prisma.mediaAsset.update.mockResolvedValue(
        mockAsset({ status: MediaStatus.DELETED }),
      );
      const res = await service.remove('asset-1', 'u1');
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: MediaStatus.DELETED } }),
      );
      expect(storage.delete).toHaveBeenCalledWith(
        'cms-ng/media/u1/202607/abc.png',
      );
      expect(res).toEqual({ success: true });
      // P2:软删后发射 deleted 事件(SearchService 从 ES 删除,防搜出已删图)
      expect(events.emit).toHaveBeenCalledWith('media.asset.deleted', {
        assetId: 'asset-1',
      });
    });

    it('does not throw when COS delete fails (fail-open)', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset());
      prisma.mediaAsset.update.mockResolvedValue(
        mockAsset({ status: MediaStatus.DELETED }),
      );
      storage.delete.mockRejectedValue(new Error('cos down'));
      await expect(service.remove('asset-1', 'u1')).resolves.toBeDefined();
    });

    it('throws NotFound when not owned', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(
        mockAsset({ ownerId: 'u2' }),
      );
      await expect(service.remove('x', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
