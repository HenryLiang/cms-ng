import { Platform } from '@cms-ng/shared';
import {
  PlatformAdapter,
  PlatformMetadata,
  AdaptedContent,
  ValidationResult,
  extractJsonFromOutput,
} from '../platform.adapter';
import { PLATFORM_METADATA } from '../constants';

export class WordPressAdapter implements PlatformAdapter {
  readonly platform = Platform.WORDPRESS;
  readonly metadata: PlatformMetadata = PLATFORM_METADATA[Platform.WORDPRESS];

  getAdaptationPrompt(article: {
    title: string;
    subtitle?: string;
    content: string;
    excerpt?: string;
    tags: string[];
  }): string {
    return `请根据以下文章，生成适配 WordPress 博客/网站的 SEO 优化内容。

原文标题：${article.title}
${article.subtitle ? '原文副标题：' + article.subtitle : ''}
原文标签：${article.tags.join(', ')}

正文：
${article.content.slice(0, 5000)}

要求：
1. 标题要 SEO 友好，包含核心关键词，吸引搜索引擎和读者点击
2. 正文保持完整内容，使用 HTML 格式，结构清晰：
   - 使用 <h2> 和 <h3> 分段，层级分明
   - 使用 <p> 包裹段落
   - 可使用 <strong>、<em>、<blockquote>、<ul>、<ol>、<li> 等标签
   - 不要使用 <h1>（WordPress 会自动用标题作为 H1）
3. 生成一个 meta description 风格的摘要（120-160字），概括文章核心内容，适合搜索引擎展示
4. 生成 3-5 个 SEO 相关的标签/关键词
5. 输出格式为 JSON：
{
  "title": "SEO优化标题",
  "content": "正文内容（包含HTML标签）",
  "excerpt": "meta description 风格摘要",
  "tags": ["关键词1", "关键词2", "关键词3"]
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
    if (content.title.length > this.metadata.maxTitleLength!) {
      errors.push(`标题超过 ${this.metadata.maxTitleLength} 字限制`);
    }
    return { valid: errors.length === 0, errors };
  }
}
