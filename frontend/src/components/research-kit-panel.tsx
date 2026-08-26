import { useState } from 'react';
import { BookOpen, X, Clock, Users, BarChart3, MessageSquare, Sparkles, Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ResearchKitResult } from '@/lib/story-api';
import { Button, Card, Badge } from '@/components/ui';

interface ResearchKitPanelProps {
  researchKit: ResearchKitResult | null;
  loading: boolean;
  onGenerate: () => void;
  onClose: () => void;
  onGenerateDraft?: () => void;
  draftLoading?: boolean;
}

export default function ResearchKitPanel({
  researchKit,
  loading,
  onGenerate,
  onClose,
  onGenerateDraft,
  draftLoading,
}: ResearchKitPanelProps) {
  const t = useTranslations('panels.researchKit');
  const [activeTab, setActiveTab] = useState<'timeline' | 'people' | 'data' | 'opinions' | 'wikipedia'>('timeline');

  const hasData = researchKit && (
    researchKit.timeline.length > 0 ||
    researchKit.people.length > 0 ||
    researchKit.data.length > 0 ||
    researchKit.opinions.length > 0 ||
    (researchKit.wikipedia?.length ?? 0) > 0
  );

  const hasWikipediaError = researchKit?.wikipediaStatus === 'api_error';
  const wikiEntryCount = researchKit?.wikipedia?.length ?? 0;
  const tabs = [
    { key: 'timeline' as const, label: t('tabTimeline'), icon: Clock, count: researchKit?.timeline.length ?? 0 },
    { key: 'people' as const, label: t('tabPeople'), icon: Users, count: researchKit?.people.length ?? 0 },
    { key: 'data' as const, label: t('tabData'), icon: BarChart3, count: researchKit?.data.length ?? 0 },
    { key: 'opinions' as const, label: t('tabOpinions'), icon: MessageSquare, count: researchKit?.opinions.length ?? 0 },
    // Always show Wikipedia tab - even when empty or errored - so the
    // user can see the diagnostic message (wikipediaStatus).
    { key: 'wikipedia' as const, label: hasWikipediaError ? t('tabWikipediaError') : t('tabWikipedia'), icon: Globe, count: wikiEntryCount },
  ];

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-medium text-foreground">{t('title')}</h2>
          <span className="text-xs text-subtle">{t('subtitle')}</span>
        </div>
        <div className="flex items-center gap-2">
          {onGenerateDraft && hasData && (
            <Button
              variant="success"
              size="sm"
              loading={draftLoading}
              onClick={onGenerateDraft}
            >
              {!draftLoading && <Sparkles className="h-4 w-4" />}
              {draftLoading ? t('generatingDraft') : t('generateDraft')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={loading}
            onClick={onGenerate}
          >
            {!loading && <BookOpen className="h-4 w-4" />}
            {loading ? t('generating') : researchKit ? t('regenerate') : t('generate')}
          </Button>
        </div>
      </div>

      <div className="border-t border-line">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
            <span className="ml-2 text-sm text-muted">{t('loading')}</span>
          </div>
        ) : !hasData ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted">{t('empty')}</p>
          </div>
        ) : (
          <div>
            {/* Tabs */}
            <div className="flex border-b border-line">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-brand text-foreground'
                      : 'border-transparent text-muted hover:text-foreground'
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                  <Badge tone="neutral">{tab.count}</Badge>
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-4">
              {activeTab === 'timeline' && (
                <div className="space-y-3">
                  {researchKit!.timeline.map((item, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full bg-subtle" />
                        {idx < researchKit!.timeline.length - 1 && (
                          <div className="mt-1 h-full w-px bg-line" />
                        )}
                      </div>
                      <div className="flex-1 pb-3">
                        <p className="text-xs font-medium text-muted">{item.date}</p>
                        <p className="text-sm text-foreground mt-0.5">{item.event}</p>
                        {item.source && (
                          <p className="text-xs text-subtle mt-0.5">{t('source', { source: item.source })}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {researchKit!.timeline.length === 0 && (
                    <p className="text-sm text-subtle text-center py-4">{t('emptyTimeline')}</p>
                  )}
                </div>
              )}

              {activeTab === 'people' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {researchKit!.people.map((person, idx) => (
                    <div key={idx} className="rounded-lg border border-line p-3">
                      <p className="text-sm font-medium text-foreground">{person.name}</p>
                      <p className="text-xs text-muted mt-0.5">{person.role}</p>
                      {person.background && (
                        <p className="text-xs text-muted mt-1.5">{person.background}</p>
                      )}
                    </div>
                  ))}
                  {researchKit!.people.length === 0 && (
                    <p className="text-sm text-subtle text-center py-4 col-span-2">{t('emptyPeople')}</p>
                  )}
                </div>
              )}

              {activeTab === 'data' && (
                <div className="space-y-2">
                  {researchKit!.data.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-line px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        {item.source && (
                          <p className="text-xs text-subtle mt-0.5">{t('source', { source: item.source })}</p>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-foreground">{item.value}</p>
                    </div>
                  ))}
                  {researchKit!.data.length === 0 && (
                    <p className="text-sm text-subtle text-center py-4">{t('emptyData')}</p>
                  )}
                </div>
              )}

              {activeTab === 'opinions' && (
                <div className="space-y-3">
                  {researchKit!.opinions.map((opinion, idx) => (
                    <div key={idx} className="rounded-lg border border-line p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge tone="neutral">{opinion.source}</Badge>
                        {opinion.stance && (
                          <span className="text-xs text-muted">{opinion.stance}</span>
                        )}
                      </div>
                      <p className="text-sm text-foreground">{opinion.viewpoint}</p>
                    </div>
                  ))}
                  {researchKit!.opinions.length === 0 && (
                    <p className="text-sm text-subtle text-center py-4">{t('emptyOpinions')}</p>
                  )}
                </div>
              )}

              {activeTab === 'wikipedia' && (
                <div className="space-y-3">
                  {researchKit!.wikipedia?.map((entry, idx) => (
                    <div key={idx} className="rounded-lg border border-line p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Globe className="h-3.5 w-3.5 text-subtle" />
                        <span className="text-sm font-medium text-foreground">{entry.title}</span>
                        <Badge tone="neutral">
                          {entry.language === 'zh' ? t('langZh') : t('langEn')}
                        </Badge>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{entry.extract}</p>
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                      >
                        {t('viewOriginal')}
                      </a>
                    </div>
                  ))}
                  {(!researchKit!.wikipedia || researchKit!.wikipedia.length === 0) && (
                    <>
                      {researchKit!.wikipediaStatus === 'api_error' ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                          <p className="text-sm font-medium text-amber-800">{t('wikiErrorTitle')}</p>
                          <p className="text-xs text-amber-600 mt-1">
                            {t('wikiErrorDetail')}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-subtle text-center py-4">
                          {researchKit!.wikipediaStatus === 'no_results'
                            ? t('wikiNoResults')
                            : t('wikiEmpty')}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
