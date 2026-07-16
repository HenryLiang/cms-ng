import { ClipboardCheck, X } from 'lucide-react';
import type { ReviewReportResult } from '@/lib/article-api';

export default function ReviewReportPanel({
  result,
  onClose,
}: {
  result: ReviewReportResult;
  onClose: () => void;
}) {
  // 评分色（测试断言 text-emerald-600/amber-600/red-600，保留）
  const scoreColor =
    result.overallScore >= 80 ? 'text-emerald-600' : result.overallScore >= 60 ? 'text-amber-600' : 'text-red-600';
  const scoreBg =
    result.overallScore >= 80 ? 'bg-emerald-50' : result.overallScore >= 60 ? 'bg-amber-50' : 'bg-red-50';
  const scoreBarColor =
    result.overallScore >= 80 ? 'bg-emerald-500' : result.overallScore >= 60 ? 'bg-amber-500' : 'bg-red-500';

  // 优先级徽章（测试断言 text+bg 类，保留）
  const priorityConfig = {
    high: { label: '高', color: 'text-red-600 bg-red-50 border-red-200' },
    medium: { label: '中', color: 'text-amber-600 bg-amber-50 border-amber-200' },
    low: { label: '低', color: 'text-zinc-600 bg-zinc-50 border-zinc-200' },
  };

  return (
    <div className="overflow-hidden rounded-lg border border-blue-200 bg-surface">
      <div className="flex items-center justify-between border-b border-blue-100 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <ClipboardCheck className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-medium text-blue-900">AI 预审报告</span>
        </div>
        <button onClick={onClose} className="text-subtle transition-colors hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-96 space-y-4 overflow-auto p-3">
        {/* Overall Score */}
        <div className={`rounded-lg ${scoreBg} p-4 text-center`}>
          <p className={`text-4xl font-bold ${scoreColor}`}>{result.overallScore}</p>
          <p className="mt-1 text-xs text-muted">综合评分 / 100</p>
        </div>

        {/* Summary */}
        <p className="text-sm leading-relaxed text-foreground">{result.summary}</p>

        {/* Dimensions */}
        {result.dimensions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-foreground">维度评分</h4>
            {result.dimensions.map((dim, i) => (
              <div key={i}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-foreground">{dim.name}</span>
                  <span className="font-medium text-foreground tnum">{dim.score} / {dim.maxScore}</span>
                </div>
                {/* 进度条轨道（测试断言 bg-zinc-100，保留） */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={`h-full rounded-full ${scoreBarColor} transition-all`}
                    style={{ width: `${(dim.score / dim.maxScore) * 100}%` }}
                  />
                </div>
                {dim.comment && (
                  <p className="mt-0.5 text-xs text-muted">{dim.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Suggestions */}
        {result.suggestions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-foreground">改进建议</h4>
            {result.suggestions.map((s, i) => {
              const cfg = priorityConfig[s.priority];
              return (
                <div key={i} className="rounded-lg border border-line p-2.5">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="text-xs font-medium text-foreground">{s.dimension}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted">{s.suggestion}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
