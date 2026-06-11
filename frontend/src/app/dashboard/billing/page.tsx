'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Wallet,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  CreditCard,
  Receipt,
} from 'lucide-react';
import BalanceCard from '@/components/billing/balance-card';
import {
  getBalance,
  getTransactions,
  type BalanceInfo,
  type BillingTransaction,
} from '@/lib/billing-api';

const typeLabels: Record<string, string> = {
  TOP_UP: '充值',
  AI_LLM: 'AI调用',
  AI_IMAGE: '图片生成',
  PUBLISH: '发布',
  AUTO_PUBLISH: '自动发布',
  REFUND: '退款',
  ADJUSTMENT: '调整',
};

function formatCurrency(amount: number): string {
  return `¥${Math.abs(amount).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BillingPage() {
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [balanceData, txData] = await Promise.all([
        getBalance(),
        getTransactions({ pageSize: 10 }),
      ]);
      setBalance(balanceData);
      setTransactions(txData.data);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  // Calculate stats from transactions
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  let monthSpent = 0;
  let totalTopUps = 0;

  for (const tx of transactions) {
    const d = new Date(tx.createdAt);
    if (tx.amount < 0 && d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
      monthSpent += Math.abs(tx.amount);
    }
    if (tx.type === 'TOP_UP' && tx.amount > 0) {
      totalTopUps += tx.amount;
    }
  }

  return (
    <div className="h-full p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">计费中心</h1>
        <p className="mt-1 text-sm text-zinc-500">管理账户余额、查看消费记录和充值历史</p>
      </div>

      {/* Balance Card */}
      <div className="mb-8 max-w-md">
        <BalanceCard />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="text-xs text-zinc-500">本月消费</span>
          </div>
          <div className="text-2xl font-semibold text-zinc-900">
            ¥{monthSpent.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-zinc-500">充值总额</span>
          </div>
          <div className="text-2xl font-semibold text-zinc-900">
            ¥{totalTopUps.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-zinc-500">当前余额</span>
          </div>
          <div className="text-2xl font-semibold text-zinc-900">
            ¥{(balance?.balance ?? 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-900">最近交易</h2>
          </div>
          <Link
            href="/dashboard/billing/transactions"
            className="flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
          >
            查看全部
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {transactions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-zinc-500">暂无数据</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                <th className="px-6 py-3 font-medium">时间</th>
                <th className="px-6 py-3 font-medium">类型</th>
                <th className="px-6 py-3 font-medium">描述</th>
                <th className="px-6 py-3 font-medium text-right">金额</th>
                <th className="px-6 py-3 font-medium text-right">余额</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-6 py-3 text-zinc-500">{formatDate(tx.createdAt)}</td>
                  <td className="px-6 py-3">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                      {typeLabels[tx.type] || tx.type}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-zinc-700">{tx.description}</td>
                  <td className="px-6 py-3 text-right">
                    <span
                      className={`font-medium ${
                        tx.amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {tx.amount >= 0 ? '+' : '-'}¥{Math.abs(tx.amount).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-zinc-500">
                    ¥{tx.balanceAfter.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
