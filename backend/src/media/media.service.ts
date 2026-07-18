import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, MediaAsset } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  STORAGE_SERVICE,
  type StorageService,
} from '../storage/storage.service';
import {
  parsePaginationParams,
  buildPaginatedResponse,
  type PaginatedResponse,
} from '../common/pagination';
import { safeJsonParse } from '../common/json.utils';
import { MediaSource, MediaStatus, MediaLibraryType } from '@cms-ng/shared';
import { imageSize } from 'image-size';
import { randomUUID } from 'crypto';
import { QueryMediaDto } from './dto/query-media.dto';
import { UpdateMediaDto } from './dto/update-media.dto';

/** 受支持的图片 MIME -> 扩展名 */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_FILENAME_LENGTH = 180; // fileName 列 VARCHAR(191)，留余量

/** 序列化后的媒体资源 VO：tags 由 JSON string 解析为数组 */
export type MediaAssetVo = Omit<MediaAsset, 'tags'> & { tags: string[] };

interface RawUploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class MediaService {
  private readonly maxUploadBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {
    const configured = this.config.get<string>('MEDIA_UPLOAD_MAX_BYTES');
    const parsed = configured ? Number(configured) : NaN;
    this.maxUploadBytes =
      Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_UPLOAD_BYTES;
  }

