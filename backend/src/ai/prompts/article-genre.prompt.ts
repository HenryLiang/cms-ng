import {
  ARTICLE_GENRE_CATALOG,
  ArticleGenre,
  DEFAULT_DRAFT_WORD_COUNT,
  type ArticleGenreProfile,
} from '@cms-ng/shared';

export { DEFAULT_DRAFT_WORD_COUNT } from '@cms-ng/shared';

function findGenreProfile(genre: ArticleGenre): ArticleGenreProfile {
  return (
    ARTICLE_GENRE_CATALOG.find((profile) => profile.value === genre) ??
    ARTICLE_GENRE_CATALOG[0]
  );
}

/**
 * Turns the small public genre interface into detailed, auditable editorial
 * instructions. Callers only select a genre and target length; all writing
 * knowledge remains local to this module/catalog.
 */
export function buildArticleGenreInstruction(
  genre: ArticleGenre = ArticleGenre.STRAIGHT_NEWS,
  targetWordCount = DEFAULT_DRAFT_WORD_COUNT,
): string {
  const profile = findGenreProfile(genre);
  const structure = profile.structure
    .map((section, index) => `${index + 1}. ${section}`)
    .join('\n');
  const characteristics = profile.characteristics
    .map((characteristic) => `- ${characteristic}`)
    .join('\n');

  return `【本稿文体规范】
文体类型：${profile.label}
定义：${profile.definition}

结构要求：
${structure}

写作特点：
${characteristics}

篇幅要求：
- 目标篇幅：约 ${targetWordCount} 字，允许上下浮动 10%，但不能用重复信息、空话或无依据细节凑字数。
- 中文稿按汉字篇幅控制；英文稿按英文单词数控制。

共同质量底线：
- 文体规范优先于通用写作习惯，最终输出必须是完整成稿，不是提纲或素材汇总。
- 只使用选题信息、资料包和额外要求中有依据的事实；不得虚构事实、数据、出处、现场、引语或人物心理。
- 重要事实尽量交代信息来源；资料互相冲突时明确写出分歧，不擅自替读者判定。
- 发现关键资料不足时，降低结论强度或明确仍待核实，绝不以常识猜测补齐。`;
}
