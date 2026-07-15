import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TopicSourceAdapter } from './topic-source.adapter';
import {
  TopicSourceContext,
  TopicSourceDefinition,
  TopicSourcePage,
  TopicSourceQuery,
} from './topic-source.types';

export const TOPIC_SOURCE_ADAPTERS = Symbol('TOPIC_SOURCE_ADAPTERS');

@Injectable()
export class TopicSourceCatalog {
  private static readonly SOURCE_ALIASES: Record<string, string> = {
    'bilibili-partion': 'bilibili-partition',
  };

  constructor(
    @Inject(TOPIC_SOURCE_ADAPTERS)
    private readonly adapters: TopicSourceAdapter[],
  ) {}

  async listSources(
    context: TopicSourceContext = {},
  ): Promise<TopicSourceDefinition[]> {
    const definitionContext = { ...context, includeParameterOptions: true };
    const definitions = await Promise.all(
      this.adapters.map((adapter) =>
        Promise.resolve(adapter.listDefinitions(definitionContext)),
      ),
    );
    return definitions
      .flat()
      .filter((definition) => definition.visible !== false);
  }

  async fetch(
    sourceId: string,
    context: TopicSourceContext = {},
    query: TopicSourceQuery = {},
  ): Promise<TopicSourcePage> {
    const canonicalSourceId =
      TopicSourceCatalog.SOURCE_ALIASES[sourceId] || sourceId;
    for (const adapter of this.adapters) {
      const definitions = await adapter.listDefinitions(context);
      if (
        definitions.some((definition) => definition.id === canonicalSourceId)
      ) {
        return adapter.fetch(canonicalSourceId, context, query);
      }
    }
    throw new BadRequestException(`未知的数据源: ${sourceId}`);
  }
}
