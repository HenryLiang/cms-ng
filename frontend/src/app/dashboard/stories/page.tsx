'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getTopics,
  createTopic,
  deleteTopic,
  getAISuggestions,
  adoptTopic,
  getGoogleTrends,
  getNewsBySource,
  importGoogleTrend,
  type TrendingTopic,
  type StorySuggestion,
  type GoogleTrendItem,
} from '@/lib/topic-api';
import {
  Plus,
  Flame,
  Loader2,
  Sparkles,
  ArrowRight,
  Trash2,
  Lightbulb,
  CheckCircle,
  X,
  TrendingUp,
  Globe,
  Newspaper,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export default function StoryHubPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<TrendingTopic | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<StorySuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [adoptingId, setAdoptingId] = useState<string | null>(null);

  // News source state
  const [newsSourceItems, setNewsSourceItems] = useState<GoogleTrendItem[]>([]);
  const [activeNewsSource, setActiveNewsSource] = useState<string | null>(null);
  const [newsSourceLoading, setNewsSourceLoading] = useState(false);
  const [selectedGeo, setSelectedGeo] = useState('HK');
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [newsPage, setNewsPage] = useState(1);
  const [newsPagination, setNewsPagination] = useState({ total: 0, totalPages: 1, limit: 10 });

  const NEWS_SOURCES = [
    { key: 'google-trends', label: 'Google Trends', icon: TrendingUp },
    { key: 'sina', label: '新浪新闻', icon: Newspaper },
    { key: 'people', label: '人民网', icon: Newspaper },
    { key: 'bbc', label: 'BBC', icon: Newspaper },
    { key: 'chinanews', label: '中国新闻网', icon: Newspaper },
    { key: '36kr', label: '36氪', icon: Newspaper },
    { key: 'huxiu', label: '虎嗅', icon: Newspaper },
    { key: 'douban-movie', label: '豆瓣热映', icon: Newspaper },
  ] as const;

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSource, setNewSource] = useState('');
  const [newHeatScore, setNewHeatScore] = useState(50);

  useEffect(() => {
    loadTopics();
  }, []);

  async function loadTopics() {
    try {
      const data = await getTopics();
      setTopics(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTopic(e: React.FormEvent) {
    e.preventDefault();
    await createTopic({
      title: newTitle,
      description: newDescription || undefined,
      source: newSource || undefined,
      heatScore: newHeatScore,
    });
    setNewTitle('');
    setNewDescription('');
    setNewSource('');
    setNewHeatScore(50);
    setShowCreateForm(false);
    await loadTopics();
  }

  async function handleDeleteTopic(id: string) {
    if (!confirm('确定删除这个热点？')) return;
    await deleteTopic(id);
    if (selectedTopic?.id === id) setSelectedTopic(null);
    await loadTopics();
  }

  async function handleGetAISuggestions() {
    setSuggestionsLoading(true);
    setShowAISuggestions(true);
    try {
      const data = await getAISuggestions();
      setSuggestions(data);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function handleAdoptTopic(topicId: string) {
    setAdoptingId(topicId);
    try {
      const result = await adoptTopic(topicId);
      router.push(`/dashboard/stories/${result.storyId}`);
    } finally {
      setAdoptingId(null);
    }
  }

  async function handleAdoptSuggestion(suggestion: StorySuggestion) {
    setAdoptingId('suggestion');
    try {
      const topic = await createTopic({
        title: suggestion.title,
        description: suggestion.description,
        heatScore: 70,
      });
      const result = await adoptTopic(topic.id);
      router.push(`/dashboard/stories/${result.storyId}`);
    } finally {
      setAdoptingId(null);
    }
  }

  async function handleLoadNewsSource(sourceKey: string, page = 1) {
    setNewsSourceLoading(true);
    setActiveNewsSource(sourceKey);
    setShowAISuggestions(false);
    setSelectedTopic(null);
    setNewsPage(page);
    try {
      if (sourceKey === 'google-trends') {
        const res = await getGoogleTrends(selectedGeo, selectedTimeRange, page, 10);
        setNewsSourceItems(res.items);
        setNewsPagination({ total: res.total, totalPages: res.totalPages, limit: res.limit });
      } else {
        const res = await getNewsBySource(sourceKey, page, 10);
        setNewsSourceItems(res.items);
        setNewsPagination({ total: res.total, totalPages: res.totalPages, limit: res.limit });
      }
    } catch {
      setNewsSourceItems([]);
      setNewsPagination({ total: 0, totalPages: 1, limit: 10 });
    } finally {
      setNewsSourceLoading(false);
    }
  }

  async function handlePageChange(page: number) {
    if (!activeNewsSource || page < 1 || page > newsPagination.totalPages) return;
    await handleLoadNewsSource(activeNewsSource, page);
  }

  async function handleImportNewsItem(item: GoogleTrendItem) {
    try {
      await importGoogleTrend(item);
      await loadTopics();
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar - Topic list */}
      <div className="w-80 border-r border-zinc-200 bg-white flex flex-col">
        <div className="p-4 border-b border-zinc-200">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-semibold">选题中心</h1>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
            >
              <Plus className="h-3 w-3" />
              录入热点
            </button>
          </div>
          <button
            onClick={handleGetAISuggestions}
            disabled={suggestionsLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50"
          >
            {suggestionsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            AI 推荐选题
          </button>

          {/* 数据源标签切换 */}
          <div className="mt-3">
            <p className="text-xs text-zinc-400 mb-2">外部数据源</p>
            {activeNewsSource === 'google-trends' && (
              <div className="flex gap-2 mb-2">
                <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 flex-1">
                  <Globe className="h-3 w-3 text-zinc-400" />
                  <select
                    value={selectedGeo}
                    onChange={(e) => setSelectedGeo(e.target.value)}
                    className="bg-transparent text-xs text-zinc-700 outline-none w-full"
                  >
                    <option value="">全球</option>
                    <option value="HK">香港</option>
                    <option value="TW">台湾</option>
                    <option value="US">美国</option>
                    <option value="GB">英国</option>
                    <option value="JP">日本</option>
                    <option value="KR">韩国</option>
                    <option value="CN">中国</option>
                  </select>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 flex-1">
                  <select
                    value={selectedTimeRange}
                    onChange={(e) => setSelectedTimeRange(e.target.value)}
                    className="bg-transparent text-xs text-zinc-700 outline-none w-full"
                  >
                    <option value="4h">最近4小时</option>
                    <option value="24h">最近24小时</option>
                    <option value="48h">最近48小时</option>
                    <option value="7d">最近7天</option>
                    <option value="30d">最近30天</option>
                  </select>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {NEWS_SOURCES.map((source) => {
                const Icon = source.icon;
                const isActive = activeNewsSource === source.key;
                return (
                  <button
                    key={source.key}
                    onClick={() => handleLoadNewsSource(source.key)}
                    disabled={newsSourceLoading}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                      isActive
                        ? 'bg-orange-100 text-orange-700 border border-orange-200'
                        : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    {newsSourceLoading && isActive ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Icon className="h-3 w-3" />
                    )}
                    {source.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {showCreateForm && (
          <form onSubmit={handleCreateTopic} className="p-4 border-b border-zinc-200 space-y-3">
            <input
              type="text"
              required
              placeholder="热点标题"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
            <textarea
              placeholder="描述（可选）"
              rows={2}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
            <input
              type="text"
              placeholder="来源（可选）"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">热度</span>
              <input
                type="range"
                min={0}
                max={100}
                value={newHeatScore}
                onChange={(e) => setNewHeatScore(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs font-medium w-8 text-right">{newHeatScore}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-zinc-900 py-2 text-xs font-medium text-white hover:bg-zinc-800"
              >
                创建
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                取消
              </button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-auto">
          {topics.map((topic) => (
            <div
              key={topic.id}
              onClick={() => {
                setSelectedTopic(topic);
                setShowAISuggestions(false);
                setActiveNewsSource(null);
                setNewsPage(1);
              }}
              className={`w-full text-left p-4 border-b border-zinc-100 hover:bg-zinc-50 transition-colors cursor-pointer ${
                selectedTopic?.id === topic.id ? 'bg-zinc-50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-zinc-900 truncate">{topic.title}</h3>
                  {topic.description && (
                    <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{topic.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-orange-500">
                      <Flame className="h-3 w-3" />
                      {topic.heatScore}
                    </span>
                    {topic.status === 'ADOPTED' && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                        已采纳
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteTopic(topic.id);
                  }}
                  className="text-zinc-400 hover:text-red-500"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
          {topics.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-zinc-400">暂无热点</p>
              <p className="mt-1 text-xs text-zinc-400">点击上方按钮录入或获取 AI 推荐</p>
            </div>
          )}
        </div>
      </div>

      {/* Right panel - Detail or AI Suggestions or News Source */}
      <div className="flex-1 bg-zinc-50 p-8 overflow-auto">
        {activeNewsSource ? (
          <NewsSourcePanel
            sourceKey={activeNewsSource}
            items={newsSourceItems}
            loading={newsSourceLoading}
            onImport={handleImportNewsItem}
            onClose={() => setActiveNewsSource(null)}
            geo={selectedGeo}
            timeRange={selectedTimeRange}
            page={newsPage}
            totalPages={newsPagination.totalPages}
            total={newsPagination.total}
            onPageChange={handlePageChange}
          />
        ) : showAISuggestions ? (
          <AIRecommendationsPanel
            suggestions={suggestions}
            loading={suggestionsLoading}
            onAdopt={handleAdoptSuggestion}
            adoptingId={adoptingId}
            onClose={() => setShowAISuggestions(false)}
          />
        ) : selectedTopic ? (
          <TopicDetailPanel
            topic={selectedTopic}
            onAdopt={() => handleAdoptTopic(selectedTopic.id)}
            adopting={adoptingId === selectedTopic.id}
          />
        ) : (
          <EmptyState onGetSuggestions={handleGetAISuggestions} />
        )}
      </div>
    </div>
  );
}

function TopicDetailPanel({
  topic,
  onAdopt,
  adopting,
}: {
  topic: TrendingTopic;
  onAdopt: () => void;
  adopting: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">{topic.title}</h2>
          <div className="mt-1 flex items-center gap-3 text-sm text-zinc-500">
            <span className="flex items-center gap-1">
              <Flame className="h-4 w-4 text-orange-500" />
              热度 {topic.heatScore}
            </span>
            {topic.source && <span>来源：{topic.source}</span>}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                topic.status === 'ADOPTED'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-blue-50 text-blue-600'
              }`}
            >
              {topic.status === 'ADOPTED' ? '已采纳' : '开放中'}
            </span>
          </div>
        </div>
      </div>

      {topic.description && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-zinc-700 mb-2">描述</h3>
          <p className="text-sm text-zinc-600 leading-relaxed">{topic.description}</p>
        </div>
      )}

      {topic.suggestedAngles && topic.suggestedAngles.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-zinc-700 mb-2">建议角度</h3>
          <div className="space-y-2">
            {topic.suggestedAngles.map((angle, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-white border border-zinc-200 p-3">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-zinc-700">{angle}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {topic.status !== 'ADOPTED' && (
        <button
          onClick={onAdopt}
          disabled={adopting}
          className="flex items-center gap-2 rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {adopting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
          一键创建选题
        </button>
      )}

      {topic.adoptedStoryId && (
        <Link
          href={`/dashboard/stories/${topic.adoptedStoryId}`}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          查看已创建的选题
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

function AIRecommendationsPanel({
  suggestions,
  loading,
  onAdopt,
  adoptingId,
  onClose,
}: {
  suggestions: StorySuggestion[];
  loading: boolean;
  onAdopt: (s: StorySuggestion) => void;
  adoptingId: string | null;
  onClose: () => void;
}) {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600" />
          <h2 className="text-xl font-semibold">AI 选题推荐</h2>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center">
          <p className="text-zinc-500">暂无推荐，请稍后重试</p>
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((suggestion, i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-200 bg-white p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-base font-medium text-zinc-900">{suggestion.title}</h3>
                  <p className="mt-2 text-sm text-zinc-600">{suggestion.description}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-zinc-700">{suggestion.suggestedAngle}</span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">{suggestion.reason}</p>
                </div>
                <button
                  onClick={() => onAdopt(suggestion)}
                  disabled={adoptingId === 'suggestion'}
                  className="shrink-0 flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {adoptingId === 'suggestion' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  采纳
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewsSourcePanel({
  sourceKey,
  items,
  loading,
  onImport,
  onClose,
  geo,
  timeRange,
  page,
  totalPages,
  total,
  onPageChange,
}: {
  sourceKey: string;
  items: GoogleTrendItem[];
  loading: boolean;
  onImport: (item: GoogleTrendItem) => void;
  onClose: () => void;
  geo: string;
  timeRange: string;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const sourceConfig = {
    'google-trends': { label: 'Google Trends', color: 'text-orange-600', icon: TrendingUp },
    'sina': { label: '新浪新闻', color: 'text-red-600', icon: Newspaper },
    'people': { label: '人民网', color: 'text-blue-600', icon: Newspaper },
    'bbc': { label: 'BBC', color: 'text-indigo-600', icon: Newspaper },
    'chinanews': { label: '中国新闻网', color: 'text-emerald-600', icon: Newspaper },
    '36kr': { label: '36氪', color: 'text-sky-600', icon: Newspaper },
    'huxiu': { label: '虎嗅', color: 'text-amber-600', icon: Newspaper },
    'douban-movie': { label: '豆瓣热映', color: 'text-green-600', icon: Newspaper },
  };

  const config = sourceConfig[sourceKey as keyof typeof sourceConfig] || { label: sourceKey, color: 'text-zinc-600', icon: Newspaper };
  const Icon = config.icon;

  const geoLabel: Record<string, string> = {
    '': '全球',
    HK: '香港',
    TW: '台湾',
    US: '美国',
    GB: '英国',
    JP: '日本',
    KR: '韩国',
    CN: '中国',
  };
  const timeLabel: Record<string, string> = {
    '4h': '最近4小时',
    '24h': '最近24小时',
    '48h': '最近48小时',
    '7d': '最近7天',
    '30d': '最近30天',
  };

  const showMeta = sourceKey === 'google-trends';

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${config.color}`} />
          <h2 className="text-xl font-semibold">{config.label}</h2>
          {showMeta && (
            <span className="text-xs text-zinc-400">
              {geoLabel[geo] || geo} · {timeLabel[timeRange] || timeRange}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center">
          <p className="text-zinc-500">暂无数据，请稍后重试</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-200 bg-white p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-medium text-zinc-900">{item.title}</h3>
                    <span className="rounded bg-orange-50 px-1.5 py-0.5 text-xs font-medium text-orange-600">
                      热度 {item.heatScore}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">{item.description}</p>
                  {item.tags && item.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.tags.slice(0, 5).map((tag, j) => (
                        <span key={j} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onImport(item)}
                  className="shrink-0 flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800"
                >
                  <Plus className="h-3 w-3" />
                  导入系统
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-200">
          <div className="text-sm text-zinc-500">
            共 {total} 条，第 {page}/{totalPages} 页
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onGetSuggestions }: { onGetSuggestions: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="rounded-full bg-zinc-100 p-4 mb-4">
        <Lightbulb className="h-8 w-8 text-zinc-400" />
      </div>
      <h3 className="text-lg font-medium text-zinc-900">选题中心</h3>
      <p className="mt-2 text-sm text-zinc-500 max-w-sm">
        从左侧选择一个热点查看详情，或使用 AI 获取个性化选题推荐
      </p>
      <button
        onClick={onGetSuggestions}
        className="mt-4 flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100"
      >
        <Sparkles className="h-4 w-4" />
        获取 AI 选题推荐
      </button>
    </div>
  );
}
