'use client';

import { useAuthStore } from '@/store/auth-store';
import { UserRole } from '@cms-ng/shared';

interface RoleGuardProps {
  roles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ roles, children, fallback = null }: RoleGuardProps) {
  const { user } = useAuthStore();

  if (!user?.role || !roles.includes(user.role as UserRole)) {
    return fallback;
  }

  return children;
}
