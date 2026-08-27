import { UserRole } from '@cms-ng/shared';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { LanguageSettingsController } from './language-settings.controller';
import { LanguageSettingsService } from './language-settings.service';

describe('LanguageSettingsController', () => {
  const settings = {
    get: jest.fn(),
    update: jest.fn(),
  };
  const controller = new LanguageSettingsController(
    settings as unknown as LanguageSettingsService,
  );

  afterEach(() => jest.clearAllMocks());

  it('allows public reads of the system defaults', async () => {
    settings.get.mockResolvedValue({
      displayLanguage: 'zh-CN',
      contentLanguage: 'SIMPLIFIED_CHINESE',
      updatedAt: null,
      updatedBy: null,
    });

    await expect(controller.get()).resolves.toMatchObject({
      success: true,
      data: { displayLanguage: 'zh-CN' },
    });
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        LanguageSettingsController.prototype.get,
      ),
    ).toBe(true);
  });

  it('restricts updates to super administrators', async () => {
    settings.update.mockResolvedValue({
      displayLanguage: 'en',
      contentLanguage: 'ENGLISH',
      updatedAt: new Date(),
      updatedBy: null,
    });

    await expect(
      controller.update(
        { displayLanguage: 'en', contentLanguage: 'ENGLISH' as never },
        'admin-id',
      ),
    ).resolves.toMatchObject({
      success: true,
      data: { displayLanguage: 'en', contentLanguage: 'ENGLISH' },
    });
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        LanguageSettingsController.prototype.update,
      ),
    ).toEqual([UserRole.SUPER_ADMIN]);
  });
});
