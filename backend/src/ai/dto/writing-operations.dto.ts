import { ContentLanguage } from '@cms-ng/shared';

export interface RewriteTextInput {
  text: string;
  instruction?: string;
  style?: 'serious' | 'casual' | 'academic' | 'concise';
  language?: ContentLanguage;
  /** Optional author persona slug (e.g. 'author-luxun') from data/authors/.
   *  When set, the author's system_prompt.md is prepended to the system
   *  message so the rewrite adopts that author's voice. */
  authorSlug?: string;
}

export interface ExpandTextInput {
  text: string;
  instruction?: string;
  language?: ContentLanguage;
  /** Optional author persona slug. See RewriteTextInput.authorSlug. */
  authorSlug?: string;
}

export interface CondenseTextInput {
  text: string;
  maxLength?: number;
  language?: ContentLanguage;
  /** Optional author persona slug. See RewriteTextInput.authorSlug. */
  authorSlug?: string;
}

export interface PolishTextInput {
  text: string;
  language?: ContentLanguage;
  /** Optional author persona slug. See RewriteTextInput.authorSlug. */
  authorSlug?: string;
}

export interface GenerateHeadlinesInput {
  title: string;
  subtitle?: string;
  content: string;
  count?: number;
  language?: ContentLanguage;
  /** Optional author persona slug. See RewriteTextInput.authorSlug. */
  authorSlug?: string;
}

export interface HeadlineOption {
  title: string;
  style: string;
  reasoning: string;
}

export interface GenerateExcerptInput {
  title: string;
  content: string;
  maxLength?: number;
  language?: ContentLanguage;
  /** Optional author persona slug. See RewriteTextInput.authorSlug. */
  authorSlug?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatInput {
  messages: ChatMessage[];
  articleContext?: {
    title: string;
    subtitle?: string;
    content: string;
  };
  language?: ContentLanguage;
  /** Optional author persona slug. See RewriteTextInput.authorSlug. */
  authorSlug?: string;
}

export interface GenerateDraftInput {
  storyTitle: string;
  storyDescription?: string;
  storyAngle?: string;
  storyTags: string[];
  currentTitle?: string;
  currentSubtitle?: string;
  instruction?: string;
  researchKit?: ResearchKitResult;
  language?: ContentLanguage;
  /** Optional author persona slug. See RewriteTextInput.authorSlug. */
  authorSlug?: string;
}

export interface DraftResult {
  title: string;
  subtitle?: string;
  content: string;
}

export interface FactCheckFinding {
  type: 'fact' | 'inconsistency' | 'dispute' | 'source_needed' | 'risk';
  text: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface FactCheckResult {
  score: number;
  summary: string;
  findings: FactCheckFinding[];
}

export interface FactCheckInput {
  title: string;
  subtitle?: string;
  content: string;
  language?: ContentLanguage;
}

export interface ResearchKitTimelineEvent {
  date: string;
  event: string;
  source?: string;
}

export interface ResearchKitPerson {
  name: string;
  role: string;
  background?: string;
}

export interface ResearchKitDataPoint {
  label: string;
  value: string;
  source?: string;
}

export interface ResearchKitOpinion {
  source: string;
  viewpoint: string;
  stance?: string;
}

export interface WikipediaEntry {
  title: string;
  extract: string;
  url: string;
  language: 'zh' | 'en';
}

export interface ResearchKitResult {
  timeline: ResearchKitTimelineEvent[];
  people: ResearchKitPerson[];
  data: ResearchKitDataPoint[];
  opinions: ResearchKitOpinion[];
  relatedArticles?: string[];
  wikipedia?: WikipediaEntry[];
  /** Observability field: 'ok' = entries returned, 'no_results' = Wikipedia has no matching articles, 'api_error' = call failed (network/auth/429). */
  wikipediaStatus?: 'ok' | 'no_results' | 'api_error';
}

export interface ResearchKitInput {
  storyTitle: string;
  storyDescription?: string;
  storyAngle?: string;
  storyTags: string[];
  language?: ContentLanguage;
}

export interface ReviewDimension {
  name: string;
  score: number;
  maxScore: number;
  comment: string;
}

export interface ReviewSuggestion {
  dimension: string;
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface ReviewReportResult {
  overallScore: number;
  summary: string;
  dimensions: ReviewDimension[];
  suggestions: ReviewSuggestion[];
}

export interface ReviewReportInput {
  title: string;
  subtitle?: string;
  content: string;
  language?: ContentLanguage;
}

export interface SEOKeyword {
  keyword: string;
  searchVolume: 'high' | 'medium' | 'low';
}

export interface SEOSuggestion {
  category: string;
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface SEOResult {
  overallScore: number;
  readabilityScore: number;
  optimizedTitle: { title: string; reasoning: string }[];
  metaDescription: string;
  keywords: SEOKeyword[];
  suggestions: SEOSuggestion[];
}

export interface OptimizeSEOInput {
  title: string;
  subtitle?: string;
  content: string;
  language?: ContentLanguage;
}

// ===== GEO (Generative Engine Optimization) =====
// Mirrors the SEO DTO shapes but with GEO-specific fields. The TS interfaces
// here are the source of truth for the backend; the frontend mirrors them in
// article-api.ts and the zod schema mirrors them in zod-schemas.ts. When one
// changes, all three should change together.
export interface GEOEntity {
  name: string;
  type: 'person' | 'org' | 'place' | 'date' | 'stat';
}

export interface GEOSuggestion {
  category: string;
  priority: 'high' | 'medium' | 'low';
  suggestion: string;
}

export interface GEOSuggestedQuestion {
  question: string;
  answerSnippet: string;
}

export interface GEOKeyStatement {
  statement: string;
  reason: string;
}

export interface GEOResult {
  overallScore: number;
  citationScore: number;
  answerReadinessScore: number;
  optimizedSummary: string;
  suggestedQuestions: GEOSuggestedQuestion[];
  keyStatements: GEOKeyStatement[];
  entities: GEOEntity[];
  suggestions: GEOSuggestion[];
}

export interface OptimizeGEOInput {
  title: string;
  subtitle?: string;
  content: string;
  language?: ContentLanguage;
}
