export interface RewriteTextInput {
  text: string;
  instruction?: string;
  style?: 'serious' | 'casual' | 'academic' | 'concise';
}

export interface ExpandTextInput {
  text: string;
  instruction?: string;
}

export interface CondenseTextInput {
  text: string;
  maxLength?: number;
}

export interface PolishTextInput {
  text: string;
}

export interface GenerateHeadlinesInput {
  title: string;
  subtitle?: string;
  content: string;
  count?: number;
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
}

export interface GenerateDraftInput {
  storyTitle: string;
  storyDescription?: string;
  storyAngle?: string;
  storyTags: string[];
  currentTitle?: string;
  currentSubtitle?: string;
  instruction?: string;
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

export interface ResearchKitResult {
  timeline: ResearchKitTimelineEvent[];
  people: ResearchKitPerson[];
  data: ResearchKitDataPoint[];
  opinions: ResearchKitOpinion[];
  relatedArticles?: string[];
}

export interface ResearchKitInput {
  storyTitle: string;
  storyDescription?: string;
  storyAngle?: string;
  storyTags: string[];
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
}
