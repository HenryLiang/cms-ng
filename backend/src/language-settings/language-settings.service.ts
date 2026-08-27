import { Injectable } from '@nestjs/common';
import {
  ContentLanguage,
  DEFAULT_CONTENT_LANGUAGE,
  DEFAULT_DISPLAY_LANGUAGE,
  DISPLAY_LANGUAGES,
  type DisplayLanguage,
  type LanguageSettings,
} from '@cms-ng/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateLanguageSettingsDto } from './dto/update-language-settings.dto';

const GLOBAL_SETTING_ID = 'global';

type LanguageSettingsResult = LanguageSettings & {
  updatedAt: Date | null;
  updatedBy: { id: string; name: string; email: string } | null;
};

@Injectable()
export class LanguageSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<LanguageSettingsResult> {
    const row = await this.prisma.systemLanguageSetting.findUnique({
      where: { id: GLOBAL_SETTING_ID },
      include: {
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!row) {
      return {
        displayLanguage: DEFAULT_DISPLAY_LANGUAGE,
        contentLanguage: DEFAULT_CONTENT_LANGUAGE,
        updatedAt: null,
        updatedBy: null,
      };
    }

    return {
      displayLanguage: this.normalizeDisplayLanguage(row.displayLanguage),
      contentLanguage: row.contentLanguage as ContentLanguage,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    };
  }

  async update(
    settings: UpdateLanguageSettingsDto,
    operatorId: string,
  ): Promise<LanguageSettingsResult> {
    const row = await this.prisma.systemLanguageSetting.upsert({
      where: { id: GLOBAL_SETTING_ID },
      create: {
        id: GLOBAL_SETTING_ID,
        displayLanguage: settings.displayLanguage,
        contentLanguage: settings.contentLanguage,
        updatedById: operatorId,
      },
      update: {
        displayLanguage: settings.displayLanguage,
        contentLanguage: settings.contentLanguage,
        updatedById: operatorId,
      },
      include: {
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      displayLanguage: this.normalizeDisplayLanguage(row.displayLanguage),
      contentLanguage: row.contentLanguage as ContentLanguage,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    };
  }

  async resolveContentLanguage(
    personalPreference?: ContentLanguage | null,
  ): Promise<ContentLanguage> {
    if (personalPreference) return personalPreference;
    return (await this.get()).contentLanguage;
  }

  private normalizeDisplayLanguage(value: string): DisplayLanguage {
    return DISPLAY_LANGUAGES.includes(value as DisplayLanguage)
      ? (value as DisplayLanguage)
      : DEFAULT_DISPLAY_LANGUAGE;
  }
}
