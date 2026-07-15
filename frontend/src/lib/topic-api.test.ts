import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { getTopicSourceItems, getTopicSources } from './topic-api';

vi.mock('./api', () => ({
  api: {
    get: vi.fn(),
  },
}));

describe('topic source API', () => {
  afterEach(() => vi.clearAllMocks());

  it('loads the server-owned source catalog', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: [
          { id: 'bbc', label: 'BBC', category: 'news', icon: 'newspaper' },
        ],
      },
    });

    await expect(getTopicSources()).resolves.toEqual([
      expect.objectContaining({ id: 'bbc' }),
    ]);
    expect(api.get).toHaveBeenCalledWith('/trending-topics/sources');
  });

  it('fetches any source through one endpoint with dynamic parameters', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: { items: [], total: 0, page: 1, limit: 20, totalPages: 1 },
      },
    });

    await getTopicSourceItems('google-trends', {
      page: 1,
      limit: 20,
      geo: 'US',
    });

    expect(api.get).toHaveBeenCalledWith(
      '/trending-topics/sources/google-trends/items',
      { params: { page: 1, limit: 20, geo: 'US' } },
    );
  });
});
