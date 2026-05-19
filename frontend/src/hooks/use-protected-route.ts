'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';

const PUBLIC_ROUTES = ['/login', '/register'];

export function useProtectedRoute() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuthStore();
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  useEffect(() => {
    if (isLoading || !hasHydrated) return;

    const isPublic = PUBLIC_ROUTES.includes(pathname);

    if (!isAuthenticated && !isPublic) {
      router.replace('/login');
    }

    if (isAuthenticated && isPublic) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading, hasHydrated, pathname, router]);
}
