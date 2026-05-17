import { ClipboardCheck, X } from 'lucide-react';
import type { ReviewReportResult } from '@/lib/article-api';

export default function ReviewReportPanel({
  result,
  onClose,
}: {
  result: ReviewReportResult;
  onClose: () => void;
}) {
  const scoreColor =
    result.overallScore >= 80 ? 'text-emerald-600' : result.overallScore >= 60 ? 'text-amber-600' : 'text-red-600';
  const scoreBg =
    result.overallScore >= 80 ? 'bg-emerald-50' : result.overallScore >= 60 ? 'bg-amber-50' : 'bg-red-50';
  const scoreBarColor =
    result.overallScore >= 80 ? 'bg-emerald-500' : result.overallScore >= 60 ? 'bg-amber-500' : 'bg-red-500';

  const priorityConfig = {
    high: { label: '高', color: 'text-red-600 bg-red-50 border-red-200' },
    medium: { label: '中', color: 'text-amber-600 bg-amber-50 border-amber-200' },
    low: { label: '低', color: 'text-zinc-600 bg-zinc-50 border-zinc-200' },
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-blue-100 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <ClipboardCheck className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-medium text-blue-900">AI 预审报告</span>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-4 max-h-96 overflow-auto">
        {/* Overall Score */}
        <div className={`rounded-lg ${scoreBg} p-4 text-center`}>
          <p className={`text-4xl font-bold ${scoreColor}`}>{result.overallScore}</p>
          <p className="text-xs text-zinc-500 mt-1">综合评分 / 100</p>
        </div>

        {/* Summary */}
        <p className="text-sm text-zinc-700 leading-relaxed">{result.summary}</p>

        {/* Dimensions */}
        {result.dimensions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-zinc-900">维度评分</h4>
            {result.dimensions.map((dim, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-zinc-700">{dim.name}</span>
                  <span className="font-medium text-zinc-900">{dim.score} / {dim.maxScore}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${scoreBarColor} transition-all`}
                    style={{ width: `${(dim.score / dim.maxScore) * 100}%` }}
                  />
                </div>
                {dim.comment && (
                  <p className="text-xs text-zinc-500 mt-0.5">{dim.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Suggestions */}
        {result.suggestions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-zinc-900">改进建议</h4>
            {result.suggestions.map((s, i) => {
              const cfg = priorityConfig[s.priority];
              return (
                <div key={i} className="rounded-lg border border-zinc-200 p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className="text-xs font-medium text-zinc-700">{s.dimension}</span>
                  </div>
                  <p className="text-xs text-zinc-600 leading-relaxed">{s.suggestion}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
