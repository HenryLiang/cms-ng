import { X, TrendingUp, Check } from 'lucide-react';
import type { SEOResult } from '@/lib/article-api';

interface SEOPanelProps {
  result: SEOResult;
  onClose: () => void;
  onApplyTitle: (title: string) => void;
}

export default function SEOPanel({ result, onClose, onApplyTitle }: SEOPanelProps) {
  const scoreColor = (score: number) =>
    score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-red-600';

  const scoreBg = (score: number) =>
    score >= 80 ? 'bg-emerald-50' : score >= 60 ? 'bg-amber-50' : 'bg-red-50';

  const priorityLabel = (p: string) =>
    p === 'high' ? '高' : p === 'medium' ? '中' : '低';

  const priorityClass = (p: string) =>
    p === 'high'
      ? 'bg-red-50 text-red-700'
      : p === 'medium'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-blue-50 text-blue-700';

  const volumeLabel = (v: string) =>
    v === 'high' ? '高' : v === 'medium' ? '中' : '低';

  const volumeClass = (v: string) =>
    v === 'high'
      ? 'bg-emerald-50 text-emerald-700'
      : v === 'medium'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-zinc-100 text-zinc-600';

  return (
    <div className="rounded-lg border border-emerald-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-emerald-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-medium text-zinc-900">SEO 优化分析</span>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-4 max-h-96 overflow-auto">
        {/* Score */}
        <div className="flex items-center gap-4">
          <div className={`flex flex-col items-center justify-center rounded-lg ${scoreBg(result.overallScore)} px-4 py-2`}>
            <span className={`text-2xl font-bold ${scoreColor(result.overallScore)}`}>
              {result.overallScore}
            </span>
            <span className="text-xs text-zinc-500">SEO 评分</span>
          </div>
          <div className={`flex flex-col items-center justify-center rounded-lg ${scoreBg(result.readabilityScore)} px-4 py-2`}>
            <span className={`text-2xl font-bold ${scoreColor(result.readabilityScore)}`}>
              {result.readabilityScore}
            </span>
            <span className="text-xs text-zinc-500">可读性</span>
          </div>
        </div>

        {/* Optimized Titles */}
        {result.optimizedTitle.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-zinc-500 mb-1.5">优化标题建议</h4>
            <div className="space-y-2">
              {result.optimizedTitle.map((t, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-2 rounded-md border border-zinc-100 p-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{t.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{t.reasoning}</p>
                  </div>
                  <button
                    onClick={() => onApplyTitle(t.title)}
                    className="shrink-0 rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-800"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meta Description */}
        {result.metaDescription && (
          <div>
            <h4 className="text-xs font-medium text-zinc-500 mb-1">建议元描述</h4>
            <p className="text-xs text-zinc-700 bg-zinc-50 rounded-md p-2 leading-relaxed">
              {result.metaDescription}
            </p>
          </div>
        )}

        {/* Keywords */}
        {result.keywords.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-zinc-500 mb-1.5">核心关键词</h4>
            <div className="flex flex-wrap gap-1.5">
              {result.keywords.map((k, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${volumeClass(k.searchVolume)}`}
                >
                  {k.keyword}
                  <span className="text-[10px] opacity-70">{volumeLabel(k.searchVolume)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Suggestions */}
        {result.suggestions.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-zinc-500 mb-1.5">优化建议</h4>
            <div className="space-y-2">
              {result.suggestions.map((s, i) => (
                <div key={i} className="rounded-md border border-zinc-100 p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityClass(s.priority)}`}>
                      {priorityLabel(s.priority)}
                    </span>
                    <span className="text-xs text-zinc-500">{s.category}</span>
                  </div>
                  <p className="text-xs text-zinc-700">{s.suggestion}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
