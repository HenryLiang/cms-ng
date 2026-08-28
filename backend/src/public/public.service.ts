import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ArticleStatus } from '@cms-ng/shared';
import { PrismaService } from '../prisma/prisma.service';
import { deserializeArticle } from '../articles/article-serializer';
import {
  buildPaginatedResponse,
  parsePaginationParams,
} from '../common/pagination';
import { safeJsonParse } from '../common/json.utils';
import { FindPublicArticlesDto } from './dto/find-public-articles.dto';

/**
 * Public (unauthenticated) read-only content API for the newsweb reader
 * site. Only ever exposes articles in a published state; internal fields
 * (author email, editor, aiGeneratedParts, drafts) are never selected.
 */

const PUBLISHED_STATUSES: ArticleStatus[] = [
  ArticleStatus.PUBLISHED,
  ArticleStatus.AUTO_PUBLISHED,
];

/** Safe field set for list responses — no body, no internal fields. */
const ARTICLE_LIST_SELECT = {
  id: true,
  title: true,
  subtitle: true,
  excerpt: true,
  coverImage: true,
  tags: true,
  publishedAt: true,
  createdAt: true,
  storyId: true,
  author: { select: { id: true, name: true } },
  story: { select: { id: true, title: true } },
} satisfies Prisma.ArticleSelect;

const ARTICLE_DETAIL_SELECT = {
  ...ARTICLE_LIST_SELECT,
  content: true,
  contentLanguage: true,
  updatedAt: true,
} satisfies Prisma.ArticleSelect;

@Injectable()
export class PublicService {
  constructor(private prisma: PrismaService) {}

  async findArticles(query: FindPublicArticlesDto) {
    const { page, pageSize } = parsePaginationParams({
      page: query.page,
      pageSize: query.pageSize,
    });
    // Public list is capped tighter than the admin API.
    const cappedPageSize = Math.min(pageSize, 50);

    const where: Prisma.ArticleWhereInput = {
      status: { in: PUBLISHED_STATUSES },
    };
    const and: Prisma.ArticleWhereInput[] = [];
    if (query.tag) {
      // Comma-separated tags are OR-ed (newsweb channels map to 1..N tags).
      // tags is a JSON-string column (["时政","AI"]); quoted substring match
      // avoids partial-tag false positives (e.g. "AI" matching "AIGC").
      const tags = query.tag
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length) {
        and.push({ OR: tags.map((t) => ({ tags: { contains: `"${t}"` } })) });
      }
    }
    if (query.search) {
      and.push({
        OR: [
          { title: { contains: query.search } },
          { subtitle: { contains: query.search } },
          { excerpt: { contains: query.search } },
          { tags: { contains: `"${query.search}"` } },
        ],
      });
    }
    if (query.storyId) {
      where.storyId = query.storyId;
    }
    if (and.length) {
      where.AND = and;
    }

    const [total, rows] = await Promise.all([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({
        where,
        select: ARTICLE_LIST_SELECT,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * cappedPageSize,
        take: cappedPageSize,
      }),
    ]);

    return buildPaginatedResponse(rows.map(deserializeArticle), total, {
      page,
      pageSize: cappedPageSize,
    });
  }

  async findArticle(id: string) {
    const article = await this.prisma.article.findFirst({
      where: { id, status: { in: PUBLISHED_STATUSES } },
      select: ARTICLE_DETAIL_SELECT,
    });
    if (!article) {
      // Same 404 for drafts and unknown ids — don't leak existence.
      throw new NotFoundException('文章不存在或未发布');
    }
    return deserializeArticle(article);
  }

  /** Aggregate tag usage across published articles. */
  async findTags() {
    const rows = await this.prisma.article.findMany({
      where: { status: { in: PUBLISHED_STATUSES } },
      select: { tags: true },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const tag of safeJsonParse<string[]>(row.tags, [])) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  /** Stories that have at least one published article (专题). */
  async findStories() {
    const stories = await this.prisma.story.findMany({
      where: { articles: { some: { status: { in: PUBLISHED_STATUSES } } } },
      select: {
        id: true,
        title: true,
        description: true,
        tags: true,
        updatedAt: true,
        _count: {
          select: {
            articles: { where: { status: { in: PUBLISHED_STATUSES } } },
          },
        },
        articles: {
          where: { status: { in: PUBLISHED_STATUSES } },
          select: { coverImage: true },
          orderBy: { publishedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return stories.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      tags: safeJsonParse<string[]>(s.tags, []),
      updatedAt: s.updatedAt,
      articleCount: s._count.articles,
      coverImage: s.articles[0]?.coverImage ?? null,
    }));
  }

  async findStory(id: string) {
    const story = await this.prisma.story.findFirst({
      where: { id, articles: { some: { status: { in: PUBLISHED_STATUSES } } } },
      select: {
        id: true,
        title: true,
        description: true,
        tags: true,
        updatedAt: true,
      },
    });
    if (!story) {
      throw new NotFoundException('专题不存在或暂无已发布文章');
    }
    const articles = await this.prisma.article.findMany({
      where: { storyId: id, status: { in: PUBLISHED_STATUSES } },
      select: ARTICLE_LIST_SELECT,
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    return {
      ...story,
      tags: safeJsonParse<string[]>(story.tags, []),
      articles: articles.map(deserializeArticle),
    };
  }
}
