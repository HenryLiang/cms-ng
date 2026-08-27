'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/store/auth-store';
import { Mail, Lock, Lightbulb, Wand2, Zap, LogIn } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import LocaleSwitcher from '@/components/locale-switcher';
import BrandLogo from '@/components/brand-logo';
import { useBrandStore } from '@/store/brand-store';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const t = useTranslations('auth');
  const brand = useBrandStore((state) => state.brand);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      const apiMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : undefined;
      setError(apiMsg || t('login.errorFallback'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* 语言切换(右上角固定) */}
      <div className="fixed right-4 top-4 z-50">
        <LocaleSwitcher />
      </div>
      {/* 左：品牌面板 */}
      <div className="glow-panel relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="grid-overlay absolute inset-0 opacity-60" />
        <div className="relative flex items-center gap-3">
          <BrandLogo className="h-10 w-10" />
          <span className="text-lg font-semibold text-white">{brand.name}</span>
        </div>

        <div className="relative">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            {t('login.badge')}
          </div>
          <h2 className="text-3xl font-semibold leading-tight text-white">
            {t('login.headline')}
            <br />
            <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              {t('login.headlineAccent')}
            </span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-sidebar-muted">
            {t('login.description')}
          </p>
          <div className="mt-8 space-y-3">
            <div className="flex items-center gap-3 text-sm text-sidebar-text">
              <Lightbulb className="h-4 w-4 text-cyan-400" /> {t('brand.features.trends')}
            </div>
            <div className="flex items-center gap-3 text-sm text-sidebar-text">
              <Wand2 className="h-4 w-4 text-cyan-400" /> {t('brand.features.rewrite')}
            </div>
            <div className="flex items-center gap-3 text-sm text-sidebar-text">
              <Zap className="h-4 w-4 text-cyan-400" /> {t('brand.features.publish')}
            </div>
          </div>
        </div>

        <div className="relative text-[11px] text-sidebar-muted">
          © 2026 {brand.name} · AI CONTENT OS
        </div>
      </div>

      {/* 右：表单 */}
      <div className="flex w-full flex-col justify-center bg-canvas p-8 lg:w-1/2">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLogo className="mb-4 h-10 w-10" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('login.title')}</h1>
          <p className="mt-2 text-sm text-muted">{t('login.subtitle')}</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('form.email')}</label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                leftIcon={<Mail className="h-4 w-4" />}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{t('form.password')}</label>
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                leftIcon={<Lock className="h-4 w-4" />}
              />
            </div>

            <Button type="submit" loading={isSubmitting} className="w-full">
              <LogIn className="h-4 w-4" />
              {t('login.submit')}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {t('login.noAccount')}{' '}
            <Link href="/register" className="font-medium text-brand hover:underline">
              {t('login.registerLink')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
