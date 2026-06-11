'use client';

import { useState, useEffect } from 'react';
import { Loader2, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getTransactions,
  type BillingTransaction,
  type TransactionSummary,
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

const typeOptions = [
  { value: '', label: '全部' },
  { value: 'AI_LLM', label: 'AI调用' },
  { value: 'AI_IMAGE', label: '图片生成' },
  { value: 'PUBLISH', label: '发布' },
  { value: 'AUTO_PUBLISH', label: '自动发布' },
  { value: 'TOP_UP', label: '充值' },
  { value: 'REFUND', label: '退款' },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadData();
  }, [page, typeFilter, startDate, endDate]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await getTransactions({
        page,
        pageSize,
        type: typeFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setTransactions(data.data);
      setSummary(data.summary);
      setTotal(data.meta.total);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="h-full p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">消费记录</h1>
        <p className="mt-1 text-sm text-zinc-500">查看所有交易流水和消费明细</p>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">总支出</p>
            <p className="mt-1 text-xl font-semibold text-red-600">
              ¥{summary.totalSpent.toFixed(2)}
            </p>
          </div>
          {Object.entries(summary.byCategory).map(([cat, amount]) => (
            <div key={cat} className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500">
                {cat === 'AI' ? 'AI 消费' : cat === 'PUBLISHING' ? '发布消费' : '其他'}
              </p>
              <p className="mt-1 text-xl font-semibold text-zinc-900">
                ¥{amount.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">类型</label>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          >
            {typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">开始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">结束日期</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-12 text-center">
            <p className="text-zinc-500">暂无数据</p>
          </div>
        ) : (
          <>
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

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-3">
              <p className="text-xs text-zinc-500">
                共 {total} 条，第 {page}/{totalPages} 页
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  <ChevronLeft className="h-3 w-3" />
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  下一页
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
