'use client';

import { useAuthStore } from '@/store/auth-store';
import { hasRequiredRole, UserRole } from '@cms-ng/shared';

interface RoleGuardProps {
  roles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ roles, children, fallback = null }: RoleGuardProps) {
  const { user } = useAuthStore();

  if (!hasRequiredRole(user?.role, roles)) {
    return fallback;
  }

  return children;
}
