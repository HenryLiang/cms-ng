'use client';

/**
 * 「管理订阅」按钮：调用后端签发 Paddle 客户门户会话并跳转。
 * 门户由 Paddle 托管——改支付方式、取消订阅、下载发票都在那里完成。
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui';
import { createPaddlePortalSession } from '@/lib/paddle-api';
import { useToastStore } from '@/store/toast-store';

export function ManageSubscriptionButton() {
  const t = useTranslations('billing');
  const show = useToastStore((s) => s.show);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const { url } = await createPaddlePortalSession();
      window.location.href = url;
    } catch {
      show({ message: t('overview.portalError'), type: 'error' });
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" loading={loading} onClick={handleClick}>
      <CreditCard className="h-4 w-4" />
      {t('overview.manageSubscription')}
    </Button>
  );
}
