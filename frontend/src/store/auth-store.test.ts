import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserRole } from '@cms-ng/shared';

// Mock zustand persist middleware before importing store
vi.mock('zustand/middleware', () => ({
  persist:
    <T>(createFn: (set: unknown, get: unknown, api: unknown) => T) =>
    (set: unknown, get: unknown, api: unknown): T => {
      const store = createFn(set, get, api);
      return store;
    },
  createJSONStorage: () => ({
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }),
}));

// Mock auth-api before importing the store
vi.mock('@/lib/auth-api', () => ({
  login: vi.fn(),
  register: vi.fn(),
  getCurrentUser: vi.fn(),
  logoutClient: vi.fn(),
}));

import { login } from '@/lib/auth-api';
import { useAuthStore } from './auth-store';

describe('auth-store', () => {
  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: UserRole.REPORTER,
  };

  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should have null user and not be authenticated', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.accessToken).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('login', () => {
    it('should set user and token on successful login', async () => {
      vi.mocked(login).mockResolvedValue({
        user: mockUser,
        accessToken: 'token-123',
      });

      await useAuthStore.getState().login('test@example.com', 'password');

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.accessToken).toBe('token-123');
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('should throw and reset loading on login failure', async () => {
      vi.mocked(login).mockRejectedValue(new Error('Invalid credentials'));

      await expect(useAuthStore.getState().login('test@example.com', 'wrong')).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('role checks', () => {
    it('isAdmin returns true for ADMIN', () => {
      useAuthStore.setState({ user: { ...mockUser, role: UserRole.ADMIN } });
      expect(useAuthStore.getState().isAdmin()).toBe(true);
      expect(useAuthStore.getState().isEditor()).toBe(true);
    });

    it('isEditor returns true for EDITOR', () => {
      useAuthStore.setState({ user: { ...mockUser, role: UserRole.EDITOR } });
      expect(useAuthStore.getState().isEditor()).toBe(true);
      expect(useAuthStore.getState().isAdmin()).toBe(false);
    });

    it('isReporter returns true for REPORTER', () => {
      useAuthStore.setState({ user: mockUser });
      expect(useAuthStore.getState().isReporter()).toBe(true);
      expect(useAuthStore.getState().isEditor()).toBe(false);
    });

    it('role checks return false when no user', () => {
      expect(useAuthStore.getState().isAdmin()).toBe(false);
      expect(useAuthStore.getState().isEditor()).toBe(false);
      expect(useAuthStore.getState().isReporter()).toBe(false);
    });
  });

  describe('logout', () => {
    it('should clear auth state', () => {
      useAuthStore.setState({
        user: mockUser,
        accessToken: 'token',
        isAuthenticated: true,
      });

      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });
});
