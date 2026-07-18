'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Wallet,
  TrendingDown,
  ArrowRight,
  CreditCard,
  Receipt,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import BalanceCard from '@/components/billing/balance-card';
import {
  getBalance,
  getTransactions,
  type BalanceInfo,
  type BillingTransaction,
} from '@/lib/billing-api';
import { Badge, Card, PageHeader } from '@/components/ui';

const typeLabels: Record<string, string> = {
  TOP_UP: '充值',
  AI_LLM: 'AI调用',
  AI_IMAGE: '图片生成',
  PUBLISH: '发布',
  AUTO_PUBLISH: '自动发布',
  REFUND: '退款',
  ADJUSTMENT: '调整',
};


function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const paymentResult = searchParams.get('payment'); // 'success' | 'failed' | null
  const tradeStatus = searchParams.get('trade_status');
  const outTradeNo = searchParams.get('out_trade_no');
  const showPaymentBanner = paymentResult === 'success' || paymentResult === 'failed'
    || (outTradeNo && tradeStatus);

  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed' | 'pending' | null>(null);

  // 解析支付宝 return URL 的查询参数,判定支付结果显示横幅
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- 从 URL 查询参数同步支付状态,React 19 规则对此过严 */
    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED' || paymentResult === 'success') {
      setPaymentStatus('success');
    } else if (paymentResult === 'failed' || (outTradeNo && tradeStatus && tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED' && tradeStatus !== 'WAIT_BUYER_PAY')) {
      setPaymentStatus('failed');
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [paymentResult, tradeStatus, outTradeNo]);

  const loadData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 支付成功后自动刷新余额(支付宝回调可能延迟 1-3 秒)
  useEffect(() => {
    if (paymentStatus === 'success') {
      const timer = setTimeout(() => loadData(), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [paymentStatus, loadData]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
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
      <PageHeader
        title="计费中心"
        subtitle="管理账户余额、查看消费记录和充值历史"
      />

      {/* 支付宝支付返回横幅 */}
      {showPaymentBanner && paymentStatus === 'success' && (
        <div
          data-testid="payment-return-banner"
          className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-900">支付成功！</p>
            <p className="mt-0.5 text-xs text-emerald-700">
              积分将在 1-3 秒内到账。
              {outTradeNo && <span className="ml-1 text-emerald-600">订单号: {outTradeNo}</span>}
            </p>
          </div>
        </div>
      )}
      {showPaymentBanner && paymentStatus === 'failed' && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900">支付未完成</p>
            <p className="mt-0.5 text-xs text-amber-700">
              {tradeStatus && tradeStatus !== 'WAIT_BUYER_PAY'
                ? `交易状态: ${tradeStatus}`
                : '请重新发起充值或联系客服。'}
              {outTradeNo && <span className="ml-1 text-amber-600">订单号: {outTradeNo}</span>}
            </p>
          </div>
        </div>
      )}

      {/* Balance Card */}
      <div className="mb-8 max-w-md">
        <BalanceCard />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="text-xs text-muted">本月消费</span>
          </div>
          <div className="tnum text-2xl font-semibold text-foreground">
            ¥{monthSpent.toFixed(2)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-muted">充值总额</span>
          </div>
          <div className="tnum text-2xl font-semibold text-foreground">
            ¥{totalTopUps.toFixed(2)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted">当前余额</span>
          </div>
          <div className="tnum text-2xl font-semibold text-foreground">
            ¥{(balance?.balance ?? 0).toFixed(2)}
          </div>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-foreground">最近交易</h2>
          </div>
          <Link
            href="/dashboard/billing/transactions"
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            查看全部
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {transactions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted">暂无数据</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-subtle">
                <th className="px-6 py-3 font-medium">时间</th>
                <th className="px-6 py-3 font-medium">类型</th>
                <th className="px-6 py-3 font-medium">描述</th>
                <th className="px-6 py-3 font-medium text-right">金额</th>
                <th className="px-6 py-3 font-medium text-right">余额</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {transactions.map((tx) => (
                <tr key={tx.id} className="transition hover:bg-surface-muted/50">
                  <td className="tnum px-6 py-3 text-muted">{formatDate(tx.createdAt)}</td>
                  <td className="px-6 py-3">
                    <Badge tone="neutral">
                      {typeLabels[tx.type] || tx.type}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-foreground">{tx.description}</td>
                  <td className="tnum px-6 py-3 text-right">
                    <span
                      className={`font-medium ${
                        tx.amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {tx.amount >= 0 ? '+' : '-'}¥{Math.abs(tx.amount).toFixed(2)}
                    </span>
                  </td>
                  <td className="tnum px-6 py-3 text-right text-muted">
                    ¥{tx.balanceAfter.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
