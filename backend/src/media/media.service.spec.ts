import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import { STORAGE_SERVICE } from '../storage/storage.service';
import { MediaSource, MediaStatus, MediaLibraryType } from '@cms-ng/shared';

describe('MediaService', () => {
  let service: MediaService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let storage: { put: jest.Mock; delete: jest.Mock; copy: jest.Mock };
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
      put: jest
        .fn()
        .mockResolvedValue({
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: prisma },
        { provide: STORAGE_SERVICE, useValue: storage },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get<MediaService>(MediaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('upload', () => {
    it('throws when no files provided', async () => {
      await expect(service.upload([], 'u1')).rejects.toThrow(BadRequestException);
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
  });

  describe('findOne', () => {
    it('returns asset when owned', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset());
      const res = await service.findOne('asset-1', 'u1');
      expect(res.id).toBe('asset-1');
    });

    it('throws NotFound when not found', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(null);
      await expect(service.findOne('x', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when owned by another user (no existence leak)', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset({ ownerId: 'u2' }));
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
    });

    it('throws NotFound when not owned', async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset({ ownerId: 'u2' }));
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
      prisma.mediaAsset.findUnique.mockResolvedValue(mockAsset({ ownerId: 'u2' }));
      await expect(service.remove('x', 'u1')).rejects.toThrow(NotFoundException);
    });
  });
});
