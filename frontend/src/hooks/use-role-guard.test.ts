import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { UserRole } from '@cms-ng/shared';

const mockReplace = vi.fn();
const mockPathname = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname(),
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (selector?: (state: {
    user: { role: UserRole } | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    _hasHydrated: boolean;
  }) => unknown) => {
    const state = {
      user: mockUser,
      isAuthenticated: mockIsAuthenticated,
      isLoading: mockIsLoading,
      _hasHydrated: mockHasHydrated,
    };
    return selector ? selector(state) : state;
  },
}));

let mockUser: { role: UserRole } | null = null;
let mockIsAuthenticated = false;
let mockIsLoading = false;
let mockHasHydrated = false;

import { useRoleGuard } from './use-role-guard';

describe('useRoleGuard', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPathname.mockReturnValue('/dashboard/review');
    mockUser = null;
    mockIsAuthenticated = false;
    mockIsLoading = false;
    mockHasHydrated = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should redirect REPORTER from /dashboard/review to /dashboard', () => {
    mockHasHydrated = true;
    mockIsAuthenticated = true;
    mockUser = { role: UserRole.REPORTER };
    mockPathname.mockReturnValue('/dashboard/review');

    renderHook(() => useRoleGuard());

    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });

  it('should not redirect EDITOR from /dashboard/review', () => {
    mockHasHydrated = true;
    mockIsAuthenticated = true;
    mockUser = { role: UserRole.EDITOR };
    mockPathname.mockReturnValue('/dashboard/review');

    renderHook(() => useRoleGuard());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should not redirect ADMIN from /dashboard/review', () => {
    mockHasHydrated = true;
    mockIsAuthenticated = true;
    mockUser = { role: UserRole.ADMIN };
    mockPathname.mockReturnValue('/dashboard/review');

    renderHook(() => useRoleGuard());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should not redirect when route has no role restriction', () => {
    mockHasHydrated = true;
    mockIsAuthenticated = true;
    mockUser = { role: UserRole.REPORTER };
    mockPathname.mockReturnValue('/dashboard/articles');

    renderHook(() => useRoleGuard());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should not redirect while loading', () => {
    mockHasHydrated = true;
    mockIsAuthenticated = true;
    mockIsLoading = true;
    mockUser = { role: UserRole.REPORTER };
    mockPathname.mockReturnValue('/dashboard/review');

    renderHook(() => useRoleGuard());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should not redirect when not authenticated', () => {
    mockHasHydrated = true;
    mockIsAuthenticated = false;
    mockUser = null;
    mockPathname.mockReturnValue('/dashboard/review');

    renderHook(() => useRoleGuard());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should not redirect before hydration', () => {
    mockHasHydrated = false;
    mockIsAuthenticated = true;
    mockUser = { role: UserRole.REPORTER };
    mockPathname.mockReturnValue('/dashboard/review');

    renderHook(() => useRoleGuard());

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should redirect when user role is null', () => {
    mockHasHydrated = true;
    mockIsAuthenticated = true;
    mockUser = null;
    mockPathname.mockReturnValue('/dashboard/review');

    renderHook(() => useRoleGuard());

    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
  });
});
