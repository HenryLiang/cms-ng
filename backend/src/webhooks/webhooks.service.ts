import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { ArticleStatus } from '@cms-ng/shared';
import { PrismaService } from '../prisma/prisma.service';
import { safeJsonParse } from '../common/json.utils';

/**
 * Pushes revalidation notifications to the newsweb reader site whenever a
 * published article changes. Subscribes to the in-process article events
 * emitted by ArticlesService; failures are logged, never thrown, so the
 * editorial workflow is never blocked by the reader site being down.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  /** articleId -> pending timer, for debouncing bursts of update events. */
  private readonly pending = new Map<string, NodeJS.Timeout>();

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @OnEvent('article.created')
  @OnEvent('article.updated')
  handleArticleChanged(payload: { articleId: string }) {
    this.schedule(payload.articleId);
  }

  @OnEvent('article.deleted')
  handleArticleDeleted(payload: { articleId: string }) {
    // Article is gone; notify with no tags so newsweb drops cached pages.
    this.schedule(payload.articleId, { deleted: true });
  }

  private schedule(articleId: string, opts: { deleted?: boolean } = {}) {
    const url = this.config.get<string>('NEWSWEB_REVALIDATE_URL');
    const secret = this.config.get<string>('NEWSWEB_REVALIDATE_SECRET');
    if (!url || !secret) return; // integration not configured — stay silent

    const existing = this.pending.get(articleId);
    if (existing) clearTimeout(existing);
    this.pending.set(
      articleId,
      setTimeout(() => {
        this.pending.delete(articleId);
        void this.notify(articleId, opts);
      }, 2000),
    );
  }

  private async notify(articleId: string, opts: { deleted?: boolean }) {
    const url = this.config.get<string>('NEWSWEB_REVALIDATE_URL')!;
    const secret = this.config.get<string>('NEWSWEB_REVALIDATE_SECRET')!;

    let tags: string[] = [];
    if (!opts.deleted) {
      const article = await this.prisma.article.findUnique({
        where: { id: articleId },
        select: { status: true, tags: true, publishedAt: true },
      });
      if (!article) return;
      const status = article.status as ArticleStatus;
      const isPublished = [
        ArticleStatus.PUBLISHED,
        ArticleStatus.AUTO_PUBLISHED,
      ].includes(status);
      // 读者站只关心"发布过"的稿件：已发布 -> 通知刷新内容；
      // 曾经发布但已下架(如 ARCHIVED，publishedAt 非空) -> 通知清缓存下线。
      // 从未发布的草稿不通知，避免编辑过程刷屏。
      const wasPublished = Boolean(article.publishedAt);
      if (!isPublished && !wasPublished) return;
      tags = isPublished ? safeJsonParse<string[]>(article.tags, []) : [];
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, tags, secret }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        this.logger.warn(
          `newsweb revalidate responded ${res.status} for article ${articleId}`,
        );
      } else {
        this.logger.log(`newsweb revalidated article ${articleId}`);
      }
    } catch (err) {
      this.logger.warn(
        `newsweb revalidate failed for article ${articleId}: ${(err as Error).message}`,
      );
    }
  }
}
