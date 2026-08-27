'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Languages, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_LABELS, type Locale } from '@/i18n/config';
import { useAuthStore } from '@/store/auth-store';
import { updateUser } from '@/lib/users-api';

/**
 * 界面语言切换器:写 NEXT_LOCALE cookie 后整页刷新。
 * 无 URL 路由模式下 location.reload() 是最可靠的切换方式
 * (服务端 layout/根 metadata 都依赖 cookie 渲染)。
 */
export default function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const t = useTranslations('components');
  const [open, setOpen] = useState(false);
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((state) => state.user);
  const fetchUser = useAuthStore((state) => state.fetchUser);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (!pendingLocale || pendingLocale === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${pendingLocale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    location.reload();
  }, [pendingLocale, locale]);

  async function switchTo(next: Locale) {
    if (next === locale) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      if (user) {
        await updateUser(user.id, { displayLanguage: next });
        await fetchUser();
      }
      setPendingLocale(next);
    } catch {
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        aria-label={t('localeSwitcher.label')}
        title={t('localeSwitcher.label')}
        className={`flex items-center gap-1.5 rounded-lg border border-line text-muted transition-colors hover:bg-surface-muted hover:text-foreground ${
          compact ? 'h-8 px-2 text-xs' : 'h-9 px-2.5 text-sm'
        }`}
      >
        <Languages className="h-4 w-4" />
        <span>{LOCALE_LABELS[locale as Locale] ?? locale}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-36 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => void switchTo(l)}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-muted ${
                l === locale ? 'text-foreground' : 'text-muted'
              }`}
            >
              {LOCALE_LABELS[l]}
              {l === locale && <Check className="h-3.5 w-3.5 text-cyan-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
