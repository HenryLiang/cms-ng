'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getMediaAssets,
  type MediaAsset,
  type GetMediaParams,
} from '@/lib/media-api';
import { MediaSource } from '@cms-ng/shared';
import { ImageUploader } from './image-uploader';
import { Button } from '@/components/ui';
import {
  Search,
  X,
  Upload,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface MediaPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (asset: MediaAsset) => void;
}

const PAGE_SIZE = 24;

const SOURCE_FILTERS: { value: MediaSource | ''; label: string }[] = [
  { value: '', label: '全部' },
  { value: MediaSource.UPLOAD, label: '上传' },
  { value: MediaSource.AI_GENERATED, label: 'AI 生成' },
];

/**
 * 媒体选择器：Modal 内浏览媒体库、回车搜索、内嵌上传、翻页，选中后回调。
 * 用于文章封面选择、TipTap 正文插图等场景。
 */
export function MediaPicker({ open, onClose, onPick }: MediaPickerProps) {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<MediaSource | ''>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const params: GetMediaParams = { page, pageSize: PAGE_SIZE };
      if (source) params.source = source;
      if (search) params.search = search;
      const res = await getMediaAssets(params);
      // 仅采用最新请求的结果，防陈旧覆盖
      if (reqId !== reqIdRef.current) return;
      setItems(res.data);
      setTotalPages(res.meta.totalPages);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [source, search, page]);

  // open 切为 true 时重置筛选与选中（搜索/翻页时不清选中）
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) {
      setSelectedId(null);
      setSearchInput('');
      setSearch('');
      setSource('');
      setPage(1);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  // 加载（open 时；依赖 load，搜索/翻页触发）
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load();
    }
  }, [open, load]);

  if (!open) return null;

  const onSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const confirm = () => {
    const asset = items.find((a) => a.id === selectedId);
    if (asset) {
      onPick(asset);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface shadow-pop">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">选择图片</h2>
          <button onClick={onClose} className="text-subtle hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
          <div className="flex items-center gap-1 rounded-lg bg-surface-muted p-0.5">
            {SOURCE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => {
                  setSource(f.value);
                  setPage(1);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  source === f.value
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              placeholder="搜索文件名/alt/prompt（回车）"
              className="w-full rounded-lg border border-line-strong bg-surface py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={onSearch}>
            搜索
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowUpload((v) => !v)}
          >
            <Upload className="h-3.5 w-3.5" />
            上传
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {showUpload && (
            <div className="mb-4">
              <ImageUploader
                onUploaded={() => {
                  setShowUpload(false);
                  void load();
                }}
              />
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-sm text-subtle">
              暂无图片，点击「上传」添加
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {items.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => setSelectedId(asset.id)}
                  className={`group relative overflow-hidden rounded-lg bg-surface-muted ring-2 transition-all ${
                    selectedId === asset.id
                      ? 'ring-brand'
                      : 'ring-transparent hover:ring-line-strong'
                  }`}
                >
                  <div className="aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.thumbnailUrl ?? asset.url}
                      alt={asset.altText ?? asset.fileName}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  {selectedId === asset.id && (
                    <div className="absolute right-1 top-1 rounded-full bg-brand p-0.5">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <div className="truncate bg-surface px-1.5 py-1 text-[10px] text-muted">
                    {asset.fileName}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <div className="flex items-center gap-1 text-xs text-muted">
            {totalPages > 1 && (
              <>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded p-1 hover:bg-surface-muted disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded p-1 hover:bg-surface-muted disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" onClick={confirm} disabled={!selectedId}>
              确认选择
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
