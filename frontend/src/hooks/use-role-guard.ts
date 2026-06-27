'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { UserRole } from '@cms-ng/shared';

const ROLE_ROUTE_MAP: Record<string, UserRole[]> = {
  '/dashboard/review': [UserRole.EDITOR, UserRole.ADMIN],
  '/dashboard/settings': [UserRole.ADMIN],
};

export function useRoleGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  useEffect(() => {
    if (isLoading || !hasHydrated || !isAuthenticated) return;

    const requiredRoles = ROLE_ROUTE_MAP[pathname];
    if (!requiredRoles) return;

    if (!user?.role || !requiredRoles.includes(user.role as UserRole)) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading, hasHydrated, pathname, router, user?.role]);
}