  // ===== Upload =====
  async upload(
    files: RawUploadedFile[],
    ownerId: string,
  ): Promise<MediaAssetVo[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }
    // 先全部校验（无副作用），任一失败整批拒绝；全过再上传+入库
    const validated = files.map((f) => this.validateFile(f));
    const created: MediaAssetVo[] = [];
    for (const v of validated) {
      created.push(await this.persistUpload(v, ownerId));
    }
    return created;
  }

  private validateFile(file: RawUploadedFile) {
    if (file.size > this.maxUploadBytes) {
      throw new BadRequestException(
        `File "${file.originalname}" exceeds size limit (${this.maxUploadBytes} bytes)`,
      );
    }
    const detected = this.detectImageType(file.buffer);
    if (!detected) {
      throw new BadRequestException(
        `File "${file.originalname}" is not a supported image format (jpg/png/webp/gif only)`,
      );
    }
    return {
      buffer: file.buffer,
      fileName:
        sanitizeFileName(file.originalname) ||
        `upload.${MIME_TO_EXT[detected]}`,
      mimeType: detected,
      ext: MIME_TO_EXT[detected],
      size: file.size,
    };
  }

  /** 通过文件头 magic number 判定真实图片类型，防伪造扩展名 */
  private detectImageType(buf: Buffer): string | null {
    if (!buf || buf.length < 12) return null;
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
      return 'image/jpeg';
    // PNG: 89 50 4E 47
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    )
      return 'image/png';
    // GIF: 47 49 46 38
    if (
      buf[0] === 0x47 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x38
    )
      return 'image/gif';
    // WebP: RIFF....WEBP
    if (
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    )
      return 'image/webp';
    return null;
  }

  private async persistUpload(
    v: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      ext: string;
      size: number;
    },
    ownerId: string,
  ): Promise<MediaAssetVo> {
    const key = this.buildKey(ownerId, v.ext);
    const { url } = await this.storage.put(key, v.buffer, v.mimeType);
    try {
      const { width, height } = this.readDimensions(v.buffer);
      const asset = await this.prisma.mediaAsset.create({
        data: {
          storageKey: key,
          url,
          thumbnailUrl: this.storage.thumbnailUrl(url),
          fileName: v.fileName,
          mimeType: v.mimeType,
          size: v.size,
          width,
          height,
          source: MediaSource.UPLOAD,
          ownerId,
          libraryType: MediaLibraryType.PERSONAL,
          status: MediaStatus.ACTIVE,
        },
      });
      return this.serialize(asset);
    } catch (err) {
      // DB 入库失败：回删已上传的 COS 对象，避免孤儿（fail-open 回删失败不掩盖原错误）
      try {
        await this.storage.delete(key);
      } catch {
        // intentional
      }
      throw err;
    }
  }

  private buildKey(ownerId: string, ext: string): string {
    return `cms-ng/media/${ownerId}/${this.currentYYYYMM()}/${randomUUID()}.${ext}`;
  }

  private currentYYYYMM(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private readDimensions(buf: Buffer): {
    width: number | null;
    height: number | null;
  } {
    try {
      const dim = imageSize(buf);
      return {
        width: typeof dim.width === 'number' ? dim.width : null,
        height: typeof dim.height === 'number' ? dim.height : null,
      };
    } catch {
      return { width: null, height: null };
    }
  }

  // ===== List =====
  async findAll(
    userId: string,
    query: QueryMediaDto,
  ): Promise<PaginatedResponse<MediaAssetVo>> {
    const { page, pageSize } = parsePaginationParams(query);
    const where: Prisma.MediaAssetWhereInput = {
      ownerId: userId,
      status: query.status ?? MediaStatus.ACTIVE,
    };
    if (query.source) where.source = query.source;
    if (query.search) {
      where.OR = [
        { fileName: { contains: query.search } },
        { altText: { contains: query.search } },
        { title: { contains: query.search } },
        { prompt: { contains: query.search } },
      ];
    }
    if (query.tag) {
      // tags 是 JSON string 数组，用 contains 模糊匹配（转义双引号）
      where.tags = { contains: `"${query.tag.replace(/"/g, '\\"')}"` };
    }
    // 只读组合用 Promise.all（与 articles/stories/users/billing 惯例一致，避免 $transaction 串行开销）
    const [total, rows] = await Promise.all([
      this.prisma.mediaAsset.count({ where }),
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return buildPaginatedResponse(
      rows.map((r) => this.serialize(r)),
      total,
      { page, pageSize },
    );
  }

  // ===== Get one =====
  async findOne(id: string, userId: string): Promise<MediaAssetVo> {
    return this.serialize(await this.getOwnedOrThrow(id, userId));
  }

  // ===== Update（status 不开放编辑，只能经 remove 置 DELETED，避免状态机绕过）=====
  async update(
    id: string,
    userId: string,
    dto: UpdateMediaDto,
  ): Promise<MediaAssetVo> {
    const asset = await this.getOwnedOrThrow(id, userId);
    const data: Prisma.MediaAssetUpdateInput = {};
    if (dto.altText !== undefined) data.altText = dto.altText;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.tags !== undefined) data.tags = JSON.stringify(dto.tags);
    const updated = await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data,
    });
    return this.serialize(updated);
  }

  // ===== Delete (soft + remove COS object) =====
  async remove(id: string, userId: string): Promise<{ success: true }> {
    const asset = await this.getOwnedOrThrow(id, userId);
    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: MediaStatus.DELETED },
    });
    // 删 COS 对象；失败仅 fail-open（DB 已标记 DELETED，孤儿对象由后续清理任务处理）
    try {
      await this.storage.delete(asset.storageKey);
    } catch {
      // intentional: 不阻塞软删流程
    }
    return { success: true };
  }

  /** 取 own 且未软删的资产；DELETED 视为不存在（防 PATCH 复活已删 COS 对象致碎图） */
  private async getOwnedOrThrow(
    id: string,
    userId: string,
  ): Promise<MediaAsset> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (
      !asset ||
      asset.ownerId !== userId ||
      (asset.status as MediaStatus) === MediaStatus.DELETED
    ) {
      throw new NotFoundException('Media asset not found');
    }
    return asset;
  }

  private serialize(asset: MediaAsset): MediaAssetVo {
    return {
      ...asset,
      tags: safeJsonParse<string[]>(asset.tags, []),
    };
  }
}

/** 取 basename + 截断长度，防路径穿越与 DB 列溢出 */
function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  // eslint-disable-next-line no-control-regex -- 刻意剔除 ASCII 控制字符,防注入与文件名异常
  const clean = base.replace(/[\x00-\x1f\x7f]/g, '');
  return clean.slice(0, MAX_FILENAME_LENGTH);
}
