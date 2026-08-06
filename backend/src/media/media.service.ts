import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import {
  MediaSource,
  MediaStatus,
  MediaLibraryType,
  MediaTagStatus,
} from '@cms-ng/shared';
import { imageSize } from 'image-size';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { QueryMediaDto } from './dto/query-media.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { MediaTaggingService } from './tagging/media-tagging.service';
import {
  SearchService,
  SearchUnavailableException,
} from '../search/search.service';

/** 受支持的图片 MIME -> 扩展名 */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_FILENAME_LENGTH = 180; // fileName 列 VARCHAR(191)，留余量
const PREVIEW_MAX_EDGE = 1200;
const PREVIEW_WEBP_QUALITY = 80;

/** 序列化后的媒体资源 VO：tags / aiTags 由 JSON string 解析为数组 */
export type MediaAssetVo = Omit<MediaAsset, 'tags' | 'aiTags'> & {
  tags: string[];
  aiTags: string[];
};

interface RawUploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly maxUploadBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    private readonly tagging: MediaTaggingService,
    private readonly search: SearchService,
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
    let previewStorageKey: string | null = null;
    let previewUrl: string | null = null;
    if (v.mimeType !== 'image/gif') {
      try {
        const previewBuffer = await this.createPreview(v.buffer);
        previewStorageKey = this.buildPreviewKey(key);
        const storedPreview = await this.storage.put(
          previewStorageKey,
          previewBuffer,
          'image/webp',
        );
        previewUrl = storedPreview.url;
      } catch (err) {
        previewStorageKey = null;
        this.logger.warn(
          `WebP 预览图生成或上传失败,回退原图: ${(err as Error)?.message ?? err}`,
        );
      }
    }
    try {
      const { width, height } = this.readDimensions(v.buffer);
      const asset = await this.prisma.mediaAsset.create({
        data: {
          storageKey: key,
          url,
          previewStorageKey,
          thumbnailUrl: previewUrl,
          fileName: v.fileName,
          mimeType: v.mimeType,
          size: v.size,
          width,
          height,
          source: MediaSource.UPLOAD,
          ownerId,
          libraryType: MediaLibraryType.PERSONAL,
          status: MediaStatus.ACTIVE,
          // 打标开关开启时置 PENDING,触发异步打标;关闭时 NONE(前端不显示角标)
          tagStatus: this.tagging.isEnabled()
            ? MediaTagStatus.PENDING
            : MediaTagStatus.NONE,
        },
      });
      // 进程内事件:MediaTaggingService 监听打标入队、SearchService 监听 ES 索引(解耦,不直接调)
      this.emitAssetEvent('media.asset.created', asset.id);
      return this.serialize(asset);
    } catch (err) {
      // DB 入库失败：回删原图与预览对象，避免孤儿（回删失败不掩盖原错误）
      await Promise.allSettled(
        [key, previewStorageKey]
          .filter((objectKey): objectKey is string => Boolean(objectKey))
          .map((objectKey) => this.storage.delete(objectKey)),
      );
      throw err;
    }
  }

  private buildKey(ownerId: string, ext: string): string {
    return `cms-ng/media/${ownerId}/${this.currentYYYYMM()}/${randomUUID()}.${ext}`;
  }

  private buildPreviewKey(originalKey: string): string {
    return originalKey.replace(/\.[^.]+$/, '.preview.webp');
  }

  private createPreview(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .rotate()
      .resize({
        width: PREVIEW_MAX_EDGE,
        height: PREVIEW_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: PREVIEW_WEBP_QUALITY })
      .toBuffer();
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

    // ES 全文检索态(P2):search/tag 非空且 ES 已配置时走 ES;不可用降级扩展 LIKE。
    // 门控用 isConfigured(非 isEnabled):配置即尝试,searchMedia 内部 ensureReady
    // 节流自愈——宕机恢复后读路径能自动感知;仍降级则抛 SearchUnavailableException 兜底 LIKE。
    // 仅 ACTIVE 走 ES:非 ACTIVE 文档不入 ES(删除即移除),回收站等查询必须直走 LIKE。
    const esSearch = query.search?.trim();
    const esTag = query.tag?.trim();
    const requestedStatus = query.status ?? MediaStatus.ACTIVE;
    if (
      (esSearch || esTag) &&
      requestedStatus === MediaStatus.ACTIVE &&
      this.search.isConfigured()
    ) {
      try {
        const { ids, total } = await this.search.searchMedia({
          ownerId: userId,
          status: requestedStatus,
          search: esSearch || undefined,
          tag: esTag || undefined,
          source: query.source,
          page,
          pageSize,
        });
        if (ids.length === 0) {
          return buildPaginatedResponse([], total, { page, pageSize });
        }
        // 回表取完整 VO(ES 文档仅携带检索字段);双侧同源过滤再守 owner/status
        const rows = await this.prisma.mediaAsset.findMany({
          where: {
            id: { in: ids },
            ownerId: userId,
            status: requestedStatus,
          },
        });
        // 按 ES 命中顺序排序(相关性/createdAt desc)
        const order = new Map(ids.map((id, i) => [id, i]));
        rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        return buildPaginatedResponse(
          rows.map((r) => this.serialize(r)),
          total,
          { page, pageSize },
        );
      } catch (err) {
        if (!(err instanceof SearchUnavailableException)) throw err;
        this.logger.warn(`ES 检索不可用,降级 LIKE: ${err.message}`);
        // fall through to LIKE
      }
    }

    const where: Prisma.MediaAssetWhereInput = {
      ownerId: userId,
      status: requestedStatus,
    };
    if (query.source) where.source = query.source;
    // search 与 tag 各自构造 OR 组,同时存在时 AND 组合(避免互相覆盖 where.OR)
    const andClauses: Prisma.MediaAssetWhereInput[] = [];
    if (query.search) {
      // LIKE 兜底路径(ES 未启用或降级时):覆盖 fileName/altText/title/prompt
      // + tags/aiTags,与 ES 态语义对齐,保证降级不丢 AI 标签检索能力
      const s = query.search;
      andClauses.push({
        OR: [
          { fileName: { contains: s } },
          { altText: { contains: s } },
          { title: { contains: s } },
          { prompt: { contains: s } },
          { tags: { contains: s } },
          { aiTags: { contains: s } },
        ],
      });
    }
    if (query.tag) {
      // tag 过滤:tags 与 aiTags 两列 OR(JSON string 数组,带引号子串匹配,转义双引号)
      const esc = `"${query.tag.replace(/"/g, '\\"')}"`;
      andClauses.push({
        OR: [{ tags: { contains: esc } }, { aiTags: { contains: esc } }],
      });
    }
    if (andClauses.length === 1) {
      Object.assign(where, andClauses[0]);
    } else if (andClauses.length > 1) {
      where.AND = andClauses;
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
    // ES 索引更新(P2,fail-open):SearchService 回表重建文档
    this.emitAssetEvent('media.asset.updated', asset.id);
    return this.serialize(updated);
  }

  // ===== Delete (soft + remove COS object) =====
  async remove(id: string, userId: string): Promise<{ success: true }> {
    const asset = await this.getOwnedOrThrow(id, userId);
    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: MediaStatus.DELETED },
    });
    // ES 索引删除(P2,fail-open):防搜出已删图
    this.emitAssetEvent('media.asset.deleted', asset.id);
    // 删原图与预览对象；失败仅 fail-open（孤儿对象由后续清理任务处理）
    await Promise.allSettled(
      [asset.storageKey, asset.previewStorageKey]
        .filter((objectKey): objectKey is string => Boolean(objectKey))
        .map((objectKey) => this.storage.delete(objectKey)),
    );
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
      aiTags: safeJsonParse<string[]>(asset.aiTags, []),
    };
  }

  /** 手动重打标:委托 MediaTaggingService(冷却/配额/开关校验在其内) */
  async retag(id: string, userId: string): Promise<MediaAssetVo> {
    await this.tagging.retag(id, userId);
    return this.serialize(await this.getOwnedOrThrow(id, userId));
  }

  /** 事件发射 fail-open:监听器抛错不应让已入库的媒体操作失败(与 ai.service.ts 对齐) */
  private emitAssetEvent(event: string, assetId: string): void {
    try {
      this.events.emit(event, { assetId });
    } catch (err) {
      this.logger.warn(
        `${event} 事件发射失败 ${assetId}: ${(err as Error)?.message ?? err}`,
      );
    }
  }
}

/** 取 basename + 截断长度，防路径穿越与 DB 列溢出 */
function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  // eslint-disable-next-line no-control-regex -- 刻意剔除 ASCII 控制字符,防注入与文件名异常
  const clean = base.replace(/[\x00-\x1f\x7f]/g, '');
  return clean.slice(0, MAX_FILENAME_LENGTH);
}
