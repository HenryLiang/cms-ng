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
