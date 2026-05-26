import { Platform } from '@cms-ng/shared';
import {
  PlatformAdapter,
  PlatformMetadata,
  AdaptedContent,
  ValidationResult,
  extractJsonFromOutput,
} from '../platform.adapter';
import { PLATFORM_METADATA } from '../constants';

export class InstagramAdapter implements PlatformAdapter {
  readonly platform = Platform.INSTAGRAM;
  readonly metadata: PlatformMetadata = PLATFORM_METADATA[Platform.INSTAGRAM];

  getAdaptationPrompt(article: {
    title: string;
    subtitle?: string;
    content: string;
    excerpt?: string;
    tags: string[];
  }): string {
    return `请根据以下深度报道，改写为适合「Instagram」发布的图文帖文案。

原文标题：${article.title}

正文前1000字：
${article.content.slice(0, 1000)}

Instagram 文案要求：
1. 标题：简洁有力，控制在60字以内，可带emoji
2. 正文：极简风格，每句话简短。多用换行，增加可读性
3. 语气年轻活泼，像跟朋友分享有趣发现
4. 文末添加5-8个相关hashtag（带#号），混合热门标签和精准标签
5. 可用「👆」「💬」「🔗」等emoji引导互动
6. 总字数控制在800字以内

输出格式为 JSON：
{
  "title": "帖子标题（60字以内）",
  "content": "Instagram 文案内容",
  "excerpt": "可选的简短描述",
  "tags": ["#標籤1", "#標籤2"]
}`;
  }

  postProcess(rawOutput: string): AdaptedContent {
    const parsed = extractJsonFromOutput(rawOutput);
    if (parsed) {
      return {
        title: parsed.title || '',
        content: parsed.content || '',
        excerpt: parsed.excerpt,
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      };
    }
    const lines = rawOutput
      .trim()
      .split('\n')
      .filter((l) => l.trim());
    const title = lines[0]?.replace(/^#+\s*/, '').trim() || '';
    const content = lines.slice(1).join('\n').trim() || rawOutput;
    return { title, content, tags: [] };
  }

  validate(content: AdaptedContent): ValidationResult {
    const errors: string[] = [];
    if (!content.title) errors.push('标题不能为空');
    if (
      content.title &&
      content.title.length > (this.metadata.maxTitleLength || 60)
    ) {
      errors.push(`标题超过 ${this.metadata.maxTitleLength} 字限制`);
    }
    if (!content.content) errors.push('正文不能为空');
    if (
      content.content &&
      this.metadata.maxContentLength &&
      content.content.length > this.metadata.maxContentLength
    ) {
      errors.push(`正文超过 ${this.metadata.maxContentLength} 字限制`);
    }
    return { valid: errors.length === 0, errors };
  }
}
