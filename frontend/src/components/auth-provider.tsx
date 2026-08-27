'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuthStore } from '@/store/auth-store';
import { getLanguageSettings } from '@/lib/language-settings-api';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/i18n/config';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);
  const locale = useLocale();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (!hasHydrated || (isAuthenticated && !user)) return;
    let cancelled = false;

    const sync = async () => {
      const effective =
        user?.displayLanguage ?? (await getLanguageSettings()).displayLanguage;
      if (cancelled || effective === locale) return;
      document.cookie = `${LOCALE_COOKIE}=${effective}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
      location.reload();
    };

    void sync().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hasHydrated, isAuthenticated, locale, user]);

  return <>{children}</>;
}
