import { Platform } from '@cms-ng/shared';

export interface PlatformMetadata {
  key: Platform;
  name: string;
  description: string;
  maxTitleLength?: number;
  maxContentLength?: number;
  supportsImages: boolean;
  supportsVideo: boolean;
  aspectRatios: string[];
  styleGuide: string;
}

export interface AdaptedContent {
  title: string;
  content: string;
  excerpt?: string;
  tags: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** LLM 适配输出的原始 JSON 结构(字段可能缺失/类型松散,postProcess 兜底) */
export interface RawAdaptedJson {
  title?: string;
  content?: string;
  excerpt?: string;
  tags?: unknown;
}

export function extractJsonFromOutput(rawOutput: string): RawAdaptedJson | null {
  // Try direct parse first
  try {
    return JSON.parse(rawOutput.trim());
  } catch {
    // Try to extract JSON block from markdown code fence
    const jsonMatch = rawOutput.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // fall through
      }
    }
    // Try to extract JSON object between curly braces
    const braceMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0].trim());
      } catch {
        // fall through
      }
    }
  }
  return null;
}

export interface PlatformAdapter {
  readonly platform: Platform;
  readonly metadata: PlatformMetadata;

  getAdaptationPrompt(article: {
    title: string;
    subtitle?: string;
    content: string;
    excerpt?: string;
    tags: string[];
  }): string;

  postProcess(rawOutput: string): AdaptedContent;

  validate(content: AdaptedContent): ValidationResult;
}
