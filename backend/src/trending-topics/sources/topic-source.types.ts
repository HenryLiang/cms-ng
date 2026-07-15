export type {
  TopicCandidate,
  TopicCandidateLink,
  TopicSourceCategory,
  TopicSourceDefinition,
  TopicSourcePage,
  TopicSourceParameter,
} from '@cms-ng/shared';

export interface TopicSourceQuery {
  page?: number;
  limit?: number;
  params?: Record<string, string | number | boolean | undefined>;
}

export interface TopicSourceContext {
  userId?: string;
  includeParameterOptions?: boolean;
}
