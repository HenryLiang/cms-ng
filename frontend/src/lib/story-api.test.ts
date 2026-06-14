import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from './api';
import { generateResearchKit, type ResearchKitResult } from './story-api';

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
});
