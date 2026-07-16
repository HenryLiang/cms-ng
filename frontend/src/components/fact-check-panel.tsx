import { X, ShieldCheck } from 'lucide-react';
import type { FactCheckResult } from '@/lib/article-api';

interface FactCheckPanelProps {
  result: FactCheckResult;
  onClose: () => void;
}

export default function FactCheckPanel({ result, onClose }: FactCheckPanelProps) {
  // 评分色（测试断言这些类，保留）
  const scoreColor =
    result.score >= 80 ? 'text-emerald-600' :
    result.score >= 50 ? 'text-amber-600' : 'text-red-600';

  const severityLabel = (s: string) =>
    s === 'critical' ? '严重' : s === 'warning' ? '警告' : '提示';

  // 严重度徽章色（测试断言这些类，保留）
  const severityBadgeClass = (s: string) =>
    s === 'critical' ? 'bg-red-50 text-red-700' :
    s === 'warning' ? 'bg-amber-50 text-amber-700' :
    'bg-blue-50 text-blue-700';

  const typeLabel = (t: string) => {
    const map: Record<string, string> = {
      fact: '事实',
      inconsistency: '不一致',
      dispute: '争议',
      source_needed: '需核实',
      risk: '风险',
    };
    return map[t] ?? t;
  };

  return (
    <div className="overflow-hidden rounded-lg border border-amber-200 bg-surface">
      <div className="flex items-center justify-between border-b border-amber-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium text-foreground">事实核查报告</span>
        </div>
        <button onClick={onClose} className="text-subtle transition-colors hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-80 space-y-3 overflow-auto p-3">
        <div className="flex items-center gap-3">
          <div className={`text-2xl font-bold ${scoreColor}`}>
            {result.score}
          </div>
          <div className="text-xs text-muted">可信度评分 / 100</div>
        </div>
        <p className="text-sm text-foreground">{result.summary}</p>
        {result.findings.length > 0 && (
          <div className="space-y-2">
            {result.findings.map((f, i) => (
              <div key={i} className="rounded-md border border-line p-2.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityBadgeClass(f.severity)}`}>
                    {severityLabel(f.severity)}
                  </span>
                  <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs text-muted">
                    {typeLabel(f.type)}
                  </span>
                </div>
                <p className="mb-1 text-xs font-medium text-foreground">{f.text}</p>
                <p className="text-xs text-muted">{f.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
