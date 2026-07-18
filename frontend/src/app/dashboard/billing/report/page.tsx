'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  Users,
} from 'lucide-react';
import { getReport, type BillingReport } from '@/lib/billing-api';
import { Card, PageHeader } from '@/components/ui';

const typeLabels: Record<string, string> = {
  TOP_UP: '充值',
  AI_LLM: 'AI调用',
  AI_IMAGE: '图片生成',
  PUBLISH: '发布',
  AUTO_PUBLISH: '自动发布',
  REFUND: '退款',
  ADJUSTMENT: '调整',
};

const categoryLabels: Record<string, string> = {
  AI: 'AI 服务',
  PUBLISHING: '发布服务',
  OTHER: '其他',
};

function getDefaultDates() {
  const end = new Date();
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export default function ReportPage() {
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [report, setReport] = useState<BillingReport | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadReport() {
    setLoading(true);
    try {
      const data = await getReport({ startDate, endDate });
      setReport(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount: loadReport 内 setLoading(true) 同步触发,React 19 规则对此过严
    loadReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount/过滤变更触发,刻意不把 loadX 入 deps 避免重复请求
  }, [startDate, endDate]);

  // Calculate max value for bar chart scaling
  function getMaxValue(obj: Record<string, number>): number {
    const values = Object.values(obj);
    return values.length > 0 ? Math.max(...values) : 1;
  }

  return (
    <div className="h-full p-8">
      <PageHeader
        title="消费报表"
        subtitle="查看平台消费统计和用户消费排行"
      />

      {/* Date Range Picker */}
      <Card className="mb-6 p-4">
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
        </div>
      ) : !report ? (
        <div className="rounded-lg border border-dashed border-line-strong p-12 text-center">
          <p className="text-muted">暂无数据</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-muted">总收入</span>
              </div>
              <div className="tnum text-2xl font-semibold text-emerald-600">
                ¥{report.totalRevenue.toFixed(2)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <span className="text-xs text-muted">总消费</span>
              </div>
              <div className="tnum text-2xl font-semibold text-red-600">
                ¥{report.totalConsumption.toFixed(2)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted">净变化</span>
              </div>
              <div
                className={`tnum text-2xl font-semibold ${
                  report.netChange >= 0 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {report.netChange >= 0 ? '+' : ''}¥{report.netChange.toFixed(2)}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Category Breakdown */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-muted" />
                <h2 className="text-sm font-semibold text-foreground">分类消费</h2>
              </div>

              {Object.keys(report.byCategory).length === 0 ? (
                <p className="text-sm text-muted">暂无数据</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(report.byCategory)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cat, amount]) => {
                      const max = getMaxValue(report.byCategory);
                      const pct = (amount / max) * 100;
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-foreground">
                              {categoryLabels[cat] || cat}
                            </span>
                            <span className="tnum text-sm font-medium text-foreground">
                              ¥{amount.toFixed(2)}
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-surface-muted">
                            <div
                              className="brand-gradient h-2 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Type breakdown sub-section */}
              {Object.keys(report.byType).length > 0 && (
                <div className="mt-6 pt-4 border-t border-line">
                  <p className="text-xs font-medium text-muted mb-3">按类型明细</p>
                  <div className="space-y-2">
                    {Object.entries(report.byType)
                      .sort(([, a], [, b]) => b - a)
                      .map(([type, amount]) => (
                        <div key={type} className="flex items-center justify-between">
                          <span className="text-xs text-muted">
                            {typeLabels[type] || type}
                          </span>
                          <span className="tnum text-xs font-medium text-foreground">
                            ¥{amount.toFixed(2)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Top Users */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-4 w-4 text-muted" />
                <h2 className="text-sm font-semibold text-foreground">消费排行 Top 10</h2>
              </div>

              {report.topUsers.length === 0 ? (
                <p className="text-sm text-muted">暂无数据</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-subtle">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">用户名</th>
                      <th className="pb-2 font-medium text-right">消费金额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {report.topUsers.map((u, idx) => (
                      <tr key={u.userId} className="transition hover:bg-surface-muted/50">
                        <td className="tnum py-2 text-muted">{idx + 1}</td>
                        <td className="py-2 text-foreground">{u.userName}</td>
                        <td className="tnum py-2 text-right font-medium text-foreground">
                          ¥{u.totalSpent.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
