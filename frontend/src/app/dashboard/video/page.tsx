'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Clapperboard,
  FileText,
  Film,
  Loader2,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { VideoGenerationMode, VideoJobStatus } from '@cms-ng/shared';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import type { StatusTone } from '@/lib/article-status';
import { reportApiError } from '@/lib/api-error-toast';
import { getArticles, type Article } from '@/lib/article-api';
import {
  createVideoJob,
  getVideoCapability,
  listVideoJobs,
  retryVideoJob,
  cancelVideoJob,
  parseStoryboardVo,
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

const SELECT_CLASS =
  'h-9 rounded-lg border border-line bg-surface px-3 text-sm text-foreground ' +
  'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="tnum rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-muted">
      {children}
    </span>
  );
}

const SCENE_STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: '待生成', className: 'bg-surface-muted text-muted' },
  submitted: { label: '生成中', className: 'bg-blue-50 text-blue-600' },
  done: { label: '素材就绪', className: 'bg-emerald-50 text-emerald-600' },
  failed: { label: '失败', className: 'bg-red-50 text-red-600' },
};

/** L2(稿件成片)任务的脚本/分镜进度明细 */
function L2JobDetail({ job }: { job: VideoGenerationJobVo }) {
  const storyboard = parseStoryboardVo(job.storyboard);
  return (
    <details className="mt-3 rounded-lg border border-line bg-surface-muted/40 px-3 py-2">
      <summary className="cursor-pointer select-none text-xs font-medium text-muted">
        脚本与分镜{storyboard ? `(${storyboard.scenes.length} 镜)` : ''}
        {job.ttsProvider === 'none' && ' · 无配音'}
      </summary>
      {job.script && (
        <div className="mt-2">
          <p className="text-[11px] font-medium text-subtle">口播脚本</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground">
            {job.script}
          </p>
        </div>
      )}
      {storyboard && (
        <ol className="mt-2 space-y-1.5 border-t border-line pt-2">
          {storyboard.scenes.map((s) => {
            const chip = s.asset ? SCENE_STATUS_META[s.asset.status] : null;
            return (
              <li key={s.index} className="flex items-start gap-2 text-xs">
                <span className="tnum mt-0.5 shrink-0 text-subtle">{s.index + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground">{s.narration}</p>
                  <p className="mt-0.5 line-clamp-1 text-subtle">
                    {s.visual.type === 'video' ? '视频片段' : '图片'} · {s.visual.prompt}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  {s.voice && (
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
                      已配音
                    </span>
                  )}
                  {chip && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${chip.className}`}>
                      {chip.label}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}

export default function VideoStudioPage() {
  const toast = useToastStore((s) => s.show);
  const searchParams = useSearchParams();
  const [capability, setCapability] = useState<VideoCapability | null>(null);
  const [capabilityLoaded, setCapabilityLoaded] = useState(false);
  const [jobs, setJobs] = useState<VideoGenerationJobVo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<VideoGenerationMode>(
    searchParams.get('mode') === 'article'
      ? VideoGenerationMode.ARTICLE_TO_VIDEO
      : VideoGenerationMode.TEXT_TO_CLIP,
  );
  const [prompt, setPrompt] = useState('');
  const [durationSec, setDurationSec] = useState(6);
  const [resolution, setResolution] = useState<'768P' | '1080P'>('768P');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('9:16');
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleId, setArticleId] = useState(searchParams.get('articleId') ?? '');
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
      .catch(() =>
        setCapability({
          enabled: false,
          provider: null,
          defaults: { durationSec: 6, resolution: '768P', aspectRatio: '9:16' },
          l2: false,
          tts: false,
          render: false,
        }),
      )
      .finally(() => setCapabilityLoaded(true));
    // 稿件成片候选稿件列表(取最近 50 篇,权限由后端创建时校验)
    getArticles({ page: 1, pageSize: 50 })
      .then((res) => setArticles(res.data))
      .catch(() => setArticles([]));
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
    if (submitting) return;
    if (mode === VideoGenerationMode.TEXT_TO_CLIP && !prompt.trim()) return;
    if (mode === VideoGenerationMode.ARTICLE_TO_VIDEO && !articleId) return;
    setSubmitting(true);
    try {
      await createVideoJob(
        mode === VideoGenerationMode.ARTICLE_TO_VIDEO
          ? { mode, articleId, aspectRatio }
          : { prompt: prompt.trim(), durationSec, resolution, aspectRatio },
      );
      setPrompt('');
      toast({
        type: 'success',
        message:
          mode === VideoGenerationMode.ARTICLE_TO_VIDEO
            ? '成片任务已创建:脚本 → 分镜 → 素材 → 合成,全程需要几分钟'
            : '视频任务已创建,生成需要几分钟',
      });
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
      <div className="flex h-40 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
      </div>
    );
  }

  if (!capability?.enabled) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="视频创作" subtitle="AI 文生视频" />
        <Card className="flex flex-col items-center px-5 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
            <Clapperboard className="h-5 w-5 text-subtle" />
          </div>
          <p className="text-sm font-medium text-foreground">文生视频功能未启用</p>
          <p className="mt-1 text-xs text-muted">
            请联系管理员配置 VIDEO_GENERATION_ENABLED 与 VIDEO_CLIP_PROVIDER(火山引擎 / MiniMax)
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="视频创作"
        subtitle={`文生视频 · 当前引擎:${PROVIDER_LABEL[capability.provider ?? ''] ?? capability.provider}`}
      />

      {/* 新建任务 */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-line bg-surface-muted/50 px-5 py-3.5">
          <div className="brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm">
            <Clapperboard className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">新建视频任务</h2>
            <p className="text-xs text-muted">文生片段生成短视频;稿件成片将整篇稿件自动合成为带配音字幕的成片</p>
          </div>
        </div>

        {/* 模式切换 */}
        <div className="flex gap-1 border-b border-line px-5 pt-3">
          <button
            type="button"
            onClick={() => setMode(VideoGenerationMode.TEXT_TO_CLIP)}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium transition ${
              mode === VideoGenerationMode.TEXT_TO_CLIP
                ? 'border-b-2 border-brand text-brand'
                : 'text-muted hover:text-foreground'
            }`}
          >
            文生片段
          </button>
          <button
            type="button"
            onClick={() => capability.l2 && setMode(VideoGenerationMode.ARTICLE_TO_VIDEO)}
            disabled={!capability.l2}
            title={capability.l2 ? undefined : '稿件成片未启用:需要 VIDEO_RENDER_ENABLED=true 且配置图片生成服务'}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === VideoGenerationMode.ARTICLE_TO_VIDEO
                ? 'border-b-2 border-brand text-brand'
                : 'text-muted hover:text-foreground'
            }`}
          >
            稿件一键成片
          </button>
        </div>

        {mode === VideoGenerationMode.TEXT_TO_CLIP ? (
          <form onSubmit={onSubmit} className="space-y-4 p-5">
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
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <div>
                <label htmlFor="video-duration" className="mb-1.5 block text-xs font-medium text-muted">时长</label>
                <select
                  id="video-duration"
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  className={SELECT_CLASS}
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
                  className={SELECT_CLASS}
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
                  className={SELECT_CLASS}
                >
                  <option value="9:16">竖屏 9:16</option>
                  <option value="16:9">横屏 16:9</option>
                  <option value="1:1">方形 1:1</option>
                </select>
              </div>
              <Button type="submit" size="sm" className="ml-auto h-9" loading={submitting} disabled={!prompt.trim()}>
                {!submitting && <Sparkles className="h-4 w-4" />}
                生成视频
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 p-5">
            <div>
              <label htmlFor="video-article" className="mb-1.5 block text-xs font-medium text-muted">
                选择稿件
              </label>
              <select
                id="video-article"
                value={articleId}
                onChange={(e) => setArticleId(e.target.value)}
                className={`${SELECT_CLASS} w-full`}
              >
                <option value="">请选择要成片的稿件…</option>
                {articles.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-subtle">
                AI 将自动完成:口播脚本 → 分镜设计 → 逐镜素材(图片/视频片段)→ 配音字幕 → 合成入库
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <div>
                <label htmlFor="video-ratio-l2" className="mb-1.5 block text-xs font-medium text-muted">画幅</label>
                <select
                  id="video-ratio-l2"
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as '16:9' | '9:16' | '1:1')}
                  className={SELECT_CLASS}
                >
                  <option value="9:16">竖屏 9:16</option>
                  <option value="16:9">横屏 16:9</option>
                  <option value="1:1">方形 1:1</option>
                </select>
              </div>
              {!capability.tts && (
                <p className="text-xs text-amber-600">未配置语音服务,本次成片将无配音(仅字幕)</p>
              )}
              <Button type="submit" size="sm" className="ml-auto h-9" loading={submitting} disabled={!articleId}>
                {!submitting && <FileText className="h-4 w-4" />}
                一键成片
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* 任务列表 */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
        </div>
      ) : jobs.length === 0 ? (
        <Card className="flex flex-col items-center px-5 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
            <Film className="h-5 w-5 text-subtle" />
          </div>
          <p className="text-sm font-medium text-foreground">还没有视频任务</p>
          <p className="mt-1 text-xs text-muted">从上方输入画面描述,生成第一个视频片段</p>
        </Card>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">任务列表</h2>
              <span className="tnum rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
                {total}
              </span>
            </div>
            {hasActive && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <Loader2 className="h-3 w-3 animate-spin" />
                进行中 · 每 5 秒自动刷新
              </span>
            )}
          </div>
          <div className="space-y-3">
            {jobs.map((job) => {
              const meta = STATUS_META[job.status] ?? { label: job.status, tone: 'neutral' as StatusTone };
              const isActive = ACTIVE_STATUSES.includes(job.status);
              return (
                <Card key={job.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={meta.tone}>
                          {isActive && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          {meta.label}
                        </Badge>
                        {job.mode === VideoGenerationMode.ARTICLE_TO_VIDEO ? (
                          <MetaChip>稿件成片</MetaChip>
                        ) : (
                          <>
                            <MetaChip>{job.durationSec ?? '-'}s</MetaChip>
                            <MetaChip>{job.resolution ?? '-'}</MetaChip>
                          </>
                        )}
                        <MetaChip>{job.aspectRatio ?? '-'}</MetaChip>
                        {job.costEstimate != null && (
                          <MetaChip>预估 ¥{job.costEstimate}</MetaChip>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-foreground">{job.prompt}</p>
                      {job.status === VideoJobStatus.FAILED && job.error && (
                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                          {job.error}
                        </div>
                      )}
                      <p className="tnum mt-2 text-[11px] text-subtle">
                        {new Date(job.createdAt).toLocaleString('zh-CN')}
                      </p>
                      {job.mode === VideoGenerationMode.ARTICLE_TO_VIDEO &&
                        (job.script || job.storyboard) && <L2JobDetail job={job} />}
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
                    <div className="mt-3 flex justify-center overflow-hidden rounded-lg bg-black ring-1 ring-line">
                      <video
                        src={job.resultUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="max-h-[420px] w-auto max-w-full"
                      />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
