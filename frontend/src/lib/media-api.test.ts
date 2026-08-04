import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from './api';
import { retagMedia, type MediaAsset } from './media-api';
import { MediaSource, MediaStatus, MediaTagStatus } from '@cms-ng/shared';

vi.mock('./api', () => ({
  api: {
    post: vi.fn(),
  },
}));

describe('media-api', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('retagMedia', () => {
    it('POST /media/:id/retag 并返回含打标字段的资产', async () => {
      const mockAsset: MediaAsset = {
        id: 'a1',
        storageKey: 'k',
        url: 'https://bkt/img.png',
        thumbnailUrl: null,
        fileName: 'img.png',
        mimeType: 'image/png',
        size: 1024,
        width: 800,
        height: 600,
        source: MediaSource.UPLOAD,
        sourceRef: null,
        prompt: null,
        altText: '一片花海',
        title: null,
        description: null,
        tags: ['人工'],
        aiTags: ['花海', '春天'],
        tagStatus: MediaTagStatus.PENDING,
        taggedAt: null,
        tagError: null,
        ownerId: 'u1',
        libraryType: 'PERSONAL',
        teamId: null,
        status: MediaStatus.ACTIVE,
        createdAt: '2026-08-03T00:00:00.000Z',
        updatedAt: '2026-08-03T00:00:00.000Z',
      };
      vi.mocked(api.post).mockResolvedValue({ data: mockAsset });

      const result = await retagMedia('a1');

      expect(api.post).toHaveBeenCalledWith('/media/a1/retag');
      expect(result.id).toBe('a1');
      expect(result.aiTags).toEqual(['花海', '春天']);
      expect(result.tagStatus).toBe(MediaTagStatus.PENDING);
    });

    it('传播 API 错误', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Network error'));
      await expect(retagMedia('a1')).rejects.toThrow('Network error');
    });
  });
});
