import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from './api';
import { ArticleGenre, ContentLanguage } from '@cms-ng/shared';
import {
  generateDraftFromResearchKit,
  generateResearchKit,
  type ResearchKitResult,
} from './story-api';

vi.mock('./api', () => ({
  api: {
    post: vi.fn(),
  },
}));

describe('story-api', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateResearchKit', () => {
    it('should call POST /stories/:id/research and return result', async () => {
      const mockResult: ResearchKitResult = {
        timeline: [{ date: '2024-01-01', event: 'Event 1' }],
        people: [{ name: 'Person A', role: 'Reporter' }],
        data: [{ label: 'Label 1', value: 'Value 1' }],
        opinions: [{ source: 'Source A', viewpoint: 'Viewpoint A' }],
      };
      vi.mocked(api.post).mockResolvedValue({ data: mockResult });

      const result = await generateResearchKit('story-1');

      expect(api.post).toHaveBeenCalledWith(
        '/stories/story-1/research',
        {},
        { params: { language: undefined } },
      );
      expect(result.timeline).toHaveLength(1);
      expect(result.people).toHaveLength(1);
      expect(result.data).toHaveLength(1);
      expect(result.opinions).toHaveLength(1);
    });

    it('should propagate API errors', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Network error'));

      await expect(generateResearchKit('story-1')).rejects.toThrow('Network error');
    });
  });

  describe('generateDraftFromResearchKit', () => {
    it('sends the selected genre and freely entered target length', async () => {
      const researchKit: ResearchKitResult = {
        timeline: [],
        people: [],
        data: [],
        opinions: [],
      };
      vi.mocked(api.post).mockResolvedValue({
        data: { article: { id: 'article-1', title: 'Draft' } },
      });

      await generateDraftFromResearchKit('story-1', researchKit, {
        instruction: '突出政策影响',
        language: ContentLanguage.SIMPLIFIED_CHINESE,
        authorSlug: 'author-luxun',
        genre: ArticleGenre.IN_DEPTH_REPORT,
        targetWordCount: 2800,
      });

      expect(api.post).toHaveBeenCalledWith('/stories/story-1/draft', {
        researchKit,
        instruction: '突出政策影响',
        language: ContentLanguage.SIMPLIFIED_CHINESE,
        authorSlug: 'author-luxun',
        genre: ArticleGenre.IN_DEPTH_REPORT,
        targetWordCount: 2800,
      });
    });
  });
});
