import {
  ContentLanguage,
  DEFAULT_CONTENT_LANGUAGE,
  DEFAULT_DISPLAY_LANGUAGE,
} from '@cms-ng/shared';
import { createMockPrismaService } from '../prisma/prisma.service.mock';
import { LanguageSettingsService } from './language-settings.service';

describe('LanguageSettingsService', () => {
  let prisma: ReturnType<typeof createMockPrismaService>;
  let service: LanguageSettingsService;

  beforeEach(() => {
    prisma = createMockPrismaService();
    service = new LanguageSettingsService(prisma);
  });

  it('returns built-in defaults when no system row exists', async () => {
    prisma.systemLanguageSetting.findUnique.mockResolvedValue(null);

    await expect(service.get()).resolves.toEqual({
      displayLanguage: DEFAULT_DISPLAY_LANGUAGE,
      contentLanguage: DEFAULT_CONTENT_LANGUAGE,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it('resolves a personal content-language preference before the system default', async () => {
    await expect(
      service.resolveContentLanguage(ContentLanguage.ENGLISH),
    ).resolves.toBe(ContentLanguage.ENGLISH);

    expect(prisma.systemLanguageSetting.findUnique).not.toHaveBeenCalled();
  });

  it('uses the system content language when a user has no personal preference', async () => {
    prisma.systemLanguageSetting.findUnique.mockResolvedValue({
      id: 'global',
      displayLanguage: 'en',
      contentLanguage: ContentLanguage.TRADITIONAL_CHINESE_HK,
      updatedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: null,
    });

    await expect(service.resolveContentLanguage(null)).resolves.toBe(
      ContentLanguage.TRADITIONAL_CHINESE_HK,
    );
  });

  it('updates both system defaults as one setting', async () => {
    const updatedAt = new Date('2026-08-27T01:00:00.000Z');
    prisma.systemLanguageSetting.upsert.mockResolvedValue({
      id: 'global',
      displayLanguage: 'en',
      contentLanguage: ContentLanguage.ENGLISH,
      updatedById: 'admin-id',
      createdAt: updatedAt,
      updatedAt,
      updatedBy: { id: 'admin-id', name: 'Admin', email: 'admin@example.com' },
    });

    await expect(
      service.update(
        { displayLanguage: 'en', contentLanguage: ContentLanguage.ENGLISH },
        'admin-id',
      ),
    ).resolves.toMatchObject({
      displayLanguage: 'en',
      contentLanguage: ContentLanguage.ENGLISH,
      updatedAt,
    });
    expect(prisma.systemLanguageSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'global' },
        create: expect.objectContaining({ updatedById: 'admin-id' }),
        update: expect.objectContaining({ updatedById: 'admin-id' }),
      }),
    );
  });
});
