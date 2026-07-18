import { Platform } from '@cms-ng/shared';
import {
  PlatformAdapter,
  PlatformMetadata,
  AdaptedContent,
  ValidationResult,
  extractJsonFromOutput,
} from '../platform.adapter';
import { PLATFORM_METADATA } from '../constants';

export class XiaohongshuAdapter implements PlatformAdapter {
  readonly platform = Platform.XIAOHONGSHU;
  readonly metadata: PlatformMetadata = PLATFORM_METADATA[Platform.XIAOHONGSHU];

  getAdaptationPrompt(article: {
    title: string;
    subtitle?: string;
    content: string;
    excerpt?: string;
    tags: string[];
  }): string {
    return `请根据以下深度报道，改写为适合「小红书」发布的种草笔记。

原文标题：${article.title}

正文前1500字：
${article.content.slice(0, 1500)}

小红书笔记要求：
1. 标题：吸引眼球，带数字/疑问/感叹，控制在40字以内。例：「震驚！香港這件事竟然...」「✅ 3分鐘看懂XXX」
2. 正文：种草风格，大量emoji点缀（💡✅📌🌟❤️👆）
3. 分点排版，每点前用emoji符号。如：
   💡 第一點內容
   ✅ 第二點內容
   📌 第三點內容
4. 语气亲切，像闺蜜/兄弟分享好东西
5. 结尾加互动引导：「你覺得呢？評論區告訴我👇」「點讚收藏不迷路❤️」
6. 文末添加3-5个相关话题标签（带#号）
7. 总字数控制在1000字以内

输出格式为 JSON：
{
  "title": "小红书标题（40字以内，带emoji）",
  "content": "小红书笔记正文",
  "excerpt": "可选的简短导语",
  "tags": ["#話題1", "#話題2"]
}`;
  }

  postProcess(rawOutput: string): AdaptedContent {
    const parsed = extractJsonFromOutput(rawOutput);
    if (parsed) {
      return {
        title: parsed.title || '',
        content: parsed.content || '',
        excerpt: parsed.excerpt,
        tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]) : [],
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
      content.title.length > (this.metadata.maxTitleLength || 40)
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
