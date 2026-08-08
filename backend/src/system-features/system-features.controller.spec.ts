import { Test, TestingModule } from '@nestjs/testing';
import { SystemFeature, UserRole } from '@cms-ng/shared';
import { SystemFeaturesController } from './system-features.controller';
import { SystemFeaturesService } from './system-features.service';

describe('SystemFeaturesController', () => {
  let controller: SystemFeaturesController;
  const service = {
    getStatuses: jest.fn(),
    getDetails: jest.fn(),
    setEnabled: jest.fn(),
    getAudit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemFeaturesController],
      providers: [{ provide: SystemFeaturesService, useValue: service }],
    }).compile();
    controller = module.get(SystemFeaturesController);
  });

  it('exposes effective feature statuses to authenticated users', async () => {
    service.getStatuses.mockResolvedValue([
      { key: SystemFeature.MEDIA, enabled: false },
    ]);

    await expect(controller.status()).resolves.toEqual({
      success: true,
      data: [{ key: SystemFeature.MEDIA, enabled: false }],
    });
  });

  it('allows only SUPER_ADMIN to update a feature and records the operator', async () => {
    service.setEnabled.mockResolvedValue({
      key: SystemFeature.MEDIA,
      enabled: false,
    });

    await expect(
      controller.update(
        SystemFeature.MEDIA,
        { enabled: false, reason: '维护媒体库' },
        'super-admin-id',
      ),
    ).resolves.toEqual({
      success: true,
      data: { key: SystemFeature.MEDIA, enabled: false },
    });

    expect(service.setEnabled).toHaveBeenCalledWith(
      SystemFeature.MEDIA,
      false,
      'super-admin-id',
      '维护媒体库',
    );
    expect(
      Reflect.getMetadata('roles', SystemFeaturesController.prototype.update),
    ).toEqual([UserRole.SUPER_ADMIN]);
  });

  it('restricts detailed feature management data to SUPER_ADMIN', async () => {
    service.getDetails.mockResolvedValue([
      { key: SystemFeature.MEDIA, enabled: false, reason: '维护媒体库' },
    ]);

    await expect(controller.findAll()).resolves.toEqual({
      success: true,
      data: [
        { key: SystemFeature.MEDIA, enabled: false, reason: '维护媒体库' },
      ],
    });
    expect(
      Reflect.getMetadata('roles', SystemFeaturesController.prototype.findAll),
    ).toEqual([UserRole.SUPER_ADMIN]);
  });

  it('restricts feature audit history to SUPER_ADMIN', async () => {
    service.getAudit.mockResolvedValue([
      { feature: SystemFeature.MEDIA, fromEnabled: true, toEnabled: false },
    ]);

    await expect(controller.audit(SystemFeature.MEDIA)).resolves.toEqual({
      success: true,
      data: [
        { feature: SystemFeature.MEDIA, fromEnabled: true, toEnabled: false },
      ],
    });
    expect(service.getAudit).toHaveBeenCalledWith(SystemFeature.MEDIA);
    expect(
      Reflect.getMetadata('roles', SystemFeaturesController.prototype.audit),
    ).toEqual([UserRole.SUPER_ADMIN]);
  });
});
