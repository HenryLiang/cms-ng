import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import type { Article } from '@/lib/article-api';
import { ArticleStatus } from '@cms-ng/shared';

vi.mock('@/lib/review-api', () => ({
  getReviewQueue: vi.fn(),
  submitReview: vi.fn(),
}));
vi.mock('@/lib/article-api', () => ({
  getArticle: vi.fn(),
}));

import ReviewPage from './page';
import * as reviewApi from '@/lib/review-api';
import * as articleApi from '@/lib/article-api';

const baseArticle = (id: string, title: string, content: string): Article => ({
  id,
  storyId: 's1',
  title,
  content,
  status: ArticleStatus.PENDING_REVIEW,
  tags: [],
  authorId: 'u1',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReviewPage - detail load race (issue #110)', () => {
  it('discards a stale detail response when a newer article is selected', async () => {
    const queueA = baseArticle('a1', 'Article A', 'A body');
    const queueB = baseArticle('b1', 'Article B', 'B body');
    const detailA = baseArticle('a1', 'Article A', 'A BODY FULL');
    const detailB = baseArticle('b1', 'Article B', 'B BODY FULL');

    vi.mocked(reviewApi.getReviewQueue).mockResolvedValue([queueA, queueB]);

    // Article A's detail is slow (deferred); Article B resolves immediately.
    let resolveA!: (v: Article) => void;
    const slowA = new Promise<Article>((r) => {
      resolveA = r;
    });
    vi.mocked(articleApi.getArticle).mockImplementation((id: string) =>
      id === 'a1' ? slowA : Promise.resolve(detailB),
    );

    render(<ReviewPage />);

    // Mount auto-selects queue[0] = A; A's detail is pending. List renders B.
    const btnB = await screen.findByRole('button', { name: /Article B/ });

    // Click article B -> B's detail resolves immediately
    await act(async () => {
      fireEvent.click(btnB);
    });
    await waitFor(() => {
      expect(screen.getByText('B BODY FULL')).toBeInTheDocument();
    });

    // A's slow response finally resolves - must NOT overwrite B's detail
    await act(async () => {
      resolveA(detailA);
    });

    expect(screen.queryByText('A BODY FULL')).not.toBeInTheDocument();
    expect(screen.getByText('B BODY FULL')).toBeInTheDocument();
  });

  it('surfaces a load error instead of silently failing when getReviewQueue rejects', async () => {
    vi.mocked(reviewApi.getReviewQueue).mockRejectedValue(new Error('网络错误'));

    render(<ReviewPage />);

    expect(await screen.findByText('网络错误')).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
  });
});
