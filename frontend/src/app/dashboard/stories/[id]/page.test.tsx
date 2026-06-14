import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: 'story-1' }),
  usePathname: () => '/dashboard/stories/story-1',
}));

// Mock auth store with an authenticated user
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector?: any) => {
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
  default: () => null,
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
      config: {} as any,
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
      config: {} as any,
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
