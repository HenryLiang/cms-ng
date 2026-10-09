/**
 * 公开定价页 /pricing。
 * 服务端读取 CDN 地理位置请求头（Vercel: x-vercel-ip-country），
 * 没有该头时不传国家码，由 Paddle 按访问者 IP 自动识别。
 */
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { Pricing } from '@/components/pricing/pricing';

export default async function PricingPage() {
  const h = await headers();
  const country = h.get('x-vercel-ip-country') ?? undefined;
  const t = await getTranslations('pricing');

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-16">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-3 text-muted">{t('subtitle')}</p>
      </header>
      <Pricing country={country} />
    </main>
  );
}
