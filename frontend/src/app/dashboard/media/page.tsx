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
import {
  Loader2,
  Search,
  Trash2,
  X,
  Upload,
  Sparkles,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const PAGE_SIZE = 24;

const SOURCE_LABEL: Record<string, string> = {
  UPLOAD: '上传',
  AI_GENERATED: 'AI 生成',
};

const SOURCE_FILTERS: { value: MediaSource | ''; label: string }[] = [
  { value: '', label: '全部' },
  { value: MediaSource.UPLOAD, label: '上传' },
  { value: MediaSource.AI_GENERATED, label: 'AI 生成' },
];

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

  const onDelete = async (id: string) => {
    if (!window.confirm('确认删除该图片？COS 对象将一并删除，不可恢复。')) return;
    try {
      await deleteMedia(id);
      setSelected(null);
      void load();
    } catch {
      // 错误已由 api 拦截器 toast
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">媒体库</h1>
          <p className="mt-1 text-sm text-zinc-500">
            管理上传与 AI 生成的图片，共 {total} 项
          </p>
        </div>
        <button
          onClick={() => setShowUpload((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <Upload className="h-4 w-4" />
          上传图片
        </button>
      </div>

      {showUpload && (
        <ImageUploader onUploaded={onUploaded} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-zinc-200" />
      )}

      {/* 筛选 + 搜索 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-white p-1 ring-1 ring-zinc-200">
          {SOURCE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setSource(f.value);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                source === f.value
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearch()}
              placeholder="搜索文件名/alt/prompt"
              className="w-64 rounded-lg border border-zinc-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={onSearch}
            className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
          >
            搜索
          </button>
        </div>
      </div>

      {/* 网格 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-zinc-400">
          <Sparkles className="h-10 w-10" />
          <p className="text-sm">暂无图片，点击右上角上传</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((asset) => (
            <button
              key={asset.id}
              onClick={() => setSelected(asset)}
              className="group overflow-hidden rounded-lg bg-white ring-1 ring-zinc-200 transition-shadow hover:ring-2 hover:ring-blue-400"
            >
              <div className="relative aspect-square overflow-hidden bg-zinc-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.thumbnailUrl ?? asset.url}
                  alt={asset.altText ?? asset.fileName}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {SOURCE_LABEL[asset.source] ?? asset.source}
                </span>
              </div>
              <div className="truncate px-2 py-1.5 text-xs text-zinc-600">
                {asset.fileName}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm text-zinc-600">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
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

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">图片详情</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.url}
            alt={asset.altText ?? asset.fileName}
            className="w-full rounded-lg bg-zinc-100 object-contain"
          />

          <button
            onClick={copyUrl}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            {copied ? '已复制' : '复制 URL'}
          </button>

          <dl className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
            <div>来源：{SOURCE_LABEL[asset.source] ?? asset.source}</div>
            <div>类型：{asset.mimeType}</div>
            <div>尺寸：{asset.width && asset.height ? `${asset.width}×${asset.height}` : '-'}</div>
            <div>大小：{(asset.size / 1024).toFixed(1)} KB</div>
            <div className="col-span-2 truncate">文件名：{asset.fileName}</div>
            <div className="col-span-2">
              创建：{new Date(asset.createdAt).toLocaleString()}
            </div>
            {asset.prompt && (
              <div className="col-span-2">
                <dt className="mb-0.5 font-medium text-zinc-600">Prompt</dt>
                <dd className="text-zinc-500">{asset.prompt}</dd>
              </div>
            )}
          </dl>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-600">标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-600">
              Alt 替换文本（无障碍 + SEO）
            </label>
            <input
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-600">
              标签（逗号分隔）
            </label>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center gap-2 border-t border-zinc-200 bg-white px-4 py-3">
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            删除
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
