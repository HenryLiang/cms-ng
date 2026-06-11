import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AIService } from '../ai/ai.service';
import { BillingService } from '../billing/billing.service';
import {
  Platform,
  PublishStatus,
  PlatformMetadata,
  UserRole,
  TransactionType,
  BillingCategory,
} from '@cms-ng/shared';
import { PlatformRegistry } from './platforms/platform-registry';
import { PLATFORM_METADATA } from './platforms/constants';
import { safeJsonParse } from '../common/json.utils';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AIService,
    private billingService: BillingService,
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
      adaptedTags: safeJsonParse(p.adaptedTags, []),
      coverImages: safeJsonParse(p.coverImages, []),
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
            tags: safeJsonParse(article.tags, []),
          })}\n\n额外要求：${customPrompt}`
        : adapter.getAdaptationPrompt({
            title: article.title,
            subtitle: article.subtitle || undefined,
            content: article.content,
            excerpt: article.excerpt || undefined,
            tags: safeJsonParse(article.tags, []),
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
        coverImages: safeJsonParse(updated.coverImages, []),
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

    // Deduct billing on successful publish (non-blocking)
    if (dto.status === PublishStatus.PUBLISHED) {
      await this.deductPublishBilling(
        article.authorId,
        publish.id,
        publish.platform,
        articleId,
      );
    }

    return {
      ...updated,
      adaptedTags: safeJsonParse(updated.adaptedTags, []),
      coverImages: safeJsonParse(updated.coverImages, []),
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

  /**
   * Deduct billing for a successful platform publish.
   * Non-blocking: logs warning on failure but never blocks publishing.
   */
  private async deductPublishBilling(
    userId: string,
    platformPublishId: string,
    platform: string,
    articleId: string,
  ): Promise<void> {
    try {
      if (!this.billingService.isEnabled()) return;

      // Website publishing is free
      if (platform === Platform.WEBSITE) return;

      // Look up unit price from billing config
      const configKey = `publish_${platform.toLowerCase()}`;
      let unitPrice = 0.10; // default fallback
      try {
        const config = await this.billingService.getConfig(configKey);
        unitPrice = config.unitPrice;
      } catch {
        // Config not found — use default price
        this.logger.debug(`Billing config "${configKey}" not found, using default ¥${unitPrice}`);
      }

      if (unitPrice <= 0) return;

      await this.billingService.deduct({
        userId,
        type: TransactionType.PUBLISH,
        category: BillingCategory.PUBLISHING,
        amount: unitPrice,
        description: `${platform} 平台发布扣费`,
        articleId,
        platformPublishId,
        quantity: 1,
        unitPrice,
        idempotencyKey: `publish:${platformPublishId}`,
      });

      this.logger.log(
        `Publish billing deducted: user=${userId}, platform=${platform}, amount=¥${unitPrice}, publishId=${platformPublishId}`,
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to deduct publish billing (non-blocking): platform=${platform}, publishId=${platformPublishId}, error=${error.message}`,
      );
    }
  }
}
