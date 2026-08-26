import { ARTICLE_GENRE_CATALOG, ArticleGenre } from '@cms-ng/shared';
import {
  buildArticleGenreInstruction,
  DEFAULT_DRAFT_WORD_COUNT,
} from './article-genre.prompt';

describe('buildArticleGenreInstruction', () => {
  it.each(ARTICLE_GENRE_CATALOG)(
    'describes the definition, structure, and characteristics of $label',
    (profile) => {
      const instruction = buildArticleGenreInstruction(profile.value, 1860);

      expect(instruction).toContain(`文体类型：${profile.label}`);
      expect(instruction).toContain(`定义：${profile.definition}`);
      expect(instruction).toContain('结构要求：');
      profile.structure.forEach((section) => {
        expect(instruction).toContain(section);
      });
      expect(instruction).toContain('写作特点：');
      profile.characteristics.forEach((characteristic) => {
        expect(instruction).toContain(characteristic);
      });
      expect(instruction).toContain('目标篇幅：约 1860 字');
    },
  );

  it('gives in-depth reporting an evidence-led analytical structure', () => {
    const instruction = buildArticleGenreInstruction(
      ArticleGenre.IN_DEPTH_REPORT,
      3000,
    );

    expect(instruction).toContain('核心问题');
    expect(instruction).toContain('证据链');
    expect(instruction).toContain('多方观点');
    expect(instruction).toContain('不得虚构');
  });

  it('uses the editorial default when preferences are omitted', () => {
    const instruction = buildArticleGenreInstruction();

    expect(instruction).toContain('文体类型：消息（标准新闻）');
    expect(instruction).toContain(
      `目标篇幅：约 ${DEFAULT_DRAFT_WORD_COUNT} 字`,
    );
  });
});
