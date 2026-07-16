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
  getTopicSources,
  getTopicSourceItems,
  importTopic,
  type TrendingTopic,
  type StorySuggestion,
  type TopicCandidate,
  type TopicSourceDefinition,
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
  Newspaper,
  Bird,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Play,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';

// 选题数据源每页条数（B站热榜源上限 20、热搜上限 10；微博/知乎加 ?limit=50 后可拿更多）
const PAGE_SIZE = 20;

const SOURCE_ICONS = {
  newspaper: Newspaper,
  trending: TrendingUp,
  flame: Flame,
  video: Play,
  social: Bird,
  calendar: Calendar,
} as const;

export default function StoryHubPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<TrendingTopic | null>(
    null,
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<StorySuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [adoptingId, setAdoptingId] = useState<string | null>(null);

  // News source state
  const [sourceDefinitions, setSourceDefinitions] = useState<
    TopicSourceDefinition[]
  >([]);
  const [sourceParams, setSourceParams] = useState<
    Record<string, Record<string, string | number>>
  >({});
  const [newsSourceItems, setNewsSourceItems] = useState<TopicCandidate[]>([]);
  const [newsSourceWarnings, setNewsSourceWarnings] = useState<string[]>([]);
  const [activeNewsSource, setActiveNewsSource] = useState<string | null>(null);
  const [newsSourceLoading, setNewsSourceLoading] = useState(false);
  const [newsPage, setNewsPage] = useState(1);
  const [newsPagination, setNewsPagination] = useState({
    total: 0,
    totalPages: 1,
    limit: 10,
  });

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSource, setNewSource] = useState('');
  const [newHeatScore, setNewHeatScore] = useState(50);

  useEffect(() => {
    loadTopics();
    getTopicSources()
      .then((definitions) => {
        setSourceDefinitions(definitions);
        const today = new Date().toISOString().slice(0, 10);
        setSourceParams(
          Object.fromEntries(
            definitions.map((definition) => [
              definition.id,
              Object.fromEntries(
                (definition.parameters ?? []).map((parameter) => [
                  parameter.key,
                  parameter.defaultValue ??
                    (parameter.kind === 'date' ? today : ''),
                ]),
              ),
            ]),
          ),
        );
      })
      .catch(() => setSourceDefinitions([]));
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

  async function fetchNewsSourceItems(sourceId: string, page = 1) {
    setNewsSourceLoading(true);
    setNewsSourceWarnings([]);
    setNewsPage(page);
    try {
      const definition = sourceDefinitions.find(
        (source) => source.id === sourceId,
      );
      const params = sourceParams[sourceId] ?? {};
      const missingRequiredTextParameter =
        definition?.autoFetch === false &&
        (definition.parameters ?? [])
          .filter(
            (parameter) =>
              parameter.kind === 'text' || parameter.kind === 'combobox',
          )
          .some((parameter) => !String(params[parameter.key] ?? '').trim());
      if (missingRequiredTextParameter) {
        setNewsSourceItems([]);
        setNewsSourceWarnings([]);
        setNewsPagination({ total: 0, totalPages: 1, limit: 10 });
      } else {
        const res = await getTopicSourceItems(sourceId, {
          page,
          limit: PAGE_SIZE,
          ...params,
        });
        setNewsSourceItems(res.items);
        setNewsSourceWarnings(res.warnings ?? []);
        setNewsPagination({
          total: res.total,
          totalPages: res.totalPages,
          limit: res.limit,
        });
      }
    } catch {
      setNewsSourceItems([]);
      setNewsSourceWarnings(['数据源暂时不可用，请稍后重试']);
      setNewsPagination({ total: 0, totalPages: 1, limit: 10 });
    } finally {
      setNewsSourceLoading(false);
    }
  }

  function handleLoadNewsSource(sourceId: string, page = 1) {
    setActiveNewsSource(sourceId);
    setShowAISuggestions(false);
    setSelectedTopic(null);
    const definition = sourceDefinitions.find(
      (source) => source.id === sourceId,
    );
    // manualRefresh 源（如 Google Trends）：选中标签不自动检索，等用户点「刷新」
    if (definition?.manualRefresh) {
      setNewsSourceItems([]);
      setNewsSourceWarnings([]);
      setNewsPagination({ total: 0, totalPages: 1, limit: 10 });
      setNewsPage(1);
      return;
    }
    void fetchNewsSourceItems(sourceId, page);
  }

  async function handlePageChange(page: number) {
    if (!activeNewsSource || page < 1 || page > newsPagination.totalPages)
      return;
    await fetchNewsSourceItems(activeNewsSource, page);
  }

  async function handleImportNewsItem(item: TopicCandidate) {
    try {
      await importTopic(item);
      await loadTopics();
    } catch {
      // ignore
    }
  }

  function handleSourceParamChange(
    sourceId: string,
    key: string,
    value: string | number,
  ) {
    setSourceParams((current) => ({
      ...current,
      [sourceId]: { ...current[sourceId], [key]: value },
    }));
  }

  const activeSourceDefinition = sourceDefinitions.find(
    (source) => source.id === activeNewsSource,
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar - Topic list */}
      <div className="w-80 border-r border-line bg-surface flex flex-col">
        <div className="p-4 border-b border-line">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-semibold text-foreground">选题中心</h1>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              <Plus className="h-3 w-3" />
              录入热点
            </Button>
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
            <p className="text-xs text-subtle mb-2">外部数据源</p>
            <div className="flex flex-wrap gap-1.5">
              {sourceDefinitions.map((source) => {
                const Icon = SOURCE_ICONS[source.icon] ?? Newspaper;
                const isActive = activeNewsSource === source.id;
                return (
                  <button
                    key={source.id}
                    onClick={() => handleLoadNewsSource(source.id)}
                    disabled={newsSourceLoading}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                      isActive
                        ? 'bg-orange-100 text-orange-700 border border-orange-200'
                        : 'bg-surface border border-line text-muted hover:bg-surface-muted'
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
          <form
            onSubmit={handleCreateTopic}
            className="p-4 border-b border-line space-y-3"
          >
            <input
              type="text"
              required
              placeholder="热点标题"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <textarea
              placeholder="描述（可选）"
              rows={2}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <input
              type="text"
              placeholder="来源（可选）"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">热度</span>
              <input
                type="range"
                min={0}
                max={100}
                value={newHeatScore}
                onChange={(e) => setNewHeatScore(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs font-medium w-8 text-right tnum">
                {newHeatScore}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                type="submit"
                className="flex-1"
              >
                创建
              </Button>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setShowCreateForm(false)}
              >
                取消
              </Button>
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
              className={`w-full text-left p-4 border-b border-line hover:bg-surface-muted transition-colors cursor-pointer ${
                selectedTopic?.id === topic.id ? 'bg-canvas' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-foreground truncate">
                    {topic.title}
                  </h3>
                  {topic.description && (
                    <p className="mt-1 text-xs text-muted line-clamp-2">
                      {topic.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-orange-500 tnum">
                      <Flame className="h-3 w-3" />
                      {topic.heatScore}
                    </span>
                    {topic.status === 'ADOPTED' && (
                      <Badge tone="success">已采纳</Badge>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteTopic(topic.id);
                  }}
                  className="text-subtle hover:text-red-500"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
          {topics.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-subtle">暂无热点</p>
              <p className="mt-1 text-xs text-subtle">
                点击上方按钮录入或获取 AI 推荐
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right panel - Detail or AI Suggestions or News Source */}
      <div className="flex-1 bg-canvas p-8 overflow-auto">
        {activeNewsSource && activeSourceDefinition ? (
          <NewsSourcePanel
            source={activeSourceDefinition}
            params={sourceParams[activeNewsSource] ?? {}}
            items={newsSourceItems}
            warnings={newsSourceWarnings}
            loading={newsSourceLoading}
            onImport={handleImportNewsItem}
            onClose={() => setActiveNewsSource(null)}
            page={newsPage}
            totalPages={newsPagination.totalPages}
            total={newsPagination.total}
            onPageChange={handlePageChange}
            onParamChange={(key, value) =>
              handleSourceParamChange(activeNewsSource, key, value)
            }
            onRefresh={() => fetchNewsSourceItems(activeNewsSource, 1)}
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
          <h2 className="text-xl font-semibold text-foreground">{topic.title}</h2>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted">
            <span className="flex items-center gap-1 tnum">
              <Flame className="h-4 w-4 text-orange-500" />
              热度 {topic.heatScore}
            </span>
            {topic.source && <span>来源：{topic.source}</span>}
            <Badge tone={topic.status === 'ADOPTED' ? 'success' : 'info'}>
              {topic.status === 'ADOPTED' ? '已采纳' : '开放中'}
            </Badge>
          </div>
        </div>
      </div>

      {topic.description && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-foreground mb-2">描述</h3>
          <p className="text-sm text-muted leading-relaxed">
            {topic.description}
          </p>
        </div>
      )}

      {topic.suggestedAngles && topic.suggestedAngles.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-foreground mb-2">建议角度</h3>
          <div className="space-y-2">
            {topic.suggestedAngles.map((angle, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg bg-surface border border-line p-3"
              >
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-foreground">{angle}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {topic.status !== 'ADOPTED' && (
        <Button
          variant="primary"
          loading={adopting}
          onClick={onAdopt}
        >
          {!adopting && <CheckCircle className="h-4 w-4" />}
          一键创建选题
        </Button>
      )}

      {topic.adoptedStoryId && (
        <Link
          href={`/dashboard/stories/${topic.adoptedStoryId}`}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-6 py-3 text-sm font-medium text-foreground hover:bg-surface-muted"
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
          <h2 className="text-xl font-semibold text-foreground">AI 选题推荐</h2>
        </div>
        <button onClick={onClose} className="text-subtle hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong p-8 text-center">
          <p className="text-muted">暂无推荐，请稍后重试</p>
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((suggestion, i) => (
            <div
              key={i}
              className="rounded-lg border border-line bg-surface p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-base font-medium text-foreground">
                    {suggestion.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    {suggestion.description}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-foreground">
                      {suggestion.suggestedAngle}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-subtle">
                    {suggestion.reason}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  loading={adoptingId === 'suggestion'}
                  onClick={() => onAdopt(suggestion)}
                >
                  {!(adoptingId === 'suggestion') && <Plus className="h-3 w-3" />}
                  采纳
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewsSourcePanel({
  source,
  params,
  items,
  warnings,
  loading,
  onImport,
  onClose,
  page,
  totalPages,
  total,
  onPageChange,
  onParamChange,
  onRefresh,
}: {
  source: TopicSourceDefinition;
  params: Record<string, string | number>;
  items: TopicCandidate[];
  warnings: string[];
  loading: boolean;
  onImport: (item: TopicCandidate) => void;
  onClose: () => void;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onParamChange: (key: string, value: string | number) => void;
  onRefresh: () => void;
}) {
  const Icon = SOURCE_ICONS[source.icon] ?? Newspaper;
  const isThisDay = source.id === 'this-day';

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-orange-600" />
          <h2 className="text-xl font-semibold text-foreground">{source.label}</h2>
        </div>
        <button onClick={onClose} className="text-subtle hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3">
        {(source.parameters ?? []).map((parameter) => (
          <label key={parameter.key} className="flex min-w-32 flex-col gap-1">
            <span className="text-xs text-muted">{parameter.label}</span>
            {parameter.kind === 'select' ? (
              <select
                value={params[parameter.key] ?? parameter.defaultValue ?? ''}
                onChange={(event) => {
                  const option = parameter.options.find(
                    (candidate) =>
                      String(candidate.value) === event.target.value,
                  );
                  onParamChange(
                    parameter.key,
                    option?.value ?? event.target.value,
                  );
                }}
                className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                {parameter.options.map((option) => (
                  <option key={String(option.value)} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : parameter.kind === 'combobox' ? (
              <>
                <input
                  type="text"
                  list={`${source.id}-${parameter.key}-options`}
                  value={params[parameter.key] ?? parameter.defaultValue ?? ''}
                  placeholder={parameter.placeholder}
                  onChange={(event) =>
                    onParamChange(parameter.key, event.target.value)
                  }
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                <datalist id={`${source.id}-${parameter.key}-options`}>
                  {(parameter.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </datalist>
              </>
            ) : (
              <input
                type={parameter.kind}
                value={params[parameter.key] ?? parameter.defaultValue ?? ''}
                placeholder={parameter.placeholder}
                onChange={(event) =>
                  onParamChange(parameter.key, event.target.value)
                }
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            )}
          </label>
        ))}
        <Button
          variant="primary"
          size="sm"
          loading={loading}
          onClick={onRefresh}
        >
          {source.autoFetch === false ? '加载' : '刷新'}
        </Button>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {warnings.join('；')}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong p-8 text-center">
          <p className="text-muted">
            {source.manualRefresh
              ? '点击「刷新」获取最新数据'
              : source.autoFetch === false
                ? '请填写上方参数后加载'
                : '暂无数据，请稍后重试'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-lg border border-line bg-surface p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-medium text-foreground">
                      {item.title}
                    </h3>
                    <span className="rounded bg-orange-50 px-1.5 py-0.5 text-xs font-medium text-orange-600 tnum">
                      热度 {item.heatScore}
                    </span>
                    {isThisDay && item.year && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                        {item.year > 0
                          ? `${item.year}年`
                          : `公元前${Math.abs(item.year)}年`}
                      </span>
                    )}
                    {isThisDay && item.type && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-600">
                        {item.type}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {item.description}
                  </p>
                  {isThisDay && item.coverImage && (
                    // Wikipedia 外部缩略图，用 next/image 需配 remotePatterns，暂用 img
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.coverImage}
                      alt=""
                      loading="lazy"
                      className="mt-3 h-32 w-auto rounded-lg border border-line object-cover"
                    />
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.tags.slice(0, 5).map((tag, j) => (
                        <span
                          key={j}
                          className="rounded bg-surface-muted px-2 py-0.5 text-xs text-muted"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {isThisDay && item.articles && item.articles.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-subtle mb-1">相关词条</p>
                      <div className="flex flex-wrap gap-2">
                        {item.articles
                          .filter((a) => a.url)
                          .slice(0, 5)
                          .map((a, j) => (
                            <a
                              key={j}
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {a.title}
                            </a>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onImport(item)}
                >
                  <Plus className="h-3 w-3" />
                  导入系统
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-line">
          <div className="text-sm text-muted tnum">
            共 {total} 条，第 {page}/{totalPages} 页
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onGetSuggestions }: { onGetSuggestions: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="rounded-full bg-surface-muted p-4 mb-4">
        <Lightbulb className="h-8 w-8 text-subtle" />
      </div>
      <h3 className="text-lg font-medium text-foreground">选题中心</h3>
      <p className="mt-2 text-sm text-muted max-w-sm">
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
