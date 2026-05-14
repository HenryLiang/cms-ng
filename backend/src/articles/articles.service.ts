import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ArticleStatus } from '@cms-ng/shared';
import {
  RewriteTextDto,
  ExpandTextDto,
  CondenseTextDto,
  PolishTextDto,
  GenerateHeadlinesDto,
  GenerateExcerptDto,
  ChatWithAIDto,
} from './dto/ai-operations.dto';

@Injectable()
export class ArticlesService {
  constructor(
    private prisma: PrismaService,
    private aiService: AIService,
  ) {}

  async create(authorId: string, dto: CreateArticleDto) {
    const story = await this.prisma.story.findUnique({
      where: { id: dto.storyId },
    });
    if (!story) throw new NotFoundException('Story not found');

    const article = await this.prisma.article.create({
      data: {
        storyId: dto.storyId,
        title: dto.title,
        subtitle: dto.subtitle,
        content: dto.content,
        excerpt: dto.excerpt,
        status: dto.status ?? ArticleStatus.DRAFT,
        tags: JSON.stringify(dto.tags ?? []),
        authorId,
        version: 1,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });

    // Create first version snapshot
    await this.prisma.articleVersion.create({
      data: {
        articleId: article.id,
        title: article.title,
        content: article.content,
        version: 1,
      },
    });

    return this.serializeArticle(article);
  }

  async findAll(filters: { authorId?: string; storyId?: string }) {
    const where: any = {};
    if (filters.authorId) where.authorId = filters.authorId;
    if (filters.storyId) where.storyId = filters.storyId;

    const articles = await this.prisma.article.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });
    return articles.map((a) => this.serializeArticle(a));
  }

  async findOne(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
        versions: { orderBy: { version: 'desc' } },
      },
    });
    if (!article) throw new NotFoundException('Article not found');
    return this.serializeArticle(article);
  }

  async update(id: string, authorId: string, dto: UpdateArticleDto) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Article not found');
    if (existing.authorId !== authorId) {
      throw new ForbiddenException('You can only edit your own articles');
    }

    const newVersion = existing.version + 1;

    const article = await this.prisma.article.update({
      where: { id },
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        content: dto.content,
        excerpt: dto.excerpt,
        status: dto.status,
        tags: dto.tags !== undefined ? JSON.stringify(dto.tags) : undefined,
        version: newVersion,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });

    // Save version snapshot if content changed
    if (dto.content || dto.title) {
      await this.prisma.articleVersion.create({
        data: {
          articleId: id,
          title: article.title,
          content: article.content,
          version: newVersion,
        },
      });
    }

    return this.serializeArticle(article);
  }

  async remove(id: string, authorId: string) {
    const existing = await this.prisma.article.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Article not found');
    if (existing.authorId !== authorId) {
      throw new ForbiddenException('You can only delete your own articles');
    }
    await this.prisma.article.delete({ where: { id } });
    return { success: true };
  }

  // ===== AI Operations =====
  async aiRewrite(id: string, authorId: string, dto: RewriteTextDto) {
    await this.verifyArticleAccess(id, authorId);
    const result = await this.aiService.rewriteText(authorId, id, {
      text: dto.text,
      instruction: dto.instruction,
      style: dto.style,
    });
    return { result };
  }

  async aiExpand(id: string, authorId: string, dto: ExpandTextDto) {
    await this.verifyArticleAccess(id, authorId);
    const result = await this.aiService.expandText(authorId, id, {
      text: dto.text,
      instruction: dto.instruction,
    });
    return { result };
  }

  async aiCondense(id: string, authorId: string, dto: CondenseTextDto) {
    await this.verifyArticleAccess(id, authorId);
    const result = await this.aiService.condenseText(authorId, id, {
      text: dto.text,
      maxLength: dto.maxLength,
    });
    return { result };
  }

  async aiPolish(id: string, authorId: string, dto: PolishTextDto) {
    await this.verifyArticleAccess(id, authorId);
    const result = await this.aiService.polishText(authorId, id, {
      text: dto.text,
    });
    return { result };
  }

  async aiHeadlines(id: string, authorId: string, dto: GenerateHeadlinesDto) {
    const article = await this.verifyArticleAccess(id, authorId);
    const result = await this.aiService.generateHeadlines(authorId, id, {
      title: article.title,
      subtitle: article.subtitle || undefined,
      content: article.content,
      count: dto.count,
    });
    return { headlines: result };
  }

  async aiExcerpt(id: string, authorId: string, dto: GenerateExcerptDto) {
    const article = await this.verifyArticleAccess(id, authorId);
    const result = await this.aiService.generateExcerpt(authorId, id, {
      title: article.title,
      content: article.content,
      maxLength: dto.maxLength,
    });
    return { excerpt: result };
  }

  async aiChat(id: string, authorId: string, dto: ChatWithAIDto) {
    const article = await this.verifyArticleAccess(id, authorId);
    const result = await this.aiService.chatWithAI(authorId, id, {
      messages: dto.messages,
      articleContext: {
        title: article.title,
        subtitle: article.subtitle || undefined,
        content: article.content,
      },
    });
    return { reply: result };
  }

  private async verifyArticleAccess(id: string, authorId: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, email: true } },
        editor: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, title: true } },
      },
    });
    if (!article) throw new NotFoundException('Article not found');
    if (article.authorId !== authorId) {
      throw new ForbiddenException('You can only edit your own articles');
    }
    return article;
  }

  private serializeArticle(article: any) {
    return {
      ...article,
      tags: JSON.parse(article.tags || '[]'),
      platforms: JSON.parse(article.platforms || '[]'),
      aiGeneratedParts: JSON.parse(article.aiGeneratedParts || '[]'),
    };
  }
}
