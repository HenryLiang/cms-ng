'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { getBalance } from '@/lib/billing-api';

export default function LowBalanceBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      try {
        const info = await getBalance();
        if (!cancelled) {
          setBalance(info.balance);
          setThreshold(info.alertThreshold);
        }
      } catch {
        // Silently fail — banner just won't show
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, []);

  if (loading || dismissed) return null;
  if (threshold === null || balance === null || balance >= threshold) return null;

  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-orange-600" />
        <span className="text-sm text-orange-800">
          <span className="font-medium">余额不足</span>
          <span className="mx-1.5">·</span>
          <span>当前余额 ¥{balance.toFixed(2)}，低于预警阈值 ¥{threshold.toFixed(2)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/dashboard/billing/top-up"
          className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 transition-colors"
        >
          立即充值
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="text-orange-400 hover:text-orange-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
