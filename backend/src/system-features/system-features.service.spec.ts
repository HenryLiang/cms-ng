import { Test, TestingModule } from '@nestjs/testing';
import { SystemFeature } from '@cms-ng/shared';
import { PrismaService } from '../prisma/prisma.service';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import { SystemFeaturesService } from './system-features.service';

describe('SystemFeaturesService', () => {
  let service: SystemFeaturesService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemFeaturesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SystemFeaturesService);
  });

  it('defaults missing switches to open and honors an explicit closed row', async () => {
    prisma.systemFeatureSwitch.findMany.mockResolvedValue([
      { feature: SystemFeature.MEDIA, enabled: false },
    ] as never);

    const statuses = await service.getStatuses();

    expect(
      statuses.find((item) => item.key === SystemFeature.WORKBENCH)?.enabled,
    ).toBe(true);
    expect(
      statuses.find((item) => item.key === SystemFeature.ARTICLES)?.enabled,
    ).toBe(true);
    expect(
      statuses.find((item) => item.key === SystemFeature.MEDIA)?.enabled,
    ).toBe(false);
  });

  it('rejects closing a feature without an audit reason', async () => {
    await expect(
      service.setEnabled(SystemFeature.MEDIA, false, 'super-admin-id', '   '),
    ).rejects.toThrow('关闭功能时必须填写原因');

    expect(prisma.systemFeatureSwitch.upsert).not.toHaveBeenCalled();
  });

  it('rejects changes to protected features', async () => {
    await expect(
      service.setEnabled(
        SystemFeature.WORKBENCH,
        false,
        'super-admin-id',
        '测试关闭',
      ),
    ).rejects.toThrow('该功能不可关闭');
  });

  it('persists a real state change and its audit record atomically', async () => {
    const updatedAt = new Date('2026-08-08T12:00:00.000Z');
    prisma.systemFeatureSwitch.findUnique.mockResolvedValue(null);
    prisma.systemFeatureSwitch.upsert.mockResolvedValue({
      feature: SystemFeature.MEDIA,
      enabled: false,
      updatedById: 'super-admin-id',
      reason: '维护媒体库',
      createdAt: updatedAt,
      updatedAt,
      updatedBy: {
        id: 'super-admin-id',
        name: 'Root',
        email: 'root@example.com',
      },
    });
    prisma.systemFeatureAudit.create.mockResolvedValue({ id: 'audit-id' });

    const result = await service.setEnabled(
      SystemFeature.MEDIA,
      false,
      'super-admin-id',
      '  维护媒体库  ',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [lockQuery] = (prisma.$queryRaw as jest.Mock).mock.calls[0] as [
      TemplateStringsArray,
    ];
    expect(lockQuery.join('')).toContain('FOR UPDATE');
    expect(prisma.systemFeatureSwitch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { feature: SystemFeature.MEDIA },
        create: expect.objectContaining({
          enabled: false,
          reason: '维护媒体库',
          updatedById: 'super-admin-id',
        }),
        update: expect.objectContaining({
          enabled: false,
          reason: '维护媒体库',
          updatedById: 'super-admin-id',
        }),
      }),
    );
    expect(prisma.systemFeatureAudit.create).toHaveBeenCalledWith({
      data: {
        feature: SystemFeature.MEDIA,
        previousEnabled: true,
        enabled: false,
        operatorId: 'super-admin-id',
        reason: '维护媒体库',
      },
    });
    expect(result.enabled).toBe(false);
    expect(result.updatedBy?.name).toBe('Root');
  });

  it('does not write a duplicate audit after the locked row already has the requested state', async () => {
    const updatedAt = new Date('2026-08-08T12:00:00.000Z');
    prisma.systemFeatureSwitch.findUnique.mockResolvedValue({
      feature: SystemFeature.MEDIA,
      enabled: false,
      updatedById: 'super-admin-id',
      reason: '维护媒体库',
      createdAt: updatedAt,
      updatedAt,
      updatedBy: {
        id: 'super-admin-id',
        name: 'Root',
        email: 'root@example.com',
      },
    });

    const result = await service.setEnabled(
      SystemFeature.MEDIA,
      false,
      'other-super-admin-id',
      '重复关闭',
    );

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.systemFeatureSwitch.upsert).not.toHaveBeenCalled();
    expect(prisma.systemFeatureAudit.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ enabled: false, reason: '维护媒体库' });
  });

  it('merges persisted details with protected and default-open catalog items', async () => {
    const updatedAt = new Date('2026-08-08T12:00:00.000Z');
    prisma.systemFeatureSwitch.findMany.mockResolvedValue([
      {
        feature: SystemFeature.VIDEO,
        enabled: false,
        updatedById: 'super-admin-id',
        reason: '供应商维护',
        createdAt: updatedAt,
        updatedAt,
        updatedBy: {
          id: 'super-admin-id',
          name: 'Root',
          email: 'root@example.com',
        },
      },
    ] as never);

    const details = await service.getDetails();

    expect(details).toHaveLength(10);
    expect(
      details.find((item) => item.key === SystemFeature.VIDEO),
    ).toMatchObject({
      enabled: false,
      reason: '供应商维护',
      updatedBy: { name: 'Root' },
    });
    expect(
      details.find((item) => item.key === SystemFeature.SETTINGS),
    ).toMatchObject({
      enabled: true,
      configurable: false,
      updatedBy: null,
    });
  });

  it('returns newest-first audit history with operator details', async () => {
    const createdAt = new Date('2026-08-08T12:00:00.000Z');
    prisma.systemFeatureAudit.findMany.mockResolvedValue([
      {
        id: 'audit-id',
        feature: SystemFeature.MEDIA,
        previousEnabled: true,
        enabled: false,
        operatorId: 'super-admin-id',
        reason: '维护媒体库',
        createdAt,
        operator: {
          id: 'super-admin-id',
          name: 'Root',
          email: 'root@example.com',
        },
      },
    ] as never);

    const history = await service.getAudit(SystemFeature.MEDIA);

    expect(prisma.systemFeatureAudit.findMany).toHaveBeenCalledWith({
      where: { feature: SystemFeature.MEDIA },
      include: {
        operator: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    expect(history[0]).toMatchObject({
      previousEnabled: true,
      enabled: false,
      reason: '维护媒体库',
      operator: { name: 'Root' },
    });
  });
});
