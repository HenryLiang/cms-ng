'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Loader2, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { VideoJobStatus } from '@cms-ng/shared';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import type { StatusTone } from '@/lib/article-status';
import { reportApiError } from '@/lib/api-error-toast';
import {
  createVideoJob,
  getVideoCapability,
  listVideoJobs,
  retryVideoJob,
  cancelVideoJob,
  type VideoCapability,
  type VideoGenerationJobVo,
} from '@/lib/video-api';
import { useToastStore } from '@/store/toast-store';

const STATUS_META: Record<VideoJobStatus, { label: string; tone: StatusTone }> = {
  [VideoJobStatus.PENDING]: { label: '排队中', tone: 'neutral' },
  [VideoJobStatus.SCRIPTING]: { label: '脚本生成中', tone: 'info' },
  [VideoJobStatus.STORYBOARDING]: { label: '分镜设计中', tone: 'info' },
  [VideoJobStatus.ASSETS_GENERATING]: { label: '视频生成中', tone: 'brand' },
  [VideoJobStatus.VOICE_SYNTHESIZING]: { label: '配音合成中', tone: 'info' },
  [VideoJobStatus.COMPOSING]: { label: '合成中', tone: 'info' },
  [VideoJobStatus.UPLOADING]: { label: '转存入库中', tone: 'info' },
  [VideoJobStatus.SUCCEEDED]: { label: '已完成', tone: 'success' },
  [VideoJobStatus.FAILED]: { label: '失败', tone: 'danger' },
  [VideoJobStatus.CANCELLED]: { label: '已取消', tone: 'neutral' },
};

const ACTIVE_STATUSES: VideoJobStatus[] = [
  VideoJobStatus.PENDING,
  VideoJobStatus.SCRIPTING,
  VideoJobStatus.STORYBOARDING,
  VideoJobStatus.ASSETS_GENERATING,
  VideoJobStatus.VOICE_SYNTHESIZING,
  VideoJobStatus.COMPOSING,
  VideoJobStatus.UPLOADING,
];

const PROVIDER_LABEL: Record<string, string> = {
  volcengine: '火山引擎 Seedance',
  minimax: 'MiniMax Hailuo',
};

const POLL_INTERVAL_MS = 5000;

