'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  getTransactions,
  type BillingTransaction,
  type TransactionSummary,
} from '@/lib/billing-api';
import { getTransactionTypeLabel } from '@/lib/transaction-labels';
import { Badge, Button, Card, PageHeader } from '@/components/ui';

const TYPE_OPTION_KEYS: { value: string; key: string }[] = [
  { value: '', key: 'all' },
  { value: 'AI_LLM', key: 'AI_LLM' },
  { value: 'AI_IMAGE', key: 'AI_IMAGE' },
  { value: 'PUBLISH', key: 'PUBLISH' },
  { value: 'AUTO_PUBLISH', key: 'AUTO_PUBLISH' },
  { value: 'TOP_UP', key: 'TOP_UP' },
  { value: 'REFUND', key: 'REFUND' },
];

function formatDate(dateStr: string, locale: string): string {
  return new Date(dateStr).toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TransactionsPage() {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const locale = useLocale();
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount: loadData sets loading synchronously, React 19 rule is overly strict
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount/filter change trigger, intentionally omitting loadData from deps to avoid duplicate requests
  }, [page, typeFilter, startDate, endDate]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="h-full p-8">
      <PageHeader
        title={t('transactions.title')}
        subtitle={t('transactions.subtitle')}
      />

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-xs text-muted">{t('transactions.totalSpent')}</p>
            <p className="tnum mt-1 text-xl font-semibold text-red-600">
              ¥{summary.totalSpent.toFixed(2)}
            </p>
          </Card>
          {Object.entries(summary.byCategory).map(([cat, amount]) => (
            <Card key={cat} className="p-4">
              <p className="text-xs text-muted">
                {t(`shared.categoryLabels.${cat}`)}
              </p>
              <p className="tnum mt-1 text-xl font-semibold text-foreground">
                ¥{amount.toFixed(2)}
              </p>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">{t('shared.table.type')}</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            >
              {TYPE_OPTION_KEYS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(`transactions.typeOptions.${opt.key}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">{t('shared.startDate')}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">{t('shared.endDate')}</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="m-4 rounded-lg border border-dashed border-line-strong p-12 text-center">
            <p className="text-muted">{tCommon('state.empty')}</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-subtle">
                  <th className="px-6 py-3 font-medium">{t('shared.table.time')}</th>
                  <th className="px-6 py-3 font-medium">{t('shared.table.type')}</th>
                  <th className="px-6 py-3 font-medium">{t('shared.table.description')}</th>
                  <th className="px-6 py-3 font-medium text-right">{t('shared.table.amount')}</th>
                  <th className="px-6 py-3 font-medium text-right">{t('shared.table.balance')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="transition hover:bg-surface-muted/50">
                    <td className="tnum px-6 py-3 text-muted">{formatDate(tx.createdAt, locale)}</td>
                    <td className="px-6 py-3">
                      <Badge tone="neutral">
                        {getTransactionTypeLabel(tx.type)}
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

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-line px-6 py-3">
              <p className="tnum text-xs text-muted">
                {t('transactions.pageInfo', { total, page, totalPages })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-3 w-3" />
                  {tCommon('pagination.prev')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  {tCommon('pagination.next')}
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
