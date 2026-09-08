import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveArticle,
  getArticles,
  getArticleStatusHistory,
  publishArticle,
  republishArticle,
  type Article,
} from '@/lib/article-api';
import PublishCenterPage from './page';

vi.mock('@/lib/article-api', () => ({
  archiveArticle: vi.fn(),
  getArticles: vi.fn(),
  getArticleStatusHistory: vi.fn(),
  publishArticle: vi.fn(),
  republishArticle: vi.fn(),
}));

vi.mock('@/lib/api-error-toast', () => ({ reportApiError: vi.fn() }));
vi.mock('@/store/toast-store', () => ({
  useToastStore: (selector: (state: { show: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ show: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const article = (status: Article['status']): Article => ({
  id: `article-${status}`,
  storyId: 'story-1',
  title: `${status} article`,
  content: '<p>content</p>',
  status,
  tags: ['新闻'],
  authorId: 'author-1',
  author: { id: 'author-1', name: '作者', email: 'author@example.com' },
  version: 1,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

const response = (data: Article[]) => ({
  data,
  meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 },
});

describe('PublishCenterPage', () => {
  beforeEach(() => {
    vi.mocked(getArticles).mockImplementation(async ({ status }) => {
      if (status === 'PUBLISHED,AUTO_PUBLISHED') {
        return response([article('PUBLISHED')]);
      }
      if (status === 'ARCHIVED') return response([article('ARCHIVED')]);
      return response([article('APPROVED')]);
    });
    vi.mocked(archiveArticle).mockResolvedValue(article('ARCHIVED'));
    vi.mocked(republishArticle).mockResolvedValue(article('PUBLISHED'));
    vi.mocked(publishArticle).mockResolvedValue(article('PUBLISHED'));
    vi.mocked(getArticleStatusHistory).mockResolvedValue([]);
  });

  afterEach(() => vi.clearAllMocks());

  it('archives a live article with a required reason and refreshes the list', async () => {
    render(<PublishCenterPage />);

    fireEvent.click(await screen.findByRole('button', { name: '已发布' }));
    await screen.findByText('PUBLISHED article');
    fireEvent.click(screen.getByRole('button', { name: '下架' }));
    fireEvent.change(screen.getByLabelText('下架原因'), {
      target: { value: '事实信息需要更正' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认下架' }));

    await waitFor(() => {
      expect(archiveArticle).toHaveBeenCalledWith(
        'article-PUBLISHED',
        '事实信息需要更正',
      );
    });
    expect(getArticles).toHaveBeenLastCalledWith({
      status: 'PUBLISHED,AUTO_PUBLISHED',
      page: 1,
      pageSize: 10,
    });
  });

  it('republishes an archived article from the management tab', async () => {
    render(<PublishCenterPage />);

    fireEvent.click(await screen.findByRole('button', { name: '已下架' }));
    await screen.findByText('ARCHIVED article');
    fireEvent.click(screen.getByRole('button', { name: '重新上架' }));
    fireEvent.change(screen.getByLabelText('重新上架说明（可选）'), {
      target: { value: '更正已经完成' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认重新上架' }));

    await waitFor(() => {
      expect(republishArticle).toHaveBeenCalledWith(
        'article-ARCHIVED',
        '更正已经完成',
      );
    });
  });

  it('shows the audited publication history for a managed article', async () => {
    vi.mocked(getArticleStatusHistory).mockResolvedValue([
      {
        id: 'audit-1',
        articleId: 'article-PUBLISHED',
        fromStatus: 'PUBLISHED',
        toStatus: 'ARCHIVED',
        reason: '事实信息需要更正',
        createdAt: '2026-09-02T00:00:00.000Z',
        operator: {
          id: 'editor-1',
          name: '值班编辑',
          email: 'editor@example.com',
        },
      },
    ]);
    render(<PublishCenterPage />);

    fireEvent.click(await screen.findByRole('button', { name: '已发布' }));
    await screen.findByText('PUBLISHED article');
    fireEvent.click(screen.getByRole('button', { name: '操作记录' }));

    const dialog = await screen.findByRole('dialog', { name: '发布状态记录' });
    expect(dialog).toHaveTextContent('事实信息需要更正');
    expect(dialog).toHaveTextContent('值班编辑');
    expect(getArticleStatusHistory).toHaveBeenCalledWith('article-PUBLISHED');
  });
});