export default function VideoStudioPage() {
  const toast = useToastStore((s) => s.show);
  const [capability, setCapability] = useState<VideoCapability | null>(null);
  const [capabilityLoaded, setCapabilityLoaded] = useState(false);
  const [jobs, setJobs] = useState<VideoGenerationJobVo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [durationSec, setDurationSec] = useState(6);
  const [resolution, setResolution] = useState<'768P' | '1080P'>('768P');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('9:16');
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasActive = useMemo(
    () => jobs.some((j) => ACTIVE_STATUSES.includes(j.status)),
    [jobs],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await listVideoJobs({ page: 1, pageSize: 20 });
      setJobs(res.items);
      setTotal(res.meta.total);
    } catch (err) {
      reportApiError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getVideoCapability()
      .then(setCapability)
      .catch(() => setCapability({ enabled: false, provider: null, defaults: { durationSec: 6, resolution: '768P', aspectRatio: '9:16' } }))
      .finally(() => setCapabilityLoaded(true));
    // 数据获取模式(fetch-in-effect):React 19 set-state-in-effect 规则对此过严
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // 有进行中任务时轮询;全部终态后停止
  useEffect(() => {
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [hasActive, refresh]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    try {
      await createVideoJob({ prompt: prompt.trim(), durationSec, resolution, aspectRatio });
      setPrompt('');
      toast({ type: 'success', message: '视频任务已创建,生成需要几分钟' });
      await refresh();
    } catch (err) {
      reportApiError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function onRetry(id: string) {
    setActingId(id);
    try {
      await retryVideoJob(id);
      toast({ type: 'success', message: '已重新提交' });
      await refresh();
    } catch (err) {
      reportApiError(err);
    } finally {
      setActingId(null);
    }
  }

  async function onCancel(id: string) {
    setActingId(id);
    try {
      await cancelVideoJob(id);
      toast({ type: 'success', message: '已取消' });
      await refresh();
    } catch (err) {
      reportApiError(err);
    } finally {
      setActingId(null);
    }
  }

  if (!capabilityLoaded) {
    return (
      <div className="flex h-40 items-center justify-center text-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!capability?.enabled) {
    return (
      <div>
        <PageHeader title="视频创作" subtitle="AI 文生视频" />
        <Card className="p-10 text-center">
          <Clapperboard className="mx-auto h-10 w-10 text-subtle" />
          <p className="mt-4 text-sm font-medium text-foreground">文生视频功能未启用</p>
          <p className="mt-1 text-xs text-muted">
            请联系管理员配置 VIDEO_GENERATION_ENABLED 与 VIDEO_CLIP_PROVIDER(火山引擎 / MiniMax)
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="视频创作"
        subtitle={`文生视频 · 当前引擎:${PROVIDER_LABEL[capability.provider ?? ''] ?? capability.provider}`}
      />

      {/* 新建任务 */}
      <Card className="mb-6 p-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="video-prompt" className="mb-1.5 block text-xs font-medium text-muted">
              画面描述
            </label>
            <textarea
              id="video-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="例:一只柴犬在樱花树下奔跑,慢镜头,电影感"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="video-duration" className="mb-1.5 block text-xs font-medium text-muted">时长</label>
              <select
                id="video-duration"
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
              >
                <option value={6}>6 秒</option>
                <option value={10}>10 秒</option>
              </select>
            </div>
            <div>
              <label htmlFor="video-resolution" className="mb-1.5 block text-xs font-medium text-muted">分辨率</label>
              <select
                id="video-resolution"
                value={resolution}
                onChange={(e) => setResolution(e.target.value as '768P' | '1080P')}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
              >
                <option value="768P">768P</option>
                <option value="1080P">1080P</option>
              </select>
            </div>
            <div>
              <label htmlFor="video-ratio" className="mb-1.5 block text-xs font-medium text-muted">画幅</label>
              <select
                id="video-ratio"
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as '16:9' | '9:16' | '1:1')}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
              >
                <option value="9:16">竖屏 9:16</option>
                <option value="16:9">横屏 16:9</option>
                <option value="1:1">方形 1:1</option>
              </select>
            </div>
            <Button type="submit" disabled={submitting || !prompt.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              生成视频
            </Button>
          </div>
        </form>
      </Card>

      {/* 任务列表 */}
      {loading ? (
        <div className="flex h-32 items-center justify-center text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        <Card className="p-10 text-center">
          <Clapperboard className="mx-auto h-10 w-10 text-subtle" />
          <p className="mt-4 text-sm text-muted">还没有视频任务,从上方输入画面描述开始</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-subtle">共 {total} 个任务{hasActive ? ',进行中任务每 5 秒自动刷新' : ''}</p>
          {jobs.map((job) => {
            const meta = STATUS_META[job.status] ?? { label: job.status, tone: 'neutral' as StatusTone };
            const isActive = ACTIVE_STATUSES.includes(job.status);
            return (
              <Card key={job.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={meta.tone}>
                        {isActive && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        {meta.label}
                      </Badge>
                      <span className="text-[11px] text-subtle tnum">
                        {job.durationSec ?? '-'}s · {job.resolution ?? '-'} · {job.aspectRatio ?? '-'}
                      </span>
                      {job.costEstimate != null && (
                        <span className="text-[11px] text-subtle tnum">预估 ¥{job.costEstimate}</span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-foreground">{job.prompt}</p>
                    {job.status === VideoJobStatus.FAILED && job.error && (
                      <p className="mt-1.5 text-xs text-red-500">{job.error}</p>
                    )}
                    <p className="mt-1.5 text-[11px] text-subtle tnum">
                      {new Date(job.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actingId === job.id}
                        onClick={() => void onCancel(job.id)}
                      >
                        <XCircle className="h-4 w-4" />
                        取消
                      </Button>
                    )}
                    {job.status === VideoJobStatus.FAILED && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={actingId === job.id}
                        onClick={() => void onRetry(job.id)}
                      >
                        <RefreshCw className={`h-4 w-4 ${actingId === job.id ? 'animate-spin' : ''}`} />
                        重试
                      </Button>
                    )}
                  </div>
                </div>
                {job.status === VideoJobStatus.SUCCEEDED && job.resultUrl && (
                  <div className="mt-3 overflow-hidden rounded-lg bg-black ring-1 ring-line">
                    <video
                      src={job.resultUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="max-h-96 w-full"
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
