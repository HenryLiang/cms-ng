import {
  TopicSourceContext,
  TopicSourceDefinition,
  TopicSourcePage,
  TopicSourceQuery,
} from './topic-source.types';

/** Internal seam implemented once per genuinely different source mechanism. */
export interface TopicSourceAdapter {
  listDefinitions(
    context: TopicSourceContext,
  ): TopicSourceDefinition[] | Promise<TopicSourceDefinition[]>;
  fetch(
    sourceId: string,
    context: TopicSourceContext,
    query: TopicSourceQuery,
  ): Promise<TopicSourcePage>;
}
