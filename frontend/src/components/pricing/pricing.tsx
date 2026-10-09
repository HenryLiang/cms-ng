'use client';

/**
 * 三档订阅定价卡片：
 * - PricePreview 展示按国家本地化的价格（含 GB/IE/AU 区域覆盖）
 * - 月付/年付切换
 * - Subscribe 打开 Paddle Checkout overlay（one-page），成功后跳转 /welcome
 */
import { useEffect, useState } from 'react';
import type { Paddle } from '@paddle/paddle-js';
import { Check, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PricingTiers, type Tier } from '@/constants/pricing-tiers';
import { usePaddlePrices } from '@/hooks/use-paddle-prices';
import { initPaddle } from '@/lib/paddle';
import { useAuthStore } from '@/store/auth-store';
import { Button, Card } from '@/components/ui';

type Frequency = 'month' | 'year';

interface PricingProps {
  /** 服务端从 x-vercel-ip-country 等请求头解析出的国家码；缺省时交给 Paddle 按 IP 识别 */
  country?: string;
}

export function Pricing({ country }: PricingProps) {
  const t = useTranslations('pricing');
  const [frequency, setFrequency] = useState<Frequency>('month');
  const [paddle, setPaddle] = useState<Paddle | undefined>();
  const [initError, setInitError] = useState<string | null>(null);

  const { prices, loading, error: previewError } = usePaddlePrices(
    paddle,
    country,
  );

  useEffect(() => {
    let cancelled = false;
    initPaddle()
      .then((p) => {
        if (!cancelled && p) setPaddle(p);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setInitError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSubscribe(tier: Tier) {
    if (!paddle) return;
    // 登录用户预填邮箱（auth 是客户端 JWT，点击时从 store 取最新值）
    const email = useAuthStore.getState().user?.email;
    paddle.Checkout.open({
      items: [{ priceId: tier.priceId[frequency], quantity: 1 }],
      ...(email && { customer: { email } }),
      settings: {
        displayMode: 'overlay',
        variant: 'one-page',
        successUrl: `${window.location.origin}/welcome`,
      },
    });
  }

  if (initError) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        {initError}
      </div>
    );
  }

  return (
    <div>
      {/* 月付/年付切换 */}
      <div className="mb-10 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setFrequency('month')}
          className={`rounded-full px-5 py-2 text-sm font-medium transition ${
            frequency === 'month'
              ? 'brand-gradient-strong text-white shadow-sm'
              : 'bg-surface-muted text-muted hover:text-foreground'
          }`}
        >
          {t('monthly')}
        </button>
        <button
          type="button"
          onClick={() => setFrequency('year')}
          className={`rounded-full px-5 py-2 text-sm font-medium transition ${
            frequency === 'year'
              ? 'brand-gradient-strong text-white shadow-sm'
              : 'bg-surface-muted text-muted hover:text-foreground'
          }`}
        >
          {t('yearly')}
        </button>
      </div>

      {previewError && (
        <p className="mb-6 text-center text-sm text-red-600 dark:text-red-400">
          {t('previewFailed')}: {previewError}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {PricingTiers.map((tier) => {
          const priceId = tier.priceId[frequency];
          const formatted = prices[priceId];
          const isPro = tier.name === 'Pro';
          return (
            <Card
              key={tier.name}
              className={`relative flex flex-col p-6 ${
                isPro ? 'border-brand shadow-lg ring-1 ring-brand/40' : ''
              }`}
            >
              {isPro && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full brand-gradient-strong px-3 py-1 text-xs font-semibold text-white">
                  {t('mostPopular')}
                </span>
              )}
              <h3 className="text-lg font-semibold text-foreground">
                {tier.name}
              </h3>
              <p className="mt-1 text-sm text-muted">{tier.description}</p>

              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground">
                  {loading || !formatted ? (
                    <Loader2 className="inline h-6 w-6 animate-spin text-muted" />
                  ) : (
                    formatted
                  )}
                </span>
                <span className="text-sm text-muted">
                  /{t(frequency === 'month' ? 'perMonth' : 'perYear')}
                </span>
              </p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-foreground"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                className="mt-6 w-full"
                variant={isPro ? 'primary' : 'secondary'}
                disabled={!paddle}
                onClick={() => handleSubscribe(tier)}
              >
                {t('subscribe')}
              </Button>
            </Card>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted">{t('trialNote')}</p>
    </div>
  );
}
