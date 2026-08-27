import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { ArticleGenre, ContentLanguage } from '@cms-ng/shared';

interface MockAuthState {
  user: { id: string; email: string; name: string; role: string; preferredLanguage: string };
  isAuthenticated: boolean;
  isLoading: boolean;
  _hasHydrated: boolean;
  logout: ReturnType<typeof vi.fn>;
}

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: 'story-1' }),
  usePathname: () => '/dashboard/stories/story-1',
}));

// Mock auth store with an authenticated user
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector?: (state: MockAuthState) => unknown) => {
      const state = {
        user: { id: 'u1', email: 'b@test.com', name: 'B', role: 'REPORTER', preferredLanguage: 'TRADITIONAL_CHINESE_HK' },
        isAuthenticated: true,
        isLoading: false,
        _hasHydrated: true,
        logout: vi.fn(),
      };
      return typeof selector === 'function' ? selector(state) : state;
    },
    {
      getState: () => ({
        user: { id: 'u1', email: 'b@test.com', name: 'B', role: 'REPORTER', preferredLanguage: 'TRADITIONAL_CHINESE_HK' },
        isAuthenticated: true,
        isLoading: false,
        _hasHydrated: true,
        logout: vi.fn(),
      }),
    },
  ),
}));

// Mock the API modules used by the page
vi.mock('@/lib/story-api', () => ({
  getStory: vi.fn(),
  updateStory: vi.fn(),
  deleteStory: vi.fn(),
  generateResearchKit: vi.fn(),
  generateDraftFromResearchKit: vi.fn(),
}));

vi.mock('@/lib/article-api', () => ({
  getArticles: vi.fn(),
  createArticle: vi.fn(),
}));

// Mock research-kit-panel so we don't pull in heavy child component tree
vi.mock('@/components/research-kit-panel', () => ({
  default: ({
    researchKit,
    onGenerateDraft,
  }: {
    researchKit?: unknown;
    onGenerateDraft?: () => void;
  }) =>
    researchKit && onGenerateDraft ? (
      <button onClick={onGenerateDraft}>提交 AI 初稿</button>
    ) : null,
}));

vi.mock('@/components/language-badge', () => ({
  default: () => null,
}));

import StoryDetailPage from './page';
import * as storyApi from '@/lib/story-api';
import * as articleApi from '@/lib/article-api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StoryDetailPage - error handling for getStory', () => {
  it('shows a permission-denied message when getStory returns 403 (not the misleading "选题不存在")', async () => {
    const axiosError = new axios.AxiosError('Request failed');
    axiosError.response = {
      status: 403,
      data: { message: 'You do not have permission to modify this story' },
      statusText: 'Forbidden',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    };
    vi.mocked(storyApi.getStory).mockRejectedValue(axiosError);
    vi.mocked(articleApi.getArticles).mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });

    render(<StoryDetailPage />);

    // Should NOT show the misleading "选题不存在" when the error is permission-related
    await waitFor(() => {
      expect(screen.queryByText('选题不存在')).not.toBeInTheDocument();
    });
    // Should show a real error message (either the API's message or a localized fallback)
    expect(
      await screen.findByText(/没有权限|无权访问|权限不足|forbidden|403|permission/i),
    ).toBeInTheDocument();
  });

  it('shows a not-found message when getStory returns 404', async () => {
    const axiosError = new axios.AxiosError('Request failed');
    axiosError.response = {
      status: 404,
      data: { message: 'Story not found' },
      statusText: 'Not Found',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    };
    vi.mocked(storyApi.getStory).mockRejectedValue(axiosError);
    vi.mocked(articleApi.getArticles).mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });

    render(<StoryDetailPage />);

    // The 404 case legitimately maps to "选题不存在"
    expect(await screen.findByText('选题不存在')).toBeInTheDocument();
  });
});

describe('StoryDetailPage - draft preferences', () => {
  it('uses the account content language when a story has no saved language', async () => {
    const researchKit = {
      timeline: [{ date: '2026-08-26', event: '旧资料' }],
      people: [],
      data: [],
      opinions: [],
    };
    vi.mocked(storyApi.getStory).mockResolvedValue({
      id: 'story-1',
      title: '旧选题',
      status: 'DRAFT',
      priority: 1,
      tags: [],
      reporterId: 'u1',
      createdAt: '2026-08-26T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:00.000Z',
    });
    vi.mocked(articleApi.getArticles).mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    vi.mocked(storyApi.generateResearchKit).mockResolvedValue(researchKit);
    vi.mocked(storyApi.generateDraftFromResearchKit).mockResolvedValue({
      article: { id: 'article-1', title: '初稿' },
    });

    render(<StoryDetailPage />);

    await screen.findByText('旧选题');
    fireEvent.click(screen.getByRole('button', { name: '生成资料包' }));
    fireEvent.click(
      await screen.findByRole('button', { name: '按所选文体生成初稿' }),
    );

    await waitFor(() => {
      expect(storyApi.generateDraftFromResearchKit).toHaveBeenCalledWith(
        'story-1',
        researchKit,
        expect.objectContaining({
          language: ContentLanguage.TRADITIONAL_CHINESE_HK,
        }),
      );
    });
  });

  it('lets the user choose a genre and enter the target word count', async () => {
    const researchKit = {
      timeline: [{ date: '2026-08-26', event: '政策发布' }],
      people: [],
      data: [],
      opinions: [],
    };
    vi.mocked(storyApi.getStory).mockResolvedValue({
      id: 'story-1',
      title: '测试选题',
      status: 'DRAFT',
      priority: 1,
      tags: [],
      reporterId: 'u1',
      contentLanguage: ContentLanguage.SIMPLIFIED_CHINESE,
      createdAt: '2026-08-26T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:00.000Z',
    });
    vi.mocked(articleApi.getArticles).mockResolvedValue({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    vi.mocked(storyApi.generateResearchKit).mockResolvedValue(researchKit);
    vi.mocked(storyApi.generateDraftFromResearchKit).mockResolvedValue({
      article: { id: 'article-1', title: '初稿' },
    });

    render(<StoryDetailPage />);

    await screen.findByText('测试选题');
    fireEvent.click(screen.getByRole('button', { name: '生成资料包' }));

    const genreSelect = await screen.findByLabelText('文体类型');
    fireEvent.change(genreSelect, {
      target: { value: ArticleGenre.NEWS_COMMENTARY },
    });
    fireEvent.change(screen.getByLabelText('目标字数'), {
      target: { value: '2300' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('补充采访重点、材料限制或其他特殊要求（可选）'),
      { target: { value: '重点分析政策对基层执行的影响' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: '按所选文体生成初稿' }),
    );

    await waitFor(() => {
      expect(storyApi.generateDraftFromResearchKit).toHaveBeenCalledWith(
        'story-1',
        researchKit,
        {
          instruction: '重点分析政策对基层执行的影响',
          language: ContentLanguage.SIMPLIFIED_CHINESE,
          authorSlug: '',
          genre: ArticleGenre.NEWS_COMMENTARY,
          targetWordCount: 2300,
        },
      );
    });
  });
});
