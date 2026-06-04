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
   * 上传图片到 WordPress 媒体库，返回 media ID 和 WordPress 托管 URL
   */
  private async uploadImage(imageUrl: string): Promise<{ id: number; sourceUrl: string } | null> {
    const auth = this.getAuthHeader();

    try {
      const imageRes = await this.fetchWithTimeout(imageUrl);
      if (!imageRes.ok) {
        this.logger.warn(`Failed to download image: ${imageUrl}`);
        return null;
      }

      const imageBuffer = await imageRes.arrayBuffer();
      const contentType = (imageRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();

      const urlPath = new URL(imageUrl).pathname;
      let filename = urlPath.split('/').pop() || 'cover';
      const extMap: Record<string, string> = {
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
        'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif',
      };
      const ext = extMap[contentType] || '.jpg';
      if (!filename.includes('.')) {
        filename = `${filename}${ext}`;
      }

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
        const media = await uploadRes.json() as { id: number; source_url: string };
        return { id: media.id, sourceUrl: media.source_url };
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
   * 处理文章内容中的图片：下载并上传到 WordPress 媒体库，替换 src 为 WordPress 托管 URL
   */
  private async processContentImages(html: string): Promise<string> {
    const imgRegex = /<img[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
    const replacements: Array<{ original: string; wpUrl: string }> = [];
    const seen = new Set<string>();

    const matches = [...html.matchAll(imgRegex)];
    for (const match of matches) {
      const originalSrc = match[1];
      if (seen.has(originalSrc)) continue;
      seen.add(originalSrc);

      const absoluteUrl = originalSrc; // 图片已是公网 https:// 绝对 URL

      if (absoluteUrl.startsWith('data:')) continue;

      if (absoluteUrl.startsWith(this.siteUrl)) {
        this.logger.debug(`Skipping already-WordPress-hosted image: ${absoluteUrl}`);
        continue;
      }

      const result = await this.uploadImage(absoluteUrl);
      if (result && result.sourceUrl !== originalSrc) {
        replacements.push({ original: originalSrc, wpUrl: result.sourceUrl });
      }
    }

    let processed = html;
    for (const { original, wpUrl } of replacements) {
      processed = processed.replaceAll(original, wpUrl);
    }

    return processed;
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

      // 处理正文中的图片：上传到 WordPress 媒体库并替换 URL
      const finalContent = await this.processContentImages(adaptedContent);

      // 上传封面图（如果有）
      let featuredMediaId: number | null = null;
      if (article.coverImage) {
        // article.coverImage 已是 https://... 绝对 URL(COS),直接传
        const uploaded = await this.uploadImage(article.coverImage);
        if (uploaded) {
          featuredMediaId = uploaded.id;
        }
      }

      // 构建 WordPress post 数据
      const postData: Record<string, unknown> = {
        title: adaptedTitle,
        content: finalContent,
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

      const wpPost = await res.json() as { id: number; link: string; slug: string };

      // 更新 PlatformPublish 记录
      // notes 存储 wpPostId 以便撤回时直接删除
      const updated = await this.prisma.platformPublish.update({
        where: { id: publish.id },
        data: {
          status: PublishStatus.PUBLISHED,
          publishedUrl: wpPost.link,
          publishedAt: new Date(),
          notes: JSON.stringify({ wpPostId: wpPost.id, wpSlug: wpPost.slug }),
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

  /**
   * 从 WordPress 删除/下架文章。
   * 优先使用 publish 时存储的 wpPostId，否则从 URL 提取 slug 查找。
   * @param publishedUrl 已发布文章的 URL
   * @param publishNotes publish 时存储在 notes 字段的 JSON（含 wpPostId, wpSlug）
   */
  async deletePost(publishedUrl: string, publishNotes?: string | null): Promise<void> {
    this.ensureConfigured();

    if (!publishedUrl) {
      this.logger.warn('No published URL provided for deletion');
      return;
    }

    const auth = this.getAuthHeader();

    // 1. Try to get wpPostId from stored notes
    if (publishNotes) {
      const stored = safeJsonParse<{ wpPostId?: number; wpSlug?: string }>(publishNotes, {});
      if (stored.wpPostId) {
        const deleted = await this.tryDeleteById(stored.wpPostId, auth);
        if (deleted) return;
      }
    }

    // 2. Try to extract post ID from plain permalink URL (e.g., ?p=74)
    const plainMatch = publishedUrl.match(/[?&]p=(\d+)/);
    if (plainMatch) {
      const deleted = await this.tryDeleteById(Number(plainMatch[1]), auth);
      if (deleted) return;
    }

    // 3. Fallback: extract slug from URL and look up via REST API
    const slug = this.extractSlugFromUrl(publishedUrl);
    if (slug) {
      try {
        const lookupRes = await this.fetchWithTimeout(
          `${this.siteUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&per_page=1`,
          { headers: { Authorization: auth } },
        );
        if (lookupRes.ok) {
          const posts = await lookupRes.json() as Array<{ id: number }>;
          if (posts.length > 0) {
            await this.tryDeleteById(posts[0].id, auth);
            return;
          }
        }
      } catch (error: any) {
        this.logger.warn(`Error looking up post by slug "${slug}": ${error.message}`);
      }
    }

    this.logger.warn(`Cannot delete WordPress post from URL: ${publishedUrl} (no match)`);
  }

  /**
   * Try to delete a WordPress post by ID. Returns true if successful.
   */
  private async tryDeleteById(postId: number, auth: string): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout(
        `${this.siteUrl}/wp-json/wp/v2/posts/${postId}?force=true`,
        {
          method: 'DELETE',
          headers: { Authorization: auth },
        },
      );
      if (res.ok) {
        this.logger.log(`WordPress post ${postId} deleted`);
        return true;
      }
      const errorBody = await res.text();
      this.logger.warn(`WordPress DELETE post/${postId} failed (${res.status}): ${errorBody}`);
      return false;
    } catch (error: any) {
      this.logger.warn(`Error deleting WordPress post ${postId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Extract the slug from a WordPress URL.
   * Supports pretty permalinks like /2026/05/29/my-post/ and /my-post/
   */
  private extractSlugFromUrl(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      // Remove trailing slash and get last segment
      const segments = pathname.replace(/\/$/, '').split('/');
      const lastSegment = segments[segments.length - 1];
      // Filter out numeric-only segments (dates, IDs)
      if (lastSegment && !/^\d+$/.test(lastSegment)) {
        return lastSegment;
      }
      // If last is numeric (e.g., /2026/05/29/my-post/ → "29"), try the segment before
      if (segments.length >= 2) {
        const prev = segments[segments.length - 2];
        if (prev && !/^\d+$/.test(prev)) return prev;
      }
      return null;
    } catch {
      return null;
    }
  }
}
