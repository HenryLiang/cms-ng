'use client';

import { useState, useEffect, useCallback } from 'react';
import { Platform, PublishStatus } from '@cms-ng/shared';
import {
  getPlatforms,
  getPublishes,
  generateAdaptation,
  updatePublish,
  deletePublish,
  publishToWordPress,
  type PlatformMetadata,
  type PlatformPublish,
} from '@/lib/channel-api';
import PlatformPreview from './platform-preview';
import { Share2, Loader2, Plus } from 'lucide-react';

interface ChannelPanelProps {
  articleId: string;
}

export default function ChannelPanel({ articleId }: ChannelPanelProps) {
  const [platforms, setPlatforms] = useState<PlatformMetadata[]>([]);
  const [publishes, setPublishes] = useState<PlatformPublish[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [platformsData, publishesData] = await Promise.all([
        getPlatforms(),
        getPublishes(articleId),
      ]);
      setPlatforms(platformsData);
      setPublishes(publishesData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerate = async (platform: Platform) => {
    setRegenerating((prev) => ({ ...prev, [platform]: true }));
    setError('');
    try {
      const updated = await generateAdaptation(articleId, platform);
      setPublishes((prev) => {
        const filtered = prev.filter((p) => p.platform !== platform);
        return [...filtered, updated];
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRegenerating((prev) => ({ ...prev, [platform]: false }));
    }
  };

  const handleDelete = async (publishId: string) => {
    if (!confirm('确定要删除此平台的适配内容吗？')) return;
    try {
      await deletePublish(articleId, publishId);
      setPublishes((prev) => prev.filter((p) => p.id !== publishId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleMarkPublished = async (publishId: string) => {
    try {
      const updated = await updatePublish(articleId, publishId, {
        status: PublishStatus.PUBLISHED,
      });
      setPublishes((prev) =>
        prev.map((p) => (p.id === publishId ? updated : p))
      );
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePublishWordPress = async (wpStatus: 'publish' | 'draft') => {
    setPublishing(true);
    setError('');
    try {
      const updated = await publishToWordPress(articleId, wpStatus);
      setPublishes((prev) =>
        prev.map((p) => (p.platform === Platform.WORDPRESS ? updated : p))
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  const supportedPlatforms = platforms.filter((p) =>
    [Platform.WEBSITE, Platform.FACEBOOK, Platform.INSTAGRAM, Platform.XIAOHONGSHU, Platform.WORDPRESS].includes(p.key)
  );

  const getPublishForPlatform = (platform: Platform) =>
    publishes.find((p) => p.platform === platform);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-900">平台分发</h3>
        <Share2 className="h-4 w-4 text-zinc-400" />
      </div>

      {error && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Platform Selector */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {supportedPlatforms.map((platform) => {
          const publish = getPublishForPlatform(platform.key);
          const isGenerating = regenerating[platform.key];

          return (
            <button
              key={platform.key}
              onClick={() => handleGenerate(platform.key)}
              disabled={isGenerating}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                publish?.status === PublishStatus.READY
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : publish?.status === PublishStatus.GENERATING
                  ? 'border-purple-200 bg-purple-50 text-purple-700'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              {isGenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : publish ? (
                <Share2 className="h-3 w-3" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              {platform.name}
            </button>
          );
        })}
      </div>

      {/* Publish Previews */}
      {publishes.length > 0 && (
        <div className="mt-4 space-y-3">
          {publishes
            .filter((p) =>
              [Platform.WEBSITE, Platform.FACEBOOK, Platform.INSTAGRAM, Platform.XIAOHONGSHU, Platform.WORDPRESS].includes(
                p.platform as Platform
              )
            )
            .map((publish) => (
              <PlatformPreview
                key={publish.id}
                publish={publish}
                onRegenerate={() => handleGenerate(publish.platform as Platform)}
                onDelete={() => handleDelete(publish.id)}
                onMarkPublished={() => handleMarkPublished(publish.id)}
                onPublishWordPress={publish.platform === Platform.WORDPRESS ? handlePublishWordPress : undefined}
                publishing={publishing}
                regenerating={regenerating[publish.platform] || false}
              />
            ))}
        </div>
      )}

      {publishes.length === 0 && (
        <p className="mt-4 text-center text-xs text-zinc-400">
          选择上方平台，一键生成适配内容
        </p>
      )}
    </div>
  );
}
