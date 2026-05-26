import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import {
  Platform,
  PublishStatus,
  PlatformMetadata,
  UserRole,
} from '@cms-ng/shared';
import { PlatformRegistry } from './platforms/platform-registry';
import { PLATFORM_METADATA } from './platforms/constants';

@Injectable()
export class ChannelsService {
  constructor(
    private prisma: PrismaService,
    private aiService: AIService,
  ) {}

  getPlatforms(): PlatformMetadata[] {
    return Object.values(PLATFORM_METADATA);
  }

  async verifyAccess(
    articleId: string,
    user: { userId: string; role: string },
  ) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { authorId: true, editorId: true },
    });
    if (!article) throw new NotFoundException('Article not found');

    const canAccess =
      user.role === UserRole.ADMIN ||
      article.authorId === user.userId ||
      article.editorId === user.userId;

    if (!canAccess) {
      throw new ForbiddenException(
        'You do not have permission to access this article',
      );
    }
  }

  async getPublishes(articleId: string) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
    });
    if (!article) throw new NotFoundException('Article not found');

    const publishes = await this.prisma.platformPublish.findMany({
      where: { articleId },
      orderBy: { createdAt: 'desc' },
    });

    return publishes.map((p) => ({
      ...p,
      adaptedTags: JSON.parse(p.adaptedTags || '[]'),
      coverImages: JSON.parse(p.coverImages || '[]'),
    }));
  }

  async generateAdaptation(
    userId: string,
    articleId: string,
    platform: Platform,
    customPrompt?: string,
  ) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: {
        author: { select: { id: true, name: true } },
        story: { select: { id: true, title: true } },
      },
    });
    if (!article) throw new NotFoundException('Article not found');

    const adapter = PlatformRegistry.getAdapter(platform);
    if (!adapter) {
      throw new BadRequestException(
        `Platform ${platform} is not supported yet`,
      );
    }

    // Upsert publish record with GENERATING status
    const publish = await this.prisma.platformPublish.upsert({
      where: {
        articleId_platform: {
          articleId,
          platform,
        },
      },
      create: {
        articleId,
        platform,
        status: PublishStatus.GENERATING,
        adaptedTags: '[]',
        coverImages: '[]',
      },
      update: {
        status: PublishStatus.GENERATING,
      },
    });

    try {
      const prompt = customPrompt
        ? `${adapter.getAdaptationPrompt({
            title: article.title,
            subtitle: article.subtitle || undefined,
            content: article.content,
            excerpt: article.excerpt || undefined,
            tags: JSON.parse(article.tags || '[]'),
          })}\n\n额外要求：${customPrompt}`
        : adapter.getAdaptationPrompt({
            title: article.title,
            subtitle: article.subtitle || undefined,
            content: article.content,
            excerpt: article.excerpt || undefined,
            tags: JSON.parse(article.tags || '[]'),
          });

      const rawResult = await this.aiService.chatWithAI(userId, articleId, {
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Guard against AI service returning fallback error messages
      if (
        rawResult.includes('AI 助手暂时无法回答') ||
        rawResult.includes('AI assistant temporarily unavailable')
      ) {
        throw new Error('AI service returned an error response');
      }

      const adapted = adapter.postProcess(rawResult);
      const validation = adapter.validate(adapted);

      if (!validation.valid) {
        await this.prisma.platformPublish.update({
          where: { id: publish.id },
          data: {
            status: PublishStatus.FAILED,
            notes: validation.errors.join('; '),
          },
        });
        throw new BadRequestException(
          `Adaptation validation failed: ${validation.errors.join(', ')}`,
        );
      }

      const updated = await this.prisma.platformPublish.update({
        where: { id: publish.id },
        data: {
          status: PublishStatus.READY,
          adaptedTitle: adapted.title,
          adaptedContent: adapted.content,
          adaptedExcerpt: adapted.excerpt || null,
          adaptedTags: JSON.stringify(adapted.tags),
        },
      });

      return {
        ...updated,
        adaptedTags: adapted.tags,
        coverImages: JSON.parse(updated.coverImages || '[]'),
      };
    } catch (error: any) {
      // If already updated to READY or FAILED, don't overwrite
      const current = await this.prisma.platformPublish.findUnique({
        where: { id: publish.id },
      });
      if (current?.status === PublishStatus.GENERATING) {
        await this.prisma.platformPublish.update({
          where: { id: publish.id },
          data: {
            status: PublishStatus.FAILED,
            notes: error.message || 'AI adaptation failed',
          },
        });
      }
      throw error;
    }
  }

  async updatePublish(
    articleId: string,
    publishId: string,
    dto: { status?: PublishStatus; publishedUrl?: string; notes?: string },
  ) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
    });
    if (!article) throw new NotFoundException('Article not found');

    const publish = await this.prisma.platformPublish.findFirst({
      where: { id: publishId, articleId },
    });
    if (!publish) throw new NotFoundException('Publish record not found');

    const updateData: any = {};
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.publishedUrl !== undefined)
      updateData.publishedUrl = dto.publishedUrl;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.status === PublishStatus.PUBLISHED) {
      updateData.publishedAt = new Date();
    }

    const updated = await this.prisma.platformPublish.update({
      where: { id: publishId },
      data: updateData,
    });

    return {
      ...updated,
      adaptedTags: JSON.parse(updated.adaptedTags || '[]'),
      coverImages: JSON.parse(updated.coverImages || '[]'),
    };
  }

  async deletePublish(articleId: string, publishId: string) {
    const publish = await this.prisma.platformPublish.findFirst({
      where: { id: publishId, articleId },
    });
    if (!publish) throw new NotFoundException('Publish record not found');

    await this.prisma.platformPublish.delete({
      where: { id: publishId },
    });

    return { deleted: true };
  }
}
