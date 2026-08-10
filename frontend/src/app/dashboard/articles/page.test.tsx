import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getArticles, type Article } from '@/lib/article-api';
import { reportApiError } from '@/lib/api-error-toast';
import ArticlesPage from './page';

vi.mock('@/lib/article-api', () => ({
  getArticles: vi.fn(),
}));

vi.mock('@/lib/api-error-toast', () => ({
  reportApiError: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const article: Article = {
  id: 'article-1',
  storyId: 'story-1',
  title: 'Climate report',
  content: 'Full article content',
  status: 'DRAFT',
  tags: [],
  authorId: 'author-1',
  version: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const response = {
  data: [article],
  meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

describe('ArticlesPage', () => {
  beforeEach(() => {
    vi.mocked(getArticles).mockResolvedValue(response);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('searches article titles and content with the submitted term', async () => {
    render(<ArticlesPage />);

    await screen.findByText('Climate report');
    fireEvent.change(screen.getByPlaceholderText('搜索稿件标题或正文'), {
      target: { value: '  carbon  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    await waitFor(() => {
      expect(getArticles).toHaveBeenLastCalledWith({ search: 'carbon' });
    });
  });

  it('reports search request failures through the shared API error toast', async () => {
    const error = new Error('Search failed');
    vi.mocked(getArticles)
      .mockResolvedValueOnce(response)
      .mockRejectedValueOnce(error);

    render(<ArticlesPage />);

    await screen.findByText('Climate report');
    fireEvent.change(screen.getByPlaceholderText('搜索稿件标题或正文'), {
      target: { value: 'carbon' },
    });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    await waitFor(() => {
      expect(reportApiError).toHaveBeenCalledWith(error);
    });
  });
});
