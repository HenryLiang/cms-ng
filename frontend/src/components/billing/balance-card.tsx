'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { getBalance, type BalanceInfo, type BillingTransaction } from '@/lib/billing-api';
import { Card, buttonClasses } from '@/components/ui';

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
      <Card className="p-4">
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
        </div>
      </Card>
    );
  }

  if (error || !info) {
    return (
      <Card className="p-4">
        <p className="text-sm text-red-500">{error ?? '无法加载余额信息'}</p>
      </Card>
    );
  }

  const isLowBalance = info.alertThreshold !== null && info.balance < info.alertThreshold;

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-muted" />
          <span className="text-sm font-medium text-foreground">账户余额</span>
        </div>
        <Link
          href="/dashboard/billing/top-up"
          className={buttonClasses({ variant: 'primary', size: 'sm' })}
        >
          充值
        </Link>
      </div>

      {/* Balance */}
      <div className="mb-4">
        <div className="text-3xl font-bold text-foreground">{formatCurrency(info.balance)}</div>
        {isLowBalance && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>余额低于预警阈值 {formatCurrency(info.alertThreshold!)}</span>
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      {info.recentTransactions.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="mb-2 text-xs font-medium text-muted">最近交易</p>
          <div className="space-y-2">
            {info.recentTransactions.slice(0, 3).map((tx: BillingTransaction) => (
              <div key={tx.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <TransactionIcon type={tx.type} />
                  <span className="truncate text-sm text-muted">{tx.description}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <TransactionAmount amount={tx.amount} type={tx.type} />
                  <span className="text-xs text-subtle">{formatDate(tx.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
