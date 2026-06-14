import { ContentLanguage } from '@cms-ng/shared';

export interface RewriteTextInput {
  text: string;
  instruction?: string;
  style?: 'serious' | 'casual' | 'academic' | 'concise';
  language?: ContentLanguage;
}

export interface ExpandTextInput {
  text: string;
  instruction?: string;
  language?: ContentLanguage;
}

export interface CondenseTextInput {
  text: string;
  maxLength?: number;
  language?: ContentLanguage;
}

export interface PolishTextInput {
  text: string;
  language?: ContentLanguage;
}

export interface GenerateHeadlinesInput {
  title: string;
  subtitle?: string;
  content: string;
  count?: number;
  language?: ContentLanguage;
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
