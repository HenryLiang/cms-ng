'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { hasRequiredRole, UserRole } from '@cms-ng/shared';

const ROLE_ROUTE_MAP: Record<string, UserRole[]> = {
  '/dashboard/review': [UserRole.EDITOR, UserRole.ADMIN],
  // 发布到公开站是编辑/管理员职责（SUPER_ADMIN 继承 ADMIN 权限）
  '/dashboard/publish-center': [UserRole.EDITOR, UserRole.ADMIN],
  '/dashboard/settings': [UserRole.ADMIN],
  '/dashboard/accounts': [UserRole.ADMIN],
};

export function useRoleGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  useEffect(() => {
    if (isLoading || !hasHydrated || !isAuthenticated) return;

    const route = Object.keys(ROLE_ROUTE_MAP).find(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    const requiredRoles = route ? ROLE_ROUTE_MAP[route] : undefined;
    if (!requiredRoles) return;

    if (!hasRequiredRole(user?.role, requiredRoles)) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading, hasHydrated, pathname, router, user?.role]);
}
