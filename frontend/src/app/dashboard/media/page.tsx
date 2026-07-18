'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getMediaAssets,
  deleteMedia,
  updateMedia,
  type MediaAsset,
  type GetMediaParams,
} from '@/lib/media-api';
import { MediaSource } from '@cms-ng/shared';
import { ImageUploader } from '@/components/image-uploader';
import { Button, PageHeader, Input, Card, Badge } from '@/components/ui';
import {
  Search,
  SearchX,
  Trash2,
  X,
  Upload,
  Sparkles,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Images,
  ImagePlus,
} from 'lucide-react';

const PAGE_SIZE = 24;
const SKELETON_COUNT = 12;

const SOURCE_LABEL: Record<string, string> = {
  UPLOAD: '上传',
  AI_GENERATED: 'AI 生成',
};

const SOURCE_FILTERS: { value: MediaSource | ''; label: string }[] = [
  { value: '', label: '全部' },
  { value: MediaSource.UPLOAD, label: '上传' },
  { value: MediaSource.AI_GENERATED, label: 'AI 生成' },
];

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** 网格卡片左上角的来源徽章：AI 生成用品牌渐变，上传用深色半透 */
function SourceBadge({ source, className }: { source: string; className?: string }) {
  const isAI = source === MediaSource.AI_GENERATED;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm ${
        isAI ? 'brand-gradient' : 'bg-black/55 backdrop-blur-sm'
      } ${className ?? ''}`}
    >
      {isAI && <Sparkles className="h-3 w-3" />}
      {SOURCE_LABEL[source] ?? source}
    </span>
  );
}

export default function MediaLibraryPage() {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<MediaSource | ''>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: GetMediaParams = { page, pageSize: PAGE_SIZE };
      if (source) params.source = source;
      if (search) params.search = search;
      const res = await getMediaAssets(params);
      setItems(res.data);
      setTotal(res.meta.total);
      setTotalPages(res.meta.totalPages);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount/过滤变更触发,刻意不把 loadX 入 deps 避免重复请求
  }, [page, source, search, refreshKey]);

  useEffect(() => {
    // 数据获取模式（fetch-in-effect）：React 19 set-state-in-effect 规则对此过严
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const onUploaded = () => {
    setShowUpload(false);
    setPage(1);
    setRefreshKey((k) => k + 1);
  };

  const onSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const isFiltering = Boolean(search || source);

  // 关键词 chip：只清搜索，不动来源筛选
  const onClearSearch = () => {
    setSearch('');
    setSearchInput('');
  };

  // 空态「清除筛选条件」：搜索 + 来源一起清
  const onClearFilters = () => {
    setPage(1);
    setSource('');
    setSearch('');
    setSearchInput('');
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('确认删除该图片？COS 对象将一并删除，不可恢复。')) return;
    try {
      await deleteMedia(id);
      setSelected(null);
      // 删空当前页且不在第 1 页时回退一页，避免陷入越界空页
      if (items.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        void load();
      }
    } catch {
      // 错误已由 api 拦截器 toast
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        title="媒体库"
        subtitle={
          <>
            管理上传与 AI 生成的图片，共 <span className="tnum">{total}</span> 项
          </>
        }
        actions={
          <Button onClick={() => setShowUpload((v) => !v)}>
            <Upload className="h-4 w-4" />
            上传图片
          </Button>
        }
      />

      {showUpload && (
        <Card className="mb-5">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">上传图片</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="关闭上传面板"
              title="关闭上传面板"
              onClick={() => setShowUpload(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-5">
            <ImageUploader onUploaded={onUploaded} />
          </div>
        </Card>
      )}

      {/* 筛选 + 搜索 */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-0.5 rounded-lg bg-surface-muted p-1 ring-1 ring-line">
          {SOURCE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setSource(f.value);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                source === f.value
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-72">
            <Input
              leftIcon={<Search className="h-4 w-4" />}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              placeholder="搜索文件名/alt/prompt"
            />
          </div>
          <Button variant="secondary" onClick={onSearch}>
            搜索
          </Button>
        </div>
        {search && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-soft-text">
            关键词：{search}
            <button
              onClick={onClearSearch}
              className="rounded-full p-0.5 transition-colors hover:bg-brand/10"
              title="清除关键词"
              aria-label="清除关键词"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      {/* 网格 */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-line bg-surface shadow-card"
            >
              <div className="aspect-[4/3] animate-pulse bg-surface-muted" />
              <div className="space-y-2 px-3 py-2.5">
                <div className="h-2.5 w-3/4 animate-pulse rounded bg-surface-muted" />
                <div className="h-2 w-1/2 animate-pulse rounded bg-surface-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 && total > 0 ? (
        /* 越界页：库里有内容但当前页为空（如他端删除导致页数收缩） */
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">当前页没有内容</p>
          <p className="mt-1 text-xs text-muted">
            共 <span className="tnum">{total}</span> 项，页数可能已变化
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setPage(1)}>
            返回第 1 页
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft">
            {isFiltering ? (
              <SearchX className="h-5 w-5 text-brand" />
            ) : (
              <Images className="h-5 w-5 text-brand" />
            )}
          </div>
          <p className="text-sm font-medium text-foreground">
            {isFiltering ? '没有找到匹配的图片' : '媒体库还是空的'}
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted">
            {isFiltering
              ? '换个关键词或来源筛选试试'
              : '上传本地图片，或在稿件编辑器中让 AI 生成配图'}
          </p>
          {isFiltering ? (
            <Button variant="secondary" size="sm" className="mt-4" onClick={onClearFilters}>
              清除筛选条件
            </Button>
          ) : (
            <Button size="sm" className="mt-4" onClick={() => setShowUpload(true)}>
              <ImagePlus className="h-4 w-4" />
              上传第一张图片
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((asset) => (
            <button
              key={asset.id}
              onClick={() => setSelected(asset)}
              title={asset.fileName}
              className="group block w-full overflow-hidden rounded-xl border border-line bg-surface text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-pop focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.thumbnailUrl ?? asset.url}
                  alt={asset.altText ?? asset.fileName}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <SourceBadge source={asset.source} className="absolute left-2 top-2" />
              </div>
              <div className="px-3 py-2.5">
                <div className="truncate text-xs font-medium text-foreground">
                  {asset.fileName}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-subtle tnum">
                  <span>
                    {asset.width && asset.height
                      ? `${asset.width}×${asset.height}`
                      : (SOURCE_LABEL[asset.source] ?? asset.source)}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{formatSize(asset.size)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 分页：按总数常驻，翻页时不再跳动 */}
      {total > 0 && (
        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-muted tnum">
            共 {total} 项 · 第 {page} / {totalPages} 页
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                上一页
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {selected && (
        <MediaDetailDrawer
          asset={selected}
          onClose={() => setSelected(null)}
          onDelete={() => onDelete(selected.id)}
          onSaved={() => {
            void load();
          }}
        />
      )}
    </div>
  );
}

/** 详情抽屉：预览 + 编辑元信息 + 删除 */
function MediaDetailDrawer({
  asset,
  onClose,
  onDelete,
  onSaved,
}: {
  asset: MediaAsset;
  onClose: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [altText, setAltText] = useState(asset.altText ?? '');
  const [title, setTitle] = useState(asset.title ?? '');
  const [tagsInput, setTagsInput] = useState((asset.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Esc 关闭抽屉（跳过 IME 组词态，避免取消拼音候选时误关）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onSave = async () => {
    setSaving(true);
    try {
      await updateMedia(asset.id, {
        altText,
        title,
        tags: tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onSaved();
      onClose();
    } catch {
      // 错误已由 api 拦截器 toast
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(asset.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isAI = asset.source === MediaSource.AI_GENERATED;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-label="图片详情"
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-pop"
      >
        {/* 头部 */}
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">图片详情</h2>
            <Badge tone={isAI ? 'brand' : 'neutral'}>
              {isAI && <Sparkles className="mr-1 h-3 w-3" />}
              {SOURCE_LABEL[asset.source] ?? asset.source}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" aria-label="关闭" title="关闭" autoFocus onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* 内容 */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="overflow-hidden rounded-lg bg-surface-muted ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.url}
              alt={asset.altText ?? asset.fileName}
              className="max-h-64 w-full object-contain"
            />
          </div>

          <Button variant="secondary" className="w-full" onClick={copyUrl}>
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? '已复制' : '复制 URL'}
          </Button>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">类型</dt>
              <dd className="mt-0.5 text-xs text-foreground tnum">{asset.mimeType}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">尺寸</dt>
              <dd className="mt-0.5 text-xs text-foreground tnum">
                {asset.width && asset.height ? `${asset.width}×${asset.height}` : '-'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">大小</dt>
              <dd className="mt-0.5 text-xs text-foreground tnum">{formatSize(asset.size)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                创建时间
              </dt>
              <dd className="mt-0.5 text-xs text-foreground tnum">
                {new Date(asset.createdAt).toLocaleString()}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                文件名
              </dt>
              <dd className="mt-0.5 break-all text-xs text-foreground">{asset.fileName}</dd>
            </div>
            {asset.prompt && (
              <div className="col-span-2">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                  Prompt
                </dt>
                <dd className="mt-1 rounded-lg bg-surface-muted p-3 text-xs leading-relaxed text-muted">
                  {asset.prompt}
                </dd>
              </div>
            )}
          </dl>

          <div className="border-t border-line pt-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              编辑元信息
            </h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">标题</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Alt 替换文本（无障碍 + SEO）
                </label>
                <Input value={altText} onChange={(e) => setAltText(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">标签（逗号分隔）</label>
                <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-5 py-3">
          {/* 原生 button 自带样式：Button ghost 变体与 className 覆盖在同属性上会冲突（cn 无 tailwind-merge），hover 底色不可控 */}
          <button
            onClick={onDelete}
            className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-red-600 outline-none transition hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500/40"
          >
            <Trash2 className="h-4 w-4" />
            删除
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button loading={saving} onClick={onSave}>
              保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
