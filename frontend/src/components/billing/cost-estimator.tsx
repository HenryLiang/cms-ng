'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, CreditCard, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { estimateCost, type CostEstimate } from '@/lib/billing-api';

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
        if (!cancelled) setError(err instanceof Error ? err.message : '费用估算失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [paramsKey]);

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>正在估算费用…</span>
        </div>
      </div>
    );
  }

  if (error || !estimate) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-red-500">{error ?? '无法获取费用估算'}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-zinc-600" />
          <span className="text-sm font-medium text-zinc-900">费用预估</span>
        </div>
        {estimate.sufficientBalance ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            余额充足
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
            <AlertTriangle className="h-3 w-3" />
            余额不足
          </span>
        )}
      </div>

      {/* Breakdown Table */}
      {estimate.breakdown.length > 0 && (
        <table className="mb-3 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
              <th className="pb-1.5 font-medium">项目</th>
              <th className="pb-1.5 text-right font-medium">数量</th>
              <th className="pb-1.5 text-right font-medium">单价</th>
              <th className="pb-1.5 text-right font-medium">小计</th>
            </tr>
          </thead>
          <tbody>
            {estimate.breakdown.map((item, i) => (
              <tr key={i} className="border-b border-zinc-50 last:border-0">
                <td className="py-1.5 text-zinc-700">{item.item}</td>
                <td className="py-1.5 text-right text-zinc-600">{item.quantity}</td>
                <td className="py-1.5 text-right text-zinc-600">{formatCurrency(item.unitPrice)}</td>
                <td className="py-1.5 text-right text-zinc-900">{formatCurrency(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Total */}
      <div className="flex items-center justify-between border-t border-zinc-200 pt-2">
        <span className="text-sm text-zinc-500">
          当前余额 {formatCurrency(estimate.currentBalance)}
        </span>
        <span className="text-sm font-bold text-zinc-900">
          预估费用 {formatCurrency(estimate.estimatedCost)}
        </span>
      </div>
    </div>
  );
}
