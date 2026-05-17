import { useState } from 'react';
import { BookOpen, Loader2, X, Clock, Users, BarChart3, MessageSquare } from 'lucide-react';
import type { ResearchKitResult } from '@/lib/story-api';

interface ResearchKitPanelProps {
  researchKit: ResearchKitResult | null;
  loading: boolean;
  onGenerate: () => void;
  onClose: () => void;
}

export default function ResearchKitPanel({ researchKit, loading, onGenerate, onClose }: ResearchKitPanelProps) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'people' | 'data' | 'opinions'>('timeline');

  const hasData = researchKit && (
    researchKit.timeline.length > 0 ||
    researchKit.people.length > 0 ||
    researchKit.data.length > 0 ||
    researchKit.opinions.length > 0
  );

  const tabs = [
    { key: 'timeline' as const, label: '事件时间线', icon: Clock, count: researchKit?.timeline.length ?? 0 },
    { key: 'people' as const, label: '关键人物', icon: Users, count: researchKit?.people.length ?? 0 },
    { key: 'data' as const, label: '核心数据', icon: BarChart3, count: researchKit?.data.length ?? 0 },
    { key: 'opinions' as const, label: '各方观点', icon: MessageSquare, count: researchKit?.opinions.length ?? 0 },
  ];

  return (
    <div className="mb-6 rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-zinc-500" />
          <h2 className="text-sm font-medium text-zinc-900">AI 资料搜集</h2>
          <span className="text-xs text-zinc-400">基于选题信息生成结构化背景资料</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={onGenerate}
            disabled={loading}
            className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BookOpen className="h-4 w-4" />
            )}
            {loading ? '生成中...' : researchKit ? '重新生成' : '生成资料包'}
          </button>
        </div>
      </div>

      <div className="border-t border-zinc-200">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            <span className="ml-2 text-sm text-zinc-500">AI 正在搜集整理资料...</span>
          </div>
        ) : !hasData ? (
          <div className="py-8 text-center">
            <p className="text-sm text-zinc-500">暂无资料，点击上方按钮生成</p>
          </div>
        ) : (
          <div>
            {/* Tabs */}
            <div className="flex border-b border-zinc-200">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-zinc-900 text-zinc-900'
                      : 'border-transparent text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                  <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
                    {tab.count}
                  </span>
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
                        <div className="h-2 w-2 rounded-full bg-zinc-400" />
                        {idx < researchKit!.timeline.length - 1 && (
                          <div className="mt-1 h-full w-px bg-zinc-200" />
                        )}
                      </div>
                      <div className="flex-1 pb-3">
                        <p className="text-xs font-medium text-zinc-500">{item.date}</p>
                        <p className="text-sm text-zinc-900 mt-0.5">{item.event}</p>
                        {item.source && (
                          <p className="text-xs text-zinc-400 mt-0.5">来源：{item.source}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {researchKit!.timeline.length === 0 && (
                    <p className="text-sm text-zinc-400 text-center py-4">暂无时间线数据</p>
                  )}
                </div>
              )}

              {activeTab === 'people' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {researchKit!.people.map((person, idx) => (
                    <div key={idx} className="rounded-lg border border-zinc-200 p-3">
                      <p className="text-sm font-medium text-zinc-900">{person.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{person.role}</p>
                      {person.background && (
                        <p className="text-xs text-zinc-600 mt-1.5">{person.background}</p>
                      )}
                    </div>
                  ))}
                  {researchKit!.people.length === 0 && (
                    <p className="text-sm text-zinc-400 text-center py-4 col-span-2">暂无人物数据</p>
                  )}
                </div>
              )}

              {activeTab === 'data' && (
                <div className="space-y-2">
                  {researchKit!.data.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{item.label}</p>
                        {item.source && (
                          <p className="text-xs text-zinc-400 mt-0.5">来源：{item.source}</p>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-zinc-900">{item.value}</p>
                    </div>
                  ))}
                  {researchKit!.data.length === 0 && (
                    <p className="text-sm text-zinc-400 text-center py-4">暂无数据</p>
                  )}
                </div>
              )}

              {activeTab === 'opinions' && (
                <div className="space-y-3">
                  {researchKit!.opinions.map((opinion, idx) => (
                    <div key={idx} className="rounded-lg border border-zinc-200 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-zinc-700 bg-zinc-100 rounded-full px-2 py-0.5">
                          {opinion.source}
                        </span>
                        {opinion.stance && (
                          <span className="text-xs text-zinc-500">{opinion.stance}</span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-700">{opinion.viewpoint}</p>
                    </div>
                  ))}
                  {researchKit!.opinions.length === 0 && (
                    <p className="text-sm text-zinc-400 text-center py-4">暂无观点数据</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
