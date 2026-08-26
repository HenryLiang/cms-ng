'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  getMediaAssets,
  deleteMedia,
  updateMedia,
  retagMedia,
  type MediaAsset,
  type GetMediaParams,
} from '@/lib/media-api';
import { MediaSource, MediaTagStatus } from '@cms-ng/shared';
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
  RefreshCw,
  AlertCircle,
  Loader2,
} from 'lucide-react';

const PAGE_SIZE = 24;
const SKELETON_COUNT = 12;

/** 来源文案标签(i18n 词典驱动);未知来源回退原始枚举值 */
function useSourceLabels(): Record<string, string> {
  const t = useTranslations('media');
  return {
    [MediaSource.UPLOAD]: t('source.upload'),
    [MediaSource.AI_GENERATED]: t('source.aiGenerated'),
  };
}

/** 打标状态角标:NONE 不显示 */
function TagStatusBadge({
  status,
  error,
}: {
  status: MediaTagStatus;
  error?: string | null;
}) {
  const t = useTranslations('media');
  if (status === MediaTagStatus.NONE || status === MediaTagStatus.DONE) {
  return null;
  }
  if (status === MediaTagStatus.PENDING || status === MediaTagStatus.TAGGING) {
    return (
      <span
        title={t('tagging.inProgressTitle')}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('tagging.inProgress')}
      </span>
    );
  }
  // FAILED
  return (
    <span
      title={error ? t('tagging.failedWithError', { error }) : t('tagging.failed')}
      className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-red-600/85 px-1.5 py-0.5 text-[10px] font-medium text-white"
    >
      <AlertCircle className="h-3 w-3" />
      {t('tagging.failed')}
    </span>
  );
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** 网格卡片左上角的来源徽章：AI 生成用品牌渐变，上传用深色半透 */
function SourceBadge({ source, className }: { source: string; className?: string }) {
  const sourceLabel = useSourceLabels();
  const isAI = source === MediaSource.AI_GENERATED;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm ${
        isAI ? 'brand-gradient' : 'bg-black/55 backdrop-blur-sm'
      } ${className ?? ''}`}
    >
      {isAI && <Sparkles className="h-3 w-3" />}
      {sourceLabel[source] ?? source}
    </span>
  );
}

export default function MediaLibraryPage() {
  const t = useTranslations('media');
  const tCommon = useTranslations('common');
  const sourceLabel = useSourceLabels();
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<MediaSource | ''>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [tag, setTag] = useState('');
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const sourceFilters: { value: MediaSource | ''; label: string }[] = [
    { value: '', label: tCommon('state.all') },
    { value: MediaSource.UPLOAD, label: t('source.upload') },
    { value: MediaSource.AI_GENERATED, label: t('source.aiGenerated') },
  ];

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const params: GetMediaParams = { page, pageSize: PAGE_SIZE };
      if (source) params.source = source;
      if (search) params.search = search;
      if (tag) params.tag = tag;
      const res = await getMediaAssets(params);
      setItems(res.data);
      setTotal(res.meta.total);
      setTotalPages(res.meta.totalPages);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount/过滤变更触发,刻意不把 loadX 入 deps 避免重复请求
  }, [page, source, search, tag, refreshKey]);

  useEffect(() => {
    // 数据获取模式（fetch-in-effect）：React 19 set-state-in-effect 规则对此过严
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // 打标是后端异步任务(上传/retag 后 PENDING->TAGGING->DONE,~30-40s)。
  // 列表里有未完成打标时,静默轮询(silent 不闪 loading)直到全部完成/失败,自动停。
  useEffect(() => {
    const hasPending = items.some(
      (a) =>
        a.tagStatus === MediaTagStatus.PENDING ||
        a.tagStatus === MediaTagStatus.TAGGING,
    );
    if (!hasPending) return;
    const timer = setInterval(() => void load({ silent: true }), 5000);
    return () => clearInterval(timer);
  }, [items, load]);

  // 轮询刷新后同步详情面板:tagStatus 变化(如 TAGGING->DONE)时更新 selected,
  // 使打开的抽屉实时反映新 aiTags/altText,无需手动关闭重开。
  useEffect(() => {
    if (!selected) return;
    const fresh = items.find((a) => a.id === selected.id);
    if (fresh && fresh.tagStatus !== selected.tagStatus) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 条件同步:仅在 tagStatus 变化时更新,不构成循环
      setSelected(fresh);
    }
  }, [items, selected]);

  const onUploaded = () => {
    setShowUpload(false);
    setPage(1);
    setRefreshKey((k) => k + 1);
  };

  const onSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const isFiltering = Boolean(search || source || tag);

  // 关键词 chip：只清搜索，不动来源/标签筛选
  const onClearSearch = () => {
    setSearch('');
    setSearchInput('');
  };

  // 点击标签 chip:以该 tag 过滤列表
  const onTagClick = (tag: string) => {
    setTag(tag);
    setPage(1);
  };

  const onClearTag = () => {
    setTag('');
  };

  // 空态「清除筛选条件」：搜索 + 来源 + 标签一起清
  const onClearFilters = () => {
    setPage(1);
    setSource('');
    setSearch('');
    setSearchInput('');
    setTag('');
  };

  const onDelete = async (id: string) => {
    if (!window.confirm(t('deleteConfirm'))) return;
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
        title={t('title')}
        subtitle={
          <>
            {t('subtitlePre')} <span className="tnum">{total}</span> {t('subtitlePost')}
          </>
        }
        actions={
          <Button onClick={() => setShowUpload((v) => !v)}>
            <Upload className="h-4 w-4" />
            {t('uploadImage')}
          </Button>
        }
      />

      {showUpload && (
        <Card className="mb-5">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">{t('uploadImage')}</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('closeUploadPanel')}
              title={t('closeUploadPanel')}
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
          {sourceFilters.map((f) => (
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
              placeholder={t('searchPlaceholder')}
            />
          </div>
          <Button variant="secondary" onClick={onSearch}>
            {tCommon('actions.search')}
          </Button>
        </div>
        {search && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-soft-text">
            {t('keywordChip', { keyword: search })}
            <button
              onClick={onClearSearch}
              className="rounded-full p-0.5 transition-colors hover:bg-brand/10"
              title={t('clearKeyword')}
              aria-label={t('clearKeyword')}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
        {tag && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-soft-text">
            {t('tagChip', { tag })}
            <button
              onClick={onClearTag}
              className="rounded-full p-0.5 transition-colors hover:bg-brand/10"
              title={t('clearTag')}
              aria-label={t('clearTag')}
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
          <p className="text-sm font-medium text-foreground">{t('outOfRange.title')}</p>
          <p className="mt-1 text-xs text-muted">
            {t('outOfRange.descPre')} <span className="tnum">{total}</span> {t('outOfRange.descPost')}
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setPage(1)}>
            {t('outOfRange.backToFirst')}
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
            {isFiltering ? t('empty.filteredTitle') : t('empty.title')}
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted">
            {isFiltering ? t('empty.filteredDesc') : t('empty.desc')}
          </p>
          {isFiltering ? (
            <Button variant="secondary" size="sm" className="mt-4" onClick={onClearFilters}>
              {t('empty.clearFilters')}
            </Button>
          ) : (
            <Button size="sm" className="mt-4" onClick={() => setShowUpload(true)}>
              <ImagePlus className="h-4 w-4" />
              {t('empty.uploadFirst')}
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
                {asset.mimeType.startsWith('video/') ? (
                  <>
                    <video
                      src={asset.url}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tnum">
                      {asset.duration ? `${asset.duration}s` : t('videoLabel')}
                    </span>
                  </>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={asset.thumbnailUrl ?? asset.url}
                    alt={asset.altText ?? asset.fileName}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                )}
                <SourceBadge source={asset.source} className="absolute left-2 top-2" />
                <TagStatusBadge status={asset.tagStatus} error={asset.tagError} />
              </div>
              <div className="px-3 py-2.5">
                <div className="truncate text-xs font-medium text-foreground">
                  {asset.fileName}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-subtle tnum">
                  <span>
                    {asset.width && asset.height
                      ? `${asset.width}×${asset.height}`
                      : (sourceLabel[asset.source] ?? asset.source)}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{formatSize(asset.size)}</span>
                </div>
                {/* 标签 chip 行:人工 tags + AI aiTags 合并去重,点击过滤 */}
                {(() => {
                  const allTags = [
                    ...asset.tags,
                    ...asset.aiTags.filter((tag) => !asset.tags.includes(tag)),
                  ].slice(0, 4);
                  if (allTags.length === 0) return null;
                  return (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {allTags.map((tag) => (
                        <span
                          key={tag}
                          role="button"
                          tabIndex={0}
                          aria-label={t('grid.filterByTagAria', { tag })}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTagClick(tag);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              onTagClick(tag);
                            }
                          }}
                          className="cursor-pointer truncate rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:bg-brand-soft hover:text-brand-soft-text focus:outline-none focus:ring-1 focus:ring-brand"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 分页：按总数常驻，翻页时不再跳动 */}
      {total > 0 && (
        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-muted tnum">
            {t('pagination.summary', { total, page, totalPages })}
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
                {tCommon('pagination.prev')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                {tCommon('pagination.next')}
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
          onRetagged={(updated) => {
            setSelected(updated);
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
  onRetagged,
}: {
  asset: MediaAsset;
  onClose: () => void;
  onDelete: () => void;
  onSaved: () => void;
  onRetagged: (updated: MediaAsset) => void;
}) {
  const t = useTranslations('media');
  const tCommon = useTranslations('common');
  const sourceLabel = useSourceLabels();
  const [altText, setAltText] = useState(asset.altText ?? '');
  const [title, setTitle] = useState(asset.title ?? '');
  const [tagsInput, setTagsInput] = useState((asset.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [retagging, setRetagging] = useState(false);
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
          .map((tag) => tag.trim())
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

  const onRetag = async () => {
    setRetagging(true);
    try {
      const updated = await retagMedia(asset.id);
      onRetagged(updated);
    } catch {
      // 错误已由 api 拦截器 toast
    } finally {
      setRetagging(false);
    }
  };

  const isAI = asset.source === MediaSource.AI_GENERATED;
  // altText AI 来源标记(启发式:有 AI 标签且 altText 非空,通常由自动打标回填)
  const altFromAI =
    (asset.aiTags?.length ?? 0) > 0 && Boolean(asset.altText);
  // 仅 PENDING(排队中,即将处理)禁用 retag;TAGGING 允许触发--后端对活跃 in-flight
  // TAGGING 返 409,对僵尸 TAGGING(>10min)允许强制重打,使卡死资产有 UI 自愈入口
  const canRetag = asset.tagStatus !== MediaTagStatus.PENDING;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-label={t('detail.dialogTitle')}
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-pop"
      >
        {/* 头部 */}
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t('detail.dialogTitle')}</h2>
            <Badge tone={isAI ? 'brand' : 'neutral'}>
              {isAI && <Sparkles className="mr-1 h-3 w-3" />}
              {sourceLabel[asset.source] ?? asset.source}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" aria-label={tCommon('actions.close')} title={tCommon('actions.close')} autoFocus onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* 内容 */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="overflow-hidden rounded-lg bg-surface-muted ring-1 ring-line">
            {asset.mimeType.startsWith('video/') ? (
              <video
                src={asset.url}
                controls
                playsInline
                preload="metadata"
                className="max-h-64 w-full object-contain"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={asset.url}
                alt={asset.altText ?? asset.fileName}
                className="max-h-64 w-full object-contain"
              />
            )}
          </div>

          <Button variant="secondary" className="w-full" onClick={copyUrl}>
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? tCommon('actions.copied') : t('detail.copyUrl')}
          </Button>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">{t('detail.fieldType')}</dt>
              <dd className="mt-0.5 text-xs text-foreground tnum">{asset.mimeType}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">{t('detail.fieldDimensions')}</dt>
              <dd className="mt-0.5 text-xs text-foreground tnum">
                {asset.width && asset.height ? `${asset.width}×${asset.height}` : '-'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">{t('detail.fieldSize')}</dt>
              <dd className="mt-0.5 text-xs text-foreground tnum">{formatSize(asset.size)}</dd>
            </div>
            {asset.duration != null && (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">{t('detail.fieldDuration')}</dt>
                <dd className="mt-0.5 text-xs text-foreground tnum">{t('detail.durationSeconds', { duration: asset.duration })}</dd>
              </div>
            )}
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                {t('detail.fieldCreatedAt')}
              </dt>
              <dd className="mt-0.5 text-xs text-foreground tnum">
                {new Date(asset.createdAt).toLocaleString()}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                {t('detail.fieldFileName')}
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

          {/* AI 自动标签(只读,人工标签在下方编辑) */}
          {(() => {
            const aiTags = asset.aiTags ?? [];
            if (aiTags.length === 0 && asset.tagStatus === MediaTagStatus.NONE)
              return null;
            return (
              <div className="border-t border-line pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
                    {t('tagging.title')}
                  </h3>
                  {asset.tagStatus === MediaTagStatus.FAILED && (
                    <span className="text-[11px] text-red-600">
                      {asset.tagError
                        ? t('tagging.failedWithError', { error: asset.tagError })
                        : t('tagging.failed')}
                    </span>
                  )}
                  {asset.tagStatus === MediaTagStatus.PENDING && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-subtle">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t('tagging.inProgressEllipsis')}
                    </span>
                  )}
                </div>
                {aiTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {aiTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] text-brand-soft-text"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-subtle">{t('tagging.empty')}</p>
                )}
              </div>
            );
          })()}

          <div className="border-t border-line pt-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              {t('detail.editMeta')}
            </h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">{t('detail.fieldTitle')}</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                  {t('detail.altLabel')}
                  {altFromAI && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-normal text-brand-soft-text">
                      <Sparkles className="h-2.5 w-2.5" />
                      {t('source.aiGenerated')}
                    </span>
                  )}
                </label>
                <Input value={altText} onChange={(e) => setAltText(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">{t('detail.tagsLabel')}</label>
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
            {tCommon('actions.delete')}
          </button>
          {/* 重新打标:调用视觉大模型重新生成 AI 标签(每次=一次付费调用) */}
          <Button
            variant="secondary"
            size="sm"
            loading={retagging}
            disabled={!canRetag}
            onClick={onRetag}
            title={canRetag ? t('tagging.retagTitle') : t('tagging.retagDisabledTitle')}
          >
            <RefreshCw className="h-4 w-4" />
            {t('tagging.retag')}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              {tCommon('actions.cancel')}
            </Button>
            <Button loading={saving} onClick={onSave}>
              {tCommon('actions.save')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
