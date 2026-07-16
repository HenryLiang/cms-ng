import { useState } from 'react';
import { BookOpen, X, Clock, Users, BarChart3, MessageSquare, Sparkles, Globe } from 'lucide-react';
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
    { key: 'timeline' as const, label: '事件时间线', icon: Clock, count: researchKit?.timeline.length ?? 0 },
    { key: 'people' as const, label: '关键人物', icon: Users, count: researchKit?.people.length ?? 0 },
    { key: 'data' as const, label: '核心数据', icon: BarChart3, count: researchKit?.data.length ?? 0 },
    { key: 'opinions' as const, label: '各方观点', icon: MessageSquare, count: researchKit?.opinions.length ?? 0 },
    // Always show Wikipedia tab - even when empty or errored - so the
    // user can see the diagnostic message (wikipediaStatus).
    { key: 'wikipedia' as const, label: hasWikipediaError ? 'Wikipedia ⚠️' : 'Wikipedia', icon: Globe, count: wikiEntryCount },
  ];

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-medium text-foreground">AI 资料搜集</h2>
          <span className="text-xs text-subtle">基于选题信息生成结构化背景资料</span>
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
              {draftLoading ? '撰寫中...' : '基於資料生成初稿'}
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
            {loading ? '生成中...' : researchKit ? '重新生成' : '生成资料包'}
          </Button>
        </div>
      </div>

      <div className="border-t border-line">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
            <span className="ml-2 text-sm text-muted">AI 正在搜集整理资料...</span>
          </div>
        ) : !hasData ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted">暂无资料，点击上方按钮生成</p>
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
                          <p className="text-xs text-subtle mt-0.5">来源：{item.source}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {researchKit!.timeline.length === 0 && (
                    <p className="text-sm text-subtle text-center py-4">暂无时间线数据</p>
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
                    <p className="text-sm text-subtle text-center py-4 col-span-2">暂无人物数据</p>
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
                          <p className="text-xs text-subtle mt-0.5">来源：{item.source}</p>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-foreground">{item.value}</p>
                    </div>
                  ))}
                  {researchKit!.data.length === 0 && (
                    <p className="text-sm text-subtle text-center py-4">暂无数据</p>
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
                    <p className="text-sm text-subtle text-center py-4">暂无观点数据</p>
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
                          {entry.language === 'zh' ? '中文' : 'English'}
                        </Badge>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{entry.extract}</p>
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-2 inline-block"
                      >
                        查看原文 →
                      </a>
                    </div>
                  ))}
                  {(!researchKit!.wikipedia || researchKit!.wikipedia.length === 0) && (
                    <>
                      {researchKit!.wikipediaStatus === 'api_error' ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                          <p className="text-sm font-medium text-amber-800">Wikipedia 获取失败</p>
                          <p className="text-xs text-amber-600 mt-1">
                            API 请求未成功（可能原因：代理未开启、网络不通、或 Wikipedia 限流）。系统已回退使用联网搜索结果。
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-subtle text-center py-4">
                          {researchKit!.wikipediaStatus === 'no_results'
                            ? 'Wikipedia 未找到相关词条'
                            : '暂无 Wikipedia 资料'}
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
