import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PublishStatus } from '@cms-ng/shared';
import { safeJsonParse } from '../common/json.utils';

@Injectable()
export class WordPressService {
  private readonly logger = new Logger(WordPressService.name);
  private readonly siteUrl: string;
  private readonly username: string;
  private readonly appPassword: string;
  private static readonly FETCH_TIMEOUT_MS = 30_000;

  private fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WordPressService.FETCH_TIMEOUT_MS);
    return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  }

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.siteUrl = this.configService.get<string>('WORDPRESS_SITE_URL', '');
    this.username = this.configService.get<string>('WORDPRESS_USERNAME', '');
    this.appPassword = this.configService.get<string>('WORDPRESS_APP_PASSWORD', '');
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.username}:${this.appPassword}`).toString('base64');
    return `Basic ${credentials}`;
  }

  private ensureConfigured(): void {
    if (!this.siteUrl || !this.username || !this.appPassword) {
      throw new BadRequestException(
        'WordPress 配置不完整，请设置 WORDPRESS_SITE_URL、WORDPRESS_USERNAME 和 WORDPRESS_APP_PASSWORD 环境变量',
      );
    }
  }

  /**
   * 搜索或创建 WordPress 标签，返回标签 ID 列表
   */
  private async resolveTags(tagNames: string[]): Promise<number[]> {
    const tagIds: number[] = [];
    const auth = this.getAuthHeader();

    for (const name of tagNames) {
      try {
        // 先搜索是否已存在
        const searchUrl = `${this.siteUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}&per_page=5`;
        const searchRes = await this.fetchWithTimeout(searchUrl, {
          headers: { Authorization: auth },
        });

        if (searchRes.ok) {
          const existing = await searchRes.json() as Array<{ id: number; name: string }>;
          const match = existing.find(
            (t) => t.name.toLowerCase() === name.toLowerCase(),
          );
          if (match) {
            tagIds.push(match.id);
            continue;
          }
        }

        // 不存在则创建
        const createRes = await this.fetchWithTimeout(`${this.siteUrl}/wp-json/wp/v2/tags`, {
          method: 'POST',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name }),
        });

        if (createRes.ok) {
          const created = await createRes.json() as { id: number };
          tagIds.push(created.id);
        } else {
          this.logger.warn(`Failed to create tag "${name}": ${createRes.status}`);
        }
      } catch (error: any) {
        this.logger.warn(`Error resolving tag "${name}": ${error.message}`);
      }
    }

    return tagIds;
  }

  /**
   * 上传图片到 WordPress 媒体库，返回 media ID
   */
  private async uploadImage(imageUrl: string): Promise<number | null> {
    const auth = this.getAuthHeader();

    try {
      // 下载图片
      const imageRes = await this.fetchWithTimeout(imageUrl);
      if (!imageRes.ok) {
        this.logger.warn(`Failed to download image: ${imageUrl}`);
        return null;
      }

      const imageBuffer = await imageRes.arrayBuffer();
      const contentType = (imageRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();

      // 从 URL 提取文件名，确保有正确的扩展名
      const urlPath = new URL(imageUrl).pathname;
      let filename = urlPath.split('/').pop() || 'cover';
      // MIME type → 扩展名映射
      const extMap: Record<string, string> = {
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
        'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif',
      };
      const ext = extMap[contentType] || '.jpg';
      // 如果文件名没有扩展名，补上
      if (!filename.includes('.')) {
        filename = `${filename}${ext}`;
      }

      // 上传到 WordPress
      const uploadRes = await this.fetchWithTimeout(`${this.siteUrl}/wp-json/wp/v2/media`, {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
        body: imageBuffer,
      });

      if (uploadRes.ok) {
        const media = await uploadRes.json() as { id: number };
        return media.id;
      } else {
        const errorText = await uploadRes.text();
        this.logger.warn(`Failed to upload image to WordPress: ${uploadRes.status} ${errorText}`);
        return null;
      }
    } catch (error: any) {
      this.logger.warn(`Error uploading image: ${error.message}`);
      return null;
    }
  }

  /**
   * 发布文章到 WordPress
   */
  async publish(
    articleId: string,
    wpStatus: 'publish' | 'draft' = 'publish',
  ) {
    this.ensureConfigured();

    // 获取文章和 PlatformPublish 记录
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
    });
    if (!article) {
      throw new BadRequestException('文章不存在');
    }

    const publish = await this.prisma.platformPublish.findFirst({
      where: { articleId, platform: 'WORDPRESS' },
    });
    if (!publish) {
      throw new BadRequestException('请先生成 WordPress 适配内容');
    }
    if (publish.status !== PublishStatus.READY && publish.status !== PublishStatus.PUBLISHED) {
      throw new BadRequestException('适配内容未就绪，请先生成或重新生成');
    }

    // 更新状态为 GENERATING（复用为"发布中"）
    await this.prisma.platformPublish.update({
      where: { id: publish.id },
      data: { status: PublishStatus.GENERATING },
    });

    try {
      const adaptedTitle = publish.adaptedTitle || article.title;
      const adaptedContent = publish.adaptedContent || article.content;
      const adaptedExcerpt = publish.adaptedExcerpt || article.excerpt || '';
      const adaptedTags = safeJsonParse(publish.adaptedTags, []);

      // 解析标签
      const tagIds = await this.resolveTags(adaptedTags);

      // 上传封面图（如果有）
      let featuredMediaId: number | null = null;
      if (article.coverImage) {
        featuredMediaId = await this.uploadImage(article.coverImage);
      }

      // 构建 WordPress post 数据
      const postData: Record<string, unknown> = {
        title: adaptedTitle,
        content: adaptedContent,
        excerpt: adaptedExcerpt,
        status: wpStatus,
        tags: tagIds,
      };
      if (featuredMediaId) {
        postData.featured_media = featuredMediaId;
      }

      // 发布到 WordPress
      const res = await this.fetchWithTimeout(`${this.siteUrl}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`WordPress API 错误 (${res.status}): ${errorText}`);
      }

      const wpPost = await res.json() as { id: number; link: string };

      // 更新 PlatformPublish 记录
      const updated = await this.prisma.platformPublish.update({
        where: { id: publish.id },
        data: {
          status: PublishStatus.PUBLISHED,
          publishedUrl: wpPost.link,
          publishedAt: new Date(),
          notes: null,
        },
      });

      this.logger.log(`Article published to WordPress: ${wpPost.link}`);

      return {
        ...updated,
        adaptedTags: safeJsonParse(updated.adaptedTags, []),
        coverImages: safeJsonParse(updated.coverImages, []),
      };
    } catch (error: any) {
      // 恢复状态为 READY（发布失败）
      await this.prisma.platformPublish.update({
        where: { id: publish.id },
        data: {
          status: PublishStatus.FAILED,
          notes: error.message || 'WordPress 发布失败',
        },
      });
      throw new BadRequestException(`WordPress 发布失败: ${error.message}`);
    }
  }
}
