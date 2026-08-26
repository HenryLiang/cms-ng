'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { CreditCard, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { estimateCost, type CostEstimate } from '@/lib/billing-api';
import { Badge, Card } from '@/components/ui';

interface CostEstimatorProps {
  operationType: string;
  platforms?: string[];
  estimatedTokens?: number;
  batchSize?: number;
  articleId?: string;
}

function formatCurrency(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

export default function CostEstimator({
  operationType,
  platforms,
  estimatedTokens,
  batchSize,
  articleId,
}: CostEstimatorProps) {
  const t = useTranslations('billing.costEstimator');
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Serialize props to detect meaningful changes without triggering on reference identity
  const paramsKey = JSON.stringify({ operationType, platforms, estimatedTokens, batchSize, articleId });
  const prevKeyRef = useRef(paramsKey);

  useEffect(() => {
    // Skip the initial double-render if key hasn't changed
    if (prevKeyRef.current === paramsKey && estimate !== null) return;
    prevKeyRef.current = paramsKey;

    let cancelled = false;
    async function fetch() {
      setLoading(true);
      setError(null);
      try {
        const data = await estimateCost({
          operationType,
          platforms,
          estimatedTokens,
          batchSize,
          articleId,
        });
        if (!cancelled) setEstimate(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('estimateFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount/过滤变更触发,刻意不把 loadX 入 deps 避免重复请求
  }, [paramsKey]);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
          <span>{t('estimating')}</span>
        </div>
      </Card>
    );
  }

  if (error || !estimate) {
    return (
      <Card className="p-4">
        <p className="text-sm text-red-500">{error ?? t('unavailable')}</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted" />
          <span className="text-sm font-medium text-foreground">{t('title')}</span>
        </div>
        {estimate.sufficientBalance ? (
          <Badge tone="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {t('sufficient')}
          </Badge>
        ) : (
          <Badge tone="danger" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {t('insufficient')}
          </Badge>
        )}
      </div>

      {/* Breakdown Table */}
      {estimate.breakdown.length > 0 && (
        <table className="mb-3 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="pb-1.5 font-medium">{t('item')}</th>
              <th className="pb-1.5 text-right font-medium">{t('quantity')}</th>
              <th className="pb-1.5 text-right font-medium">{t('unitPrice')}</th>
              <th className="pb-1.5 text-right font-medium">{t('subtotal')}</th>
            </tr>
          </thead>
          <tbody>
            {estimate.breakdown.map((item, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="py-1.5 text-foreground">{item.item}</td>
                <td className="py-1.5 text-right text-muted">{item.quantity}</td>
                <td className="py-1.5 text-right text-muted">{formatCurrency(item.unitPrice)}</td>
                <td className="py-1.5 text-right text-foreground">{formatCurrency(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Total */}
      <div className="flex items-center justify-between border-t border-line pt-2">
        <span className="text-sm text-muted">
          {t('currentBalance', { balance: formatCurrency(estimate.currentBalance) })}
        </span>
        <span className="text-sm font-bold text-foreground">
          {t('estimatedCost', { cost: formatCurrency(estimate.estimatedCost) })}
        </span>
      </div>
    </Card>
  );
}
