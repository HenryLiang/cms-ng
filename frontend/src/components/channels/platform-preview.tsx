'use client';

import { Platform, PublishStatus } from '@cms-ng/shared';
import { type PlatformPublish } from '@/lib/channel-api';
import { Globe, Share2, Camera, MessageSquare, MessageCircle, MonitorSmartphone, BookOpen, Play, Bell, Copy, Check, ExternalLink, RefreshCw, Trash2, Loader2, Upload } from 'lucide-react';
import { useState } from 'react';

const PLATFORM_ICONS: Record<Platform, React.ReactNode> = {
  [Platform.WEBSITE]: <Globe className="h-4 w-4" />,
  [Platform.FACEBOOK]: <Share2 className="h-4 w-4" />,
  [Platform.INSTAGRAM]: <Camera className="h-4 w-4" />,
  [Platform.X]: <MessageSquare className="h-4 w-4" />,
  [Platform.THREADS]: <MessageCircle className="h-4 w-4" />,
  [Platform.LINKEDIN]: <MonitorSmartphone className="h-4 w-4" />,
  [Platform.XIAOHONGSHU]: <BookOpen className="h-4 w-4" />,
  [Platform.YOUTUBE]: <Play className="h-4 w-4" />,
  [Platform.PUSH]: <Bell className="h-4 w-4" />,
  [Platform.WORDPRESS]: <Globe className="h-4 w-4" />,
};

const PLATFORM_NAMES: Record<Platform, string> = {
  [Platform.WEBSITE]: '官网/APP',
  [Platform.FACEBOOK]: 'Facebook',
  [Platform.INSTAGRAM]: 'Instagram',
  [Platform.X]: 'X / Twitter',
  [Platform.THREADS]: 'Threads',
  [Platform.LINKEDIN]: 'LinkedIn',
  [Platform.XIAOHONGSHU]: '小红书',
  [Platform.YOUTUBE]: 'YouTube',
  [Platform.PUSH]: '即时推送',
  [Platform.WORDPRESS]: 'WordPress',
};

const STATUS_COLORS: Record<PublishStatus, string> = {
  [PublishStatus.DRAFT]: 'bg-zinc-100 text-zinc-600',
  [PublishStatus.GENERATING]: 'bg-purple-100 text-purple-700',
  [PublishStatus.READY]: 'bg-emerald-100 text-emerald-700',
  [PublishStatus.SCHEDULED]: 'bg-blue-100 text-blue-700',
  [PublishStatus.PUBLISHED]: 'bg-emerald-100 text-emerald-700',
  [PublishStatus.FAILED]: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<PublishStatus, string> = {
  [PublishStatus.DRAFT]: '待生成',
  [PublishStatus.GENERATING]: '生成中',
  [PublishStatus.READY]: '已就绪',
  [PublishStatus.SCHEDULED]: '已排程',
  [PublishStatus.PUBLISHED]: '已发布',
  [PublishStatus.FAILED]: '失败',
};

interface PlatformPreviewProps {
  publish: PlatformPublish;
  onRegenerate: () => void;
  onDelete: () => void;
  onMarkPublished: () => void;
  onPublishWordPress?: (wpStatus: 'publish' | 'draft') => void;
  publishing?: boolean;
  regenerating: boolean;
}

export default function PlatformPreview({ publish, onRegenerate, onDelete, onMarkPublished, onPublishWordPress, publishing, regenerating }: PlatformPreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = `${publish.adaptedTitle || ''}\n\n${publish.adaptedContent || ''}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">{PLATFORM_ICONS[publish.platform]}</span>
          <span className="text-sm font-medium text-zinc-900">{PLATFORM_NAMES[publish.platform]}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[publish.status]}`}>
            {STATUS_LABELS[publish.status]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {publish.status === PublishStatus.READY && (
            <button
              onClick={handleCopy}
              className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              title="复制内容"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
            title="重新生成"
          >
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onDelete}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
            title="删除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {publish.status === PublishStatus.GENERATING ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
            <span className="ml-2 text-sm text-zinc-500">AI 改写中...</span>
          </div>
        ) : publish.status === PublishStatus.FAILED ? (
          <div className="text-sm text-red-600 py-2">
            <p className="font-medium">生成失败</p>
            <p className="text-zinc-500 mt-1">{publish.notes || '请重试'}</p>
          </div>
        ) : publish.adaptedTitle || publish.adaptedContent ? (
          <div className="space-y-2">
            {publish.adaptedTitle && (
              <p className="text-sm font-semibold text-zinc-900">{publish.adaptedTitle}</p>
            )}
            {publish.adaptedContent && (
              <div className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap max-h-48 overflow-auto">
                {publish.adaptedContent}
              </div>
            )}
            {publish.adaptedTags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {publish.adaptedTags.map((tag, i) => (
                  <span key={i} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {publish.status === PublishStatus.READY && onPublishWordPress ? (
              <div className="pt-2 border-t border-zinc-100 mt-2 space-y-2">
                <button
                  onClick={() => onPublishWordPress('publish')}
                  disabled={publishing}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {publishing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  发布到 WordPress
                </button>
                <button
                  onClick={() => onPublishWordPress('draft')}
                  disabled={publishing}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {publishing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5" />
                  )}
                  存为草稿
                </button>
                <p className="text-center text-xs text-zinc-400">
                  通过 WordPress REST API 自动发布
                </p>
              </div>
            ) : publish.status === PublishStatus.READY ? (
              <div className="pt-2 border-t border-zinc-100 mt-2">
                <button
                  onClick={onMarkPublished}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  标记为已发布（人工）
                </button>
                <p className="mt-1 text-center text-xs text-zinc-400">
                  复制上方内容到对应平台发布，然后点击标记
                </p>
              </div>
            ) : null}
            {publish.status === PublishStatus.PUBLISHED && publish.publishedUrl && (
              <div className="pt-2 border-t border-zinc-100 mt-2">
                <a
                  href={publish.publishedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  查看已发布内容
                </a>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-400 py-2">点击重新生成以创建适配内容</p>
        )}
      </div>
    </div>
  );
}
