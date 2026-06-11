'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Loader2 } from 'lucide-react';
import { getBalance, type BalanceInfo, type BillingTransaction } from '@/lib/billing-api';

function formatCurrency(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function TransactionIcon({ type }: { type: string }) {
  if (type === 'TOP_UP' || type === 'REFUND' || type === 'BONUS') {
    return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  }
  return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
}

function TransactionAmount({ amount, type }: { amount: number; type: string }) {
  const isPositive = type === 'TOP_UP' || type === 'REFUND' || type === 'BONUS';
  return (
    <span className={`text-sm font-medium ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
      {isPositive ? '+' : '-'}{formatCurrency(Math.abs(amount))}
    </span>
  );
}

export default function BalanceCard() {
  const [info, setInfo] = useState<BalanceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      try {
        const data = await getBalance();
        if (!cancelled) setInfo(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-red-500">{error ?? '无法加载余额信息'}</p>
      </div>
    );
  }

  const isLowBalance = info.alertThreshold !== null && info.balance < info.alertThreshold;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-zinc-600" />
          <span className="text-sm font-medium text-zinc-900">账户余额</span>
        </div>
        <Link
          href="/dashboard/billing/top-up"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 transition-colors"
        >
          充值
        </Link>
      </div>

      {/* Balance */}
      <div className="mb-4">
        <div className="text-3xl font-bold text-zinc-900">{formatCurrency(info.balance)}</div>
        {isLowBalance && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>余额低于预警阈值 {formatCurrency(info.alertThreshold!)}</span>
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      {info.recentTransactions.length > 0 && (
        <div className="border-t border-zinc-100 pt-3">
          <p className="mb-2 text-xs font-medium text-zinc-500">最近交易</p>
          <div className="space-y-2">
            {info.recentTransactions.slice(0, 3).map((tx: BillingTransaction) => (
              <div key={tx.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <TransactionIcon type={tx.type} />
                  <span className="truncate text-sm text-zinc-600">{tx.description}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <TransactionAmount amount={tx.amount} type={tx.type} />
                  <span className="text-xs text-zinc-400">{formatDate(tx.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
