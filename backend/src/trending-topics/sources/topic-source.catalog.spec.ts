import { TopicSourceAdapter } from './topic-source.adapter';
import { TopicSourceCatalog } from './topic-source.catalog';
import { BadRequestException } from '@nestjs/common';

describe('TopicSourceCatalog', () => {
  it('lists definitions from every adapter through one public interface', async () => {
    const rssAdapter: TopicSourceAdapter = {
      listDefinitions: jest.fn().mockResolvedValue([
        {
          id: 'bbc',
          label: 'BBC',
          category: 'news',
          icon: 'newspaper',
        },
      ]),
      fetch: jest.fn(),
    };
    const socialAdapter: TopicSourceAdapter = {
      listDefinitions: jest.fn().mockResolvedValue([
        {
          id: 'x-trends',
          label: 'X 趋势',
          category: 'social',
          icon: 'social',
        },
      ]),
      fetch: jest.fn(),
    };

    const catalog = new TopicSourceCatalog([rssAdapter, socialAdapter]);

    await expect(catalog.listSources({ userId: 'user-1' })).resolves.toEqual([
      expect.objectContaining({ id: 'bbc' }),
      expect.objectContaining({ id: 'x-trends' }),
    ]);
  });

  it('fetches a source without exposing adapter selection to the caller', async () => {
    const page = {
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    };
    const rssAdapter: TopicSourceAdapter = {
      listDefinitions: jest.fn().mockResolvedValue([
        {
          id: 'bbc',
          label: 'BBC',
          category: 'news',
          icon: 'newspaper',
        },
      ]),
      fetch: jest.fn().mockResolvedValue(page),
    };
    const otherAdapter: TopicSourceAdapter = {
      listDefinitions: jest.fn().mockResolvedValue([
        {
          id: 'this-day',
          label: '当年今日',
          category: 'history',
          icon: 'calendar',
        },
      ]),
      fetch: jest.fn(),
    };
    const catalog = new TopicSourceCatalog([rssAdapter, otherAdapter]);

    await expect(
      catalog.fetch('bbc', { userId: 'user-1' }, { page: 1, limit: 20 }),
    ).resolves.toEqual(page);
    expect(rssAdapter.fetch).toHaveBeenCalledWith(
      'bbc',
      { userId: 'user-1' },
      { page: 1, limit: 20 },
    );
    expect(otherAdapter.fetch).not.toHaveBeenCalled();
  });

  it('supports the legacy Bilibili spelling but rejects unknown sources', async () => {
    const adapter: TopicSourceAdapter = {
      listDefinitions: jest.fn().mockResolvedValue([
        {
          id: 'bilibili-partition',
          label: 'B站分区热榜',
          category: 'trending',
          icon: 'video',
        },
      ]),
      fetch: jest.fn().mockResolvedValue({ items: [] }),
    };
    const catalog = new TopicSourceCatalog([adapter]);

    await catalog.fetch('bilibili-partion', {}, {});
    expect(adapter.fetch).toHaveBeenCalledWith('bilibili-partition', {}, {});
    await expect(catalog.fetch('missing', {}, {})).rejects.toThrow(
      BadRequestException,
    );
  });
});
