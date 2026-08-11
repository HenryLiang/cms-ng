import type { Article } from '@prisma/client';
import {
  ARTICLE_INDEX_MAPPINGS,
  buildArticleSearchBackfillAction,
  buildArticleSearchDoc,
  getArticleSearchVersion,
} from './article-index.mapping';

describe('article index mapping', () => {
  it('uses IK analysis for article titles and full content', () => {
    expect(ARTICLE_INDEX_MAPPINGS.properties.title).toEqual(
      expect.objectContaining({ type: 'text', analyzer: 'ik_max_word' }),
    );
    expect(ARTICLE_INDEX_MAPPINGS.properties.content).toEqual(
      expect.objectContaining({ type: 'text', analyzer: 'ik_max_word' }),
    );
    expect(ARTICLE_INDEX_MAPPINGS.properties.tags).toEqual(
      expect.objectContaining({ type: 'text', analyzer: 'ik_max_word' }),
    );
  });

  it('builds a permission-aware document and removes HTML tags from content', () => {
    const article = {
      id: 'article-1',
      title: '气候政策新进展',
      content: '<p>香港<strong>减碳</strong>&nbsp;计划</p>',
      tags: '["香港","减碳政策"]',
      authorId: 'reporter-1',
      editorId: 'editor-1',
      status: 'IN_REVIEW',
      storyId: 'story-1',
      updatedAt: new Date('2026-08-10T01:02:03.000Z'),
    } as Article;

    expect(buildArticleSearchDoc(article)).toEqual({
      id: 'article-1',
      title: '气候政策新进展',
      content: '香港 减碳 计划',
      tags: ['香港', '减碳政策'],
      authorId: 'reporter-1',
      editorId: 'editor-1',
      status: 'IN_REVIEW',
      storyId: 'story-1',
      updatedAt: '2026-08-10T01:02:03.000Z',
    });
    expect(getArticleSearchVersion(article)).toBe(
      new Date('2026-08-10T01:02:03.000Z').getTime(),
    );
    expect(buildArticleSearchBackfillAction('articles', article)).toEqual({
      index: {
        _index: 'articles',
        _id: 'article-1',
        version: new Date('2026-08-10T01:02:03.000Z').getTime(),
        version_type: 'external_gte',
      },
    });
  });
});
