'use client';

import { X, TrendingUp, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SEOResult } from '@/lib/article-api';
import { Button, Badge } from '@/components/ui';

interface SEOPanelProps {
  result: SEOResult;
  onClose: () => void;
  onApplyTitle: (title: string) => void;
}

export default function SEOPanel({ result, onClose, onApplyTitle }: SEOPanelProps) {
  const t = useTranslations('panels.seo');
  const scoreColor = (score: number) =>
    score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-red-600';

  const scoreBg = (score: number) =>
    score >= 80 ? 'bg-emerald-50' : score >= 60 ? 'bg-amber-50' : 'bg-red-50';

  const priorityLabel = (p: string) =>
    p === 'high' ? t('priorityHigh') : p === 'medium' ? t('priorityMedium') : t('priorityLow');

  const priorityTone = (p: string): 'danger' | 'warning' | 'info' =>
    p === 'high' ? 'danger' : p === 'medium' ? 'warning' : 'info';

  const volumeLabel = (v: string) =>
    v === 'high' ? t('volumeHigh') : v === 'medium' ? t('volumeMedium') : t('volumeLow');

  const volumeTone = (v: string): 'success' | 'warning' | 'neutral' =>
    v === 'high' ? 'success' : v === 'medium' ? 'warning' : 'neutral';

  return (
    <div className="rounded-lg border border-emerald-200 bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-emerald-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-medium text-foreground">{t('title')}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="p-3 space-y-4 max-h-96 overflow-auto">
        {/* Score */}
        <div className="flex items-center gap-4">
          <div className={`flex flex-col items-center justify-center rounded-lg ${scoreBg(result.overallScore)} px-4 py-2`}>
            <span className={`text-2xl font-bold ${scoreColor(result.overallScore)}`}>
              {result.overallScore}
            </span>
            <span className="text-xs text-muted">{t('seoScore')}</span>
          </div>
          <div className={`flex flex-col items-center justify-center rounded-lg ${scoreBg(result.readabilityScore)} px-4 py-2`}>
            <span className={`text-2xl font-bold ${scoreColor(result.readabilityScore)}`}>
              {result.readabilityScore}
            </span>
            <span className="text-xs text-muted">{t('readability')}</span>
          </div>
        </div>

        {/* Optimized Titles */}
        {result.optimizedTitle.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted mb-1.5">{t('optimizedTitles')}</h4>
            <div className="space-y-2">
              {result.optimizedTitle.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-2 rounded-md border border-line p-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted mt-0.5">{item.reasoning}</p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => onApplyTitle(item.title)}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meta Description */}
        {result.metaDescription && (
          <div>
            <h4 className="text-xs font-medium text-muted mb-1">{t('metaDescription')}</h4>
            <p className="text-xs text-foreground bg-canvas rounded-md p-2 leading-relaxed">
              {result.metaDescription}
            </p>
          </div>
        )}

        {/* Keywords */}
        {result.keywords.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted mb-1.5">{t('coreKeywords')}</h4>
            <div className="flex flex-wrap gap-1.5">
              {result.keywords.map((k, i) => (
                <Badge key={i} tone={volumeTone(k.searchVolume)} className="gap-1">
                  {k.keyword}
                  <span className="text-[10px] opacity-70">{volumeLabel(k.searchVolume)}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Suggestions */}
        {result.suggestions.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted mb-1.5">{t('suggestions')}</h4>
            <div className="space-y-2">
              {result.suggestions.map((s, i) => (
                <div key={i} className="rounded-md border border-line p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge tone={priorityTone(s.priority)} className="text-[10px]">
                      {priorityLabel(s.priority)}
                    </Badge>
                    <span className="text-xs text-muted">{s.category}</span>
                  </div>
                  <p className="text-xs text-foreground">{s.suggestion}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
