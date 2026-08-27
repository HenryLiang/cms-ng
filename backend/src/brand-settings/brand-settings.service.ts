import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  BrandPreset,
  DEFAULT_BRAND_PRESET,
  getBrandPresetDefinition,
  type BrandSettings,
} from '@cms-ng/shared';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../storage/storage.service';
import { UpdateBrandSettingsDto } from './dto/update-brand-settings.dto';

const GLOBAL_SETTING_ID = 'global';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_LOGO_PIXELS = 25_000_000;
const MAX_LOGO_EDGE = 512;

interface RawLogoFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

type BrandSettingsResult = BrandSettings & {
  updatedAt: Date | null;
  updatedBy: { id: string; name: string; email: string } | null;
};

@Injectable()
export class BrandSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async get(): Promise<BrandSettingsResult> {
    const row = await this.prisma.systemBrandSetting.findUnique({
      where: { id: GLOBAL_SETTING_ID },
      include: {
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });
    return this.serialize(row);
  }

  async update(
    settings: UpdateBrandSettingsDto,
    operatorId: string,
    file?: RawLogoFile,
  ): Promise<BrandSettingsResult> {
    const existing = await this.prisma.systemBrandSetting.findUnique({
      where: { id: GLOBAL_SETTING_ID },
    });

    if (settings.preset !== BrandPreset.CUSTOM) {
      if (file) {
        throw new BadRequestException('选择内置品牌时不能上传自定义 Logo');
      }
      const preset = getBrandPresetDefinition(settings.preset);
      if (!preset) throw new BadRequestException('未知品牌预设');

      const row = await this.persist(
        {
          preset: preset.key,
          name: preset.name,
          logoUrl: null,
          logoKey: null,
        },
        operatorId,
      );
      await this.deleteReplacedLogo(existing?.logoKey, null);
      return this.serialize(row);
    }

    const name = settings.name?.trim();
    if (!name || name.length < 2 || name.length > 40) {
      throw new BadRequestException('自定义系统名称须为 2–40 个字符');
    }

    let logoUrl =
      existing?.preset === BrandPreset.CUSTOM ? existing.logoUrl : null;
    let logoKey =
      existing?.preset === BrandPreset.CUSTOM ? existing.logoKey : null;
    let uploadedKey: string | null = null;

    if (file) {
      const webp = await this.normalizeLogo(file);
      uploadedKey = `cms-ng/branding/${randomUUID()}.webp`;
      const stored = await this.storage.put(uploadedKey, webp, 'image/webp');
      logoUrl = stored.url;
      logoKey = stored.key;
    }
    if (!logoUrl || !logoKey) {
      throw new BadRequestException('首次使用自定义品牌时必须上传 Logo');
    }

    try {
      const row = await this.persist(
        {
          preset: BrandPreset.CUSTOM,
          name,
          logoUrl,
          logoKey,
        },
        operatorId,
      );
      await this.deleteReplacedLogo(existing?.logoKey, logoKey);
      return this.serialize(row);
    } catch (error) {
      if (uploadedKey)
        await Promise.allSettled([this.storage.delete(uploadedKey)]);
      throw error;
    }
  }

  private persist(
    values: {
      preset: BrandPreset;
      name: string;
      logoUrl: string | null;
      logoKey: string | null;
    },
    operatorId: string,
  ) {
    return this.prisma.systemBrandSetting.upsert({
      where: { id: GLOBAL_SETTING_ID },
      create: {
        id: GLOBAL_SETTING_ID,
        ...values,
        updatedById: operatorId,
      },
      update: {
        ...values,
        updatedById: operatorId,
      },
      include: {
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  private async normalizeLogo(file: RawLogoFile): Promise<Buffer> {
    if (file.size > MAX_LOGO_BYTES) {
      throw new BadRequestException('Logo 图片不能超过 2 MB');
    }
    if (!this.hasSupportedSignature(file.buffer)) {
      throw new BadRequestException('Logo 仅支持 PNG、JPG 或 WebP 图片');
    }
    try {
      return await sharp(file.buffer, { limitInputPixels: MAX_LOGO_PIXELS })
        .rotate()
        .resize(MAX_LOGO_EDGE, MAX_LOGO_EDGE, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 90 })
        .toBuffer();
    } catch {
      throw new BadRequestException('Logo 图片损坏或尺寸无效');
    }
  }

  private hasSupportedSignature(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;
    const isJpeg =
      buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    const isWebp =
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;
    return isJpeg || isPng || isWebp;
  }

  private async deleteReplacedLogo(
    previousKey: string | null | undefined,
    activeKey: string | null,
  ): Promise<void> {
    if (!previousKey || previousKey === activeKey) return;
    await Promise.allSettled([this.storage.delete(previousKey)]);
  }

  private serialize(
    row: {
      preset: string;
      name: string;
      logoUrl: string | null;
      updatedAt: Date;
      updatedBy?: { id: string; name: string; email: string } | null;
    } | null,
  ): BrandSettingsResult {
    if (!row) {
      return {
        preset: DEFAULT_BRAND_PRESET.key,
        name: DEFAULT_BRAND_PRESET.name,
        logoUrl: DEFAULT_BRAND_PRESET.logoUrl,
        isCustom: false,
        updatedAt: null,
        updatedBy: null,
      };
    }

    const preset = Object.values(BrandPreset).includes(
      row.preset as BrandPreset,
    )
      ? (row.preset as BrandPreset)
      : DEFAULT_BRAND_PRESET.key;
    if (preset === BrandPreset.CUSTOM && row.logoUrl) {
      return {
        preset,
        name: row.name,
        logoUrl: row.logoUrl,
        isCustom: true,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy ?? null,
      };
    }

    const definition = getBrandPresetDefinition(preset) ?? DEFAULT_BRAND_PRESET;
    return {
      preset: definition.key,
      name: definition.name,
      logoUrl: definition.logoUrl,
      isCustom: false,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy ?? null,
    };
  }
}
