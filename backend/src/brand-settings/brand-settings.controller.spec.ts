import { BrandPreset, UserRole } from '@cms-ng/shared';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { BrandSettingsController } from './brand-settings.controller';
import { BrandSettingsService } from './brand-settings.service';

describe('BrandSettingsController', () => {
  const settings = {
    get: jest.fn(),
    update: jest.fn(),
  };
  const controller = new BrandSettingsController(
    settings as unknown as BrandSettingsService,
  );

  afterEach(() => jest.clearAllMocks());

  it('allows public reads of the active brand', async () => {
    settings.get.mockResolvedValue({
      preset: BrandPreset.CMS_NG,
      name: '01创作大脑',
      logoUrl: '/brand-presets/cms-ng.svg',
      isCustom: false,
      updatedAt: null,
      updatedBy: null,
    });

    await expect(controller.get()).resolves.toEqual({
      success: true,
      data: {
        preset: BrandPreset.CMS_NG,
        name: '01创作大脑',
        logoUrl: '/brand-presets/cms-ng.svg',
        isCustom: false,
      },
    });
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, BrandSettingsController.prototype.get),
    ).toBe(true);
  });

  it('restricts brand updates to super administrators', async () => {
    settings.update.mockResolvedValue({
      preset: BrandPreset.CONTENT_ENGINE,
      name: '内容引擎',
      logoUrl: '/brand-presets/content-engine.png',
      isCustom: false,
    });

    await expect(
      controller.update(
        { preset: BrandPreset.CONTENT_ENGINE },
        'admin-id',
        undefined,
      ),
    ).resolves.toMatchObject({
      success: true,
      data: { name: '内容引擎' },
    });
    expect(
      Reflect.getMetadata(ROLES_KEY, BrandSettingsController.prototype.update),
    ).toEqual([UserRole.SUPER_ADMIN]);
  });
});
