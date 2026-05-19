import { Platform } from '@cms-ng/shared';
import { PlatformAdapter, PlatformMetadata, AdaptedContent, ValidationResult, extractJsonFromOutput } from '../platform.adapter';
import { PLATFORM_METADATA } from '../constants';

export class FacebookAdapter implements PlatformAdapter {
  readonly platform = Platform.FACEBOOK;
  readonly metadata: PlatformMetadata = PLATFORM_METADATA[Platform.FACEBOOK];

  getAdaptationPrompt(article: { title: string; subtitle?: string; content: string; excerpt?: string; tags: string[] }): string {
    return `请根据以下深度报道，改写为适合「Facebook」发布的社交帖子。

原文标题：${article.title}
${article.subtitle ? '原文副标题：' + article.subtitle : ''}

正文前1500字：
${article.content.slice(0, 1500)}

Facebook 帖子要求：
1. 标题：提炼核心观点，控制在80字以内，带emoji增加亲和力
2. 正文：口语化表达，像朋友聊天一样分享新闻。分段清晰，每段2-3句话
3. 增加互动引导语，如「你怎麼看？」「留言告訴我們你的想法」
4. 文末添加3-5个相关hashtag（带#号）
5. 语气亲切但有专业度，适当使用emoji

输出格式为 JSON：
{
  "title": "帖子标题（80字以内）",
  "content": "帖子正文内容",
  "excerpt": "可选的简短导语",
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
    const lines = rawOutput.trim().split('\n').filter((l) => l.trim());
    const title = lines[0]?.replace(/^#+\s*/, '').trim() || '';
    const content = lines.slice(1).join('\n').trim() || rawOutput;
    return { title, content, tags: [] };
  }

  validate(content: AdaptedContent): ValidationResult {
    const errors: string[] = [];
    if (!content.title) errors.push('标题不能为空');
    if (content.title && content.title.length > (this.metadata.maxTitleLength || 80)) {
      errors.push(`标题超过 ${this.metadata.maxTitleLength} 字限制`);
    }
    if (!content.content) errors.push('正文不能为空');
    if (content.content && this.metadata.maxContentLength && content.content.length > this.metadata.maxContentLength) {
      errors.push(`正文超过 ${this.metadata.maxContentLength} 字限制`);
    }
    return { valid: errors.length === 0, errors };
  }
}
