import { BadRequestException } from '@nestjs/common';
import { BrandPreset } from '@cms-ng/shared';
import sharp from 'sharp';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import { BrandSettingsService } from './brand-settings.service';

describe('BrandSettingsService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let storage: { put: jest.Mock; delete: jest.Mock };
  let service: BrandSettingsService;
  let validPng: Buffer;

  beforeAll(async () => {
    validPng = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { r: 37, g: 99, b: 235, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  });

  beforeEach(() => {
    prisma = createMockPrismaService();
    storage = {
      put: jest.fn().mockResolvedValue({
        url: 'https://cdn.example.com/cms-ng/branding/new.webp',
        key: 'cms-ng/branding/new.webp',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new BrandSettingsService(prisma, storage);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns the current product identity when no setting exists', async () => {
    prisma.systemBrandSetting.findUnique.mockResolvedValue(null);

    await expect(service.get()).resolves.toEqual({
      preset: BrandPreset.CMS_NG,
      name: '01创作大脑',
      logoUrl: '/brand-presets/cms-ng.svg',
      isCustom: false,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it('selects a built-in preset without uploading an image', async () => {
    const updatedAt = new Date('2026-08-27T06:00:00.000Z');
    prisma.systemBrandSetting.findUnique.mockResolvedValue(null);
    prisma.systemBrandSetting.upsert.mockResolvedValue({
      id: 'global',
      preset: BrandPreset.SMART_MEDIA_HUB,
      name: '智媒中枢',
      logoUrl: null,
      logoKey: null,
      updatedById: 'admin-id',
      createdAt: updatedAt,
      updatedAt,
      updatedBy: { id: 'admin-id', name: 'Admin', email: 'admin@example.com' },
    });

    await expect(
      service.update({ preset: BrandPreset.SMART_MEDIA_HUB }, 'admin-id'),
    ).resolves.toMatchObject({
      preset: BrandPreset.SMART_MEDIA_HUB,
      name: '智媒中枢',
      logoUrl: '/brand-presets/smart-media-hub.png',
      isCustom: false,
    });
    expect(storage.put).not.toHaveBeenCalled();
    expect(prisma.systemBrandSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          preset: BrandPreset.SMART_MEDIA_HUB,
          name: '智媒中枢',
          logoUrl: null,
          logoKey: null,
          updatedById: 'admin-id',
        }),
      }),
    );
  });

  it('stores a normalized custom name and a safe webp logo', async () => {
    const updatedAt = new Date('2026-08-27T06:00:00.000Z');
    prisma.systemBrandSetting.findUnique.mockResolvedValue(null);
    prisma.systemBrandSetting.upsert.mockImplementation(({ create }) =>
      Promise.resolve({
        id: 'global',
        ...create,
        createdAt: updatedAt,
        updatedAt,
        updatedBy: null,
      }),
    );

    await expect(
      service.update(
        { preset: BrandPreset.CUSTOM, name: '  我的编辑部  ' },
        'admin-id',
        {
          buffer: validPng,
          originalname: 'brand.png',
          mimetype: 'image/png',
          size: validPng.length,
        },
      ),
    ).resolves.toMatchObject({
      preset: BrandPreset.CUSTOM,
      name: '我的编辑部',
      logoUrl: 'https://cdn.example.com/cms-ng/branding/new.webp',
      isCustom: true,
    });
    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^cms-ng\/branding\/[0-9a-f-]+\.webp$/),
      expect.any(Buffer),
      'image/webp',
    );
  });

  it('rejects a first custom brand without an image', async () => {
    prisma.systemBrandSetting.findUnique.mockResolvedValue(null);

    await expect(
      service.update(
        { preset: BrandPreset.CUSTOM, name: '我的编辑部' },
        'admin-id',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.systemBrandSetting.upsert).not.toHaveBeenCalled();
  });

  it('rejects files whose content is not a supported image', async () => {
    prisma.systemBrandSetting.findUnique.mockResolvedValue(null);

    await expect(
      service.update(
        { preset: BrandPreset.CUSTOM, name: '我的编辑部' },
        'admin-id',
        {
          buffer: Buffer.from('not-an-image'),
          originalname: 'fake.png',
          mimetype: 'image/png',
          size: 12,
        },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('renames an existing custom brand without requiring another upload', async () => {
    const updatedAt = new Date('2026-08-27T06:00:00.000Z');
    const existing = {
      id: 'global',
      preset: BrandPreset.CUSTOM,
      name: '旧名称',
      logoUrl: 'https://cdn.example.com/old.webp',
      logoKey: 'cms-ng/branding/old.webp',
      updatedById: 'admin-id',
      createdAt: updatedAt,
      updatedAt,
    };
    prisma.systemBrandSetting.findUnique.mockResolvedValue(existing);
    prisma.systemBrandSetting.upsert.mockImplementation(({ update }) =>
      Promise.resolve({
        ...existing,
        ...update,
        updatedBy: null,
      }),
    );

    await expect(
      service.update(
        { preset: BrandPreset.CUSTOM, name: '新名称' },
        'admin-id',
      ),
    ).resolves.toMatchObject({
      name: '新名称',
      logoUrl: 'https://cdn.example.com/old.webp',
    });
    expect(storage.put).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('removes a replaced custom object after selecting a built-in preset', async () => {
    const updatedAt = new Date('2026-08-27T06:00:00.000Z');
    prisma.systemBrandSetting.findUnique.mockResolvedValue({
      id: 'global',
      preset: BrandPreset.CUSTOM,
      name: '旧名称',
      logoUrl: 'https://cdn.example.com/old.webp',
      logoKey: 'cms-ng/branding/old.webp',
      updatedById: 'admin-id',
      createdAt: updatedAt,
      updatedAt,
    });
    prisma.systemBrandSetting.upsert.mockResolvedValue({
      id: 'global',
      preset: BrandPreset.CONTENT_ENGINE,
      name: '内容引擎',
      logoUrl: null,
      logoKey: null,
      updatedById: 'admin-id',
      createdAt: updatedAt,
      updatedAt,
      updatedBy: null,
    });

    await service.update({ preset: BrandPreset.CONTENT_ENGINE }, 'admin-id');

    expect(storage.delete).toHaveBeenCalledWith('cms-ng/branding/old.webp');
  });
});
