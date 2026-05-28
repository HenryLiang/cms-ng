import { Platform } from '@cms-ng/shared';
import {
  PlatformAdapter,
  PlatformMetadata,
  AdaptedContent,
  ValidationResult,
  extractJsonFromOutput,
} from '../platform.adapter';
import { PLATFORM_METADATA } from '../constants';

export class WebsiteAdapter implements PlatformAdapter {
  readonly platform = Platform.WEBSITE;
  readonly metadata: PlatformMetadata = PLATFORM_METADATA[Platform.WEBSITE];

  getAdaptationPrompt(article: {
    title: string;
    subtitle?: string;
    content: string;
    excerpt?: string;
    tags: string[];
  }): string {
    return `请根据以下文章，生成适配「LC 传媒官网/APP」发布的内容。

原文标题：${article.title}
${article.subtitle ? '原文副标题：' + article.subtitle : ''}
原文标签：${article.tags.join(', ')}

正文：
${article.content.slice(0, 3000)}

要求：
1. 标题保留原标题，可微调使其更吸引点击
2. 正文保持完整，保留所有关键细节和引用
3. 生成一个简短的摘要/导语（80字以内），放在正文开头
4. 输出格式为 JSON：
{
  "title": "标题",
  "content": "正文内容（包含HTML标签）",
  "excerpt": "摘要",
  "tags": ["标签1", "标签2"]
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
    // Fallback: try to extract title from first line
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
    if (!content.content) errors.push('正文不能为空');
    return { valid: errors.length === 0, errors };
  }
}
