import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ArticleRunStatus } from '@cms-ng/shared';
import { PipelineStep, PipelineContext } from '../step.interface';
import { safeJsonParse } from '../../../common/json.utils';

@Injectable()
export class TopicCollectionStep implements PipelineStep {
  readonly name = 'topic-collection';
  readonly successStatus = ArticleRunStatus.TOPIC_SELECTED;
  private readonly logger = new Logger(TopicCollectionStep.name);

  constructor(private prisma: PrismaService) {}

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    const trace = ctx.trace?.[ctx.trace.length - 1];

    const task = await this.prisma.autoPublishTask.findUnique({
      where: { id: ctx.taskId },
    });
    if (!task) throw new Error('Task not found');

    const strategy = safeJsonParse<{
      fixedKeywords: string[];
      useTrending: boolean;
      trendingSources: string[];
    }>(task.topicStrategy, {
      fixedKeywords: [],
      useTrending: false,
      trendingSources: [],
    });

    const filter = safeJsonParse<{
      blockedCategories: string[];
      blockedKeywords: string[];
      allowedChannels: string[];
    }>(task.filterConfig, {
      blockedCategories: [],
      blockedKeywords: [],
      allowedChannels: [],
    });

    const candidates: string[] = [];
    const fixedKeywordItems = strategy.fixedKeywords || [];
    let trendingItems: string[] = [];

    // 1. Fixed keywords
    if (fixedKeywordItems.length) {
      candidates.push(...fixedKeywordItems);
    }

    // 2. Trending topics
    if (strategy.useTrending) {
      const trending = await this.prisma.trendingTopic.findMany({
        where: { status: 'OPEN' },
        orderBy: { heatScore: 'desc' },
        take: 20,
      });
      trendingItems = trending.map((t) => t.title);
      candidates.push(...trendingItems);
    }

    // 3. Filter
    const blockedWords = [
      ...(filter.blockedKeywords || []),
      ...(filter.blockedCategories || []),
    ].map((w) => w.toLowerCase());

    const filteredOut = candidates.filter((topic) =>
      blockedWords.some((bw) => topic.toLowerCase().includes(bw)),
    );
    const filtered = candidates.filter(
      (topic) => !blockedWords.some((bw) => topic.toLowerCase().includes(bw)),
    );

    // 4. Dedup — skip topics written in last 24h
    const recent = await this.prisma.autoPublishArticle.findMany({
      where: {
        taskId: ctx.taskId,
        status: { in: ['PUBLISHED', 'SAVED', 'DRAFTED'] },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        topic: { not: null },
      },
      select: { topic: true },
    });
    const recentTopics = new Set(recent.map((a) => a.topic?.toLowerCase()));
    const dedupedOut = filtered.filter((t) =>
      recentTopics.has(t.toLowerCase()),
    );
    const unique = filtered.filter((t) => !recentTopics.has(t.toLowerCase()));

    // Fallback: if dedup emptied the pool but filtered candidates exist, reuse them
    // rather than failing the run. This handles the case where the only available
    // trending topics were all written in the last 24h — better to publish a
    // (possibly duplicate) topic than to fail the entire pipeline.
    let selectedPool = unique;
    let dedupFallbackUsed = false;
    if (!unique.length && filtered.length) {
      selectedPool = filtered;
      dedupFallbackUsed = true;
      this.logger.warn(
        `All ${filtered.length} candidate(s) were deduped in last 24h — falling back to filtered pool to avoid empty selection`,
      );
    }

    if (!selectedPool.length) {
      if (trace) {
        trace.metadata = {
          sources: {
            fixedKeywords: {
              count: fixedKeywordItems.length,
              items: fixedKeywordItems,
            },
            trendingTopics: {
              count: trendingItems.length,
              items: trendingItems,
            },
          },
          rawCandidateCount: candidates.length,
          afterFilterCount: filtered.length,
          afterDedupCount: unique.length,
        };
        trace.decisions = [
          ...(filteredOut.length
            ? [
                `Filtered out ${filteredOut.length} topic(s) by blockedKeywords: ${filteredOut.join(', ')}`,
              ]
            : []),
          ...(dedupedOut.length
            ? [
                `Dedup removed ${dedupedOut.length} topic(s) written in last 24h: ${dedupedOut.join(', ')}`,
              ]
            : []),
          'No available topics after filtering and deduplication',
        ];
      }
      throw new Error('No available topics after filtering and deduplication');
    }

    // Pick one (round-robin based on article count today)
    const todayCount = await this.prisma.autoPublishArticle.count({
      where: {
        taskId: ctx.taskId,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });
    const selectedIndex = todayCount % selectedPool.length;
    const selectedTopic = selectedPool[selectedIndex];

    if (trace) {
      trace.metadata = {
        sources: {
          fixedKeywords: {
            count: fixedKeywordItems.length,
            items: fixedKeywordItems,
          },
          trendingTopics: { count: trendingItems.length, items: trendingItems },
        },
        rawCandidateCount: candidates.length,
        afterFilterCount: filtered.length,
        afterDedupCount: unique.length,
        selectionMethod: 'round-robin',
        todayArticleCount: todayCount,
        selectedIndex,
        allCandidates: selectedPool,
        dedupFallbackUsed,
      };
      trace.decisions = [
        ...(filteredOut.length
          ? [
              `Filtered out ${filteredOut.length} topic(s) by blockedKeywords: ${filteredOut.join(', ')}`,
            ]
          : []),
        ...(dedupedOut.length
          ? [
              `Dedup removed ${dedupedOut.length} topic(s) written in last 24h: ${dedupedOut.join(', ')}`,
            ]
          : []),
        ...(dedupFallbackUsed
          ? [
              `Fallback: reused ${filtered.length} deduped candidate(s) to avoid empty selection`,
            ]
          : []),
        `Selected "${selectedTopic}" via round-robin (index ${selectedIndex} of ${selectedPool.length} candidates)`,
      ];
    }

    this.logger.log(`Selected topic: "${selectedTopic}"`);
    ctx.topic = selectedTopic;
    return ctx;
  }
}
