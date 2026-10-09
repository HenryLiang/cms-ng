/**
 * 订阅成功落地页 /welcome（Paddle Checkout 的 successUrl）。
 * 仅作 UX 展示——订阅开通以后端 webhook 为准，不要在这里做权益发放。
 */
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CheckCircle2 } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';

export default async function WelcomePage() {
  const t = await getTranslations('pricing');

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
        <h1 className="mt-6 text-3xl font-bold text-foreground">
          {t('welcomeTitle')}
        </h1>
        <p className="mt-3 text-muted">{t('welcomeSubtitle')}</p>
        <Link
          href="/dashboard"
          className={buttonClasses({ className: 'mt-8 w-full' })}
        >
          {t('goToDashboard')}
        </Link>
      </div>
    </main>
  );
}
