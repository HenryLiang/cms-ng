import { X, Sparkles } from 'lucide-react';
import type { GEOResult } from '@/lib/article-api';

interface GEOPanelProps {
  result: GEOResult;
  onClose: () => void;
  onApplySummary: (summary: string) => void;
}

export default function GEOPanel({ result, onClose, onApplySummary }: GEOPanelProps) {
  const scoreColor = (score: number) =>
    score >= 80 ? 'text-violet-600' : score >= 60 ? 'text-amber-600' : 'text-red-600';

  const scoreBg = (score: number) =>
    score >= 80 ? 'bg-violet-50' : score >= 60 ? 'bg-amber-50' : 'bg-red-50';

  const priorityLabel = (p: string) =>
    p === 'high' ? '高' : p === 'medium' ? '中' : '低';

  const priorityClass = (p: string) =>
    p === 'high'
      ? 'bg-red-50 text-red-700'
      : p === 'medium'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-blue-50 text-blue-700';

  const entityTypeLabel = (t: string) =>
    ({ person: '人物', org: '机构', place: '地点', date: '日期', stat: '数据' } as Record<string, string>)[t] || t;

  const entityTypeClass = (t: string) =>
    ({
      person: 'bg-violet-50 text-violet-700',
      org: 'bg-indigo-50 text-indigo-700',
      place: 'bg-emerald-50 text-emerald-700',
      date: 'bg-amber-50 text-amber-700',
      stat: 'bg-blue-50 text-blue-700',
    } as Record<string, string>)[t] || 'bg-zinc-100 text-zinc-600';

  return (
    <div className="rounded-lg border border-violet-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-violet-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-medium text-zinc-900">GEO 优化分析</span>
        </div>
        <button onClick={onClose} aria-label="关闭" className="text-zinc-400 hover:text-zinc-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-3 space-y-4 max-h-96 overflow-auto">
        {/* Scores */}
        <div className="grid grid-cols-3 gap-2">
          <div className={`flex flex-col items-center justify-center rounded-lg ${scoreBg(result.overallScore)} px-2 py-2`}>
            <span className={`text-xl font-bold ${scoreColor(result.overallScore)}`}>
              {result.overallScore}
            </span>
            <span className="text-[10px] text-zinc-500">综合适答度</span>
          </div>
          <div className={`flex flex-col items-center justify-center rounded-lg ${scoreBg(result.citationScore)} px-2 py-2`}>
            <span className={`text-xl font-bold ${scoreColor(result.citationScore)}`}>
              {result.citationScore}
            </span>
            <span className="text-[10px] text-zinc-500">可引用度</span>
          </div>
          <div className={`flex flex-col items-center justify-center rounded-lg ${scoreBg(result.answerReadinessScore)} px-2 py-2`}>
            <span className={`text-xl font-bold ${scoreColor(result.answerReadinessScore)}`}>
              {result.answerReadinessScore}
            </span>
            <span className="text-[10px] text-zinc-500">答案就绪度</span>
          </div>
        </div>

        {/* AI-citable summary */}
        {result.optimizedSummary && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-xs font-medium text-zinc-500">AI 可引用摘要</h4>
              <button
                onClick={() => {
                  if (confirm('将用此 GEO 摘要覆盖当前文章摘要，是否继续？')) {
                    onApplySummary(result.optimizedSummary);
                  }
                }}
                className="shrink-0 rounded-md bg-violet-600 px-2 py-1 text-xs font-medium text-white hover:bg-violet-700"
              >
                应用到摘要
              </button>
            </div>
            <p className="text-xs text-zinc-700 bg-violet-50/50 rounded-md p-2 leading-relaxed">
              {result.optimizedSummary}
            </p>
          </div>
        )}

        {/* Suggested questions */}
        {result.suggestedQuestions.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-zinc-500 mb-1.5">建议问答覆盖</h4>
            <div className="space-y-2">
              {result.suggestedQuestions.map((q, i) => (
                <div key={i} className="rounded-md border border-zinc-100 p-2">
                  <p className="text-sm font-medium text-zinc-900">Q：{q.question}</p>
                  {q.answerSnippet && (
                    <p className="text-xs text-zinc-500 mt-1 leading-relaxed">A：{q.answerSnippet}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key statements */}
        {result.keyStatements.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-zinc-500 mb-1.5">可引用关键陈述</h4>
            <div className="space-y-2">
              {result.keyStatements.map((s, i) => (
                <div key={i} className="rounded-md border border-zinc-100 p-2">
                  <p className="text-xs text-zinc-700 leading-relaxed">&ldquo;{s.statement}&rdquo;</p>
                  {s.reason && (
                    <p className="text-[11px] text-violet-600 mt-1">引用理由：{s.reason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Entities */}
        {result.entities.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-zinc-500 mb-1.5">核心实体</h4>
            <div className="flex flex-wrap gap-1.5">
              {result.entities.map((e, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${entityTypeClass(e.type)}`}
                >
                  {e.name}
                  <span className="text-[10px] opacity-70">{entityTypeLabel(e.type)}</span>
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
