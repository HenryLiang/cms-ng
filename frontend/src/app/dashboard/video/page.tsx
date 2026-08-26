'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import {
  Clapperboard,
  FileText,
  Film,
  Library,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { VideoGenerationMode, VideoJobStatus } from '@cms-ng/shared';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { MediaPicker } from '@/components/media-picker';
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
  type VideoReference,
  type VideoReferenceRole,
} from '@/lib/video-api';
import { useToastStore } from '@/store/toast-store';

const ACTIVE_STATUSES: VideoJobStatus[] = [
  VideoJobStatus.PENDING,
  VideoJobStatus.SCRIPTING,
  VideoJobStatus.STORYBOARDING,
  VideoJobStatus.ASSETS_GENERATING,
  VideoJobStatus.VOICE_SYNTHESIZING,
  VideoJobStatus.COMPOSING,
  VideoJobStatus.UPLOADING,
];

/** 帧角色(与 reference_* 参考角色互斥,Ark 实测两种生成模式不可混合) */
const FRAME_ROLES: VideoReferenceRole[] = ['first_frame', 'last_frame'];

/** 角色 → 媒体库选择器的 MIME 大类 */
const REFERENCE_ROLE_MIME: Record<
  VideoReferenceRole,
  'image' | 'video' | 'audio'
> = {
  first_frame: 'image',
  last_frame: 'image',
  reference_image: 'image',
  reference_video: 'video',
  reference_audio: 'audio',
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

/** L2(稿件成片)任务的脚本/分镜进度明细 */
function L2JobDetail({ job }: { job: VideoGenerationJobVo }) {
  const t = useTranslations('video');
  /** 分镜单镜状态角标文案(i18n 词典驱动) */
  const sceneStatusMeta: Record<string, { label: string; className: string }> = {
    pending: { label: t('sceneStatus.pending'), className: 'bg-surface-muted text-muted' },
    submitted: { label: t('sceneStatus.submitted'), className: 'bg-blue-50 text-blue-600' },
    done: { label: t('sceneStatus.done'), className: 'bg-emerald-50 text-emerald-600' },
    failed: { label: t('sceneStatus.failed'), className: 'bg-red-50 text-red-600' },
  };
  const storyboard = parseStoryboardVo(job.storyboard);
  return (
    <details className="mt-3 rounded-lg border border-line bg-surface-muted/40 px-3 py-2">
      <summary className="cursor-pointer select-none text-xs font-medium text-muted">
        {t('detail.scriptAndStoryboard')}
        {storyboard ? `(${t('detail.sceneCount', { count: storyboard.scenes.length })})` : ''}
        {job.ttsProvider === 'none' && ` · ${t('detail.noVoiceover')}`}
        {job.ttsProvider === 'native' && ` · ${t('detail.nativeVoiceover')}`}
      </summary>
      {job.script && (
        <div className="mt-2">
          <p className="text-[11px] font-medium text-subtle">{t('detail.voiceoverScript')}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground">
            {job.script}
          </p>
        </div>
      )}
      {storyboard && (
        <ol className="mt-2 space-y-1.5 border-t border-line pt-2">
          {storyboard.scenes.map((s) => {
            const chip = s.asset ? sceneStatusMeta[s.asset.status] : null;
            return (
              <li key={s.index} className="flex items-start gap-2 text-xs">
                <span className="tnum mt-0.5 shrink-0 text-subtle">{s.index + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground">{s.narration}</p>
                  <p className="mt-0.5 line-clamp-1 text-subtle">
                    {s.visual.type === 'video' ? t('detail.visualVideo') : t('detail.visualImage')} · {s.visual.prompt}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1">
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
  const t = useTranslations('video');
  const tCommon = useTranslations('common');
  const locale = useLocale();
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
  const [resolution, setResolution] = useState<'480P' | '720P'>('480P');
  const [generateAudio, setGenerateAudio] = useState(false);
  const [references, setReferences] = useState<VideoReference[]>([]);
  const [seedInput, setSeedInput] = useState('');
  const [draft, setDraft] = useState(false);
  const [returnLastFrame, setReturnLastFrame] = useState(false);
  /** 媒体库选择器当前服务的参考物行号;null=关闭 */
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
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
          defaults: { durationSec: 6, resolution: '480P', aspectRatio: '9:16' },
          l2: false,
          nativeAudio: false,
          references: {
            roles: [],
            limits: {
              first_frame: 1,
              last_frame: 1,
              reference_image: 9,
              reference_video: 3,
              reference_audio: 3,
            },
            frameReferenceExclusive: false,
          },
          seed: false,
          draft: false,
          returnLastFrame: false,
          duration: { mode: 'fixed', min: 6, max: 10, allowed: [6, 10] },
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

  // 时长按能力位对齐:fixed 模式落到合法档位,free 模式钳制到 [min,max]
  useEffect(() => {
    if (!capability?.duration) return;
    const { mode, min, max, allowed } = capability.duration;
    if (mode === 'fixed' && allowed && !allowed.includes(durationSec)) {
      // 能力位加载后钳制时长(外部状态同步),set-state-in-effect 规则对此过严
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDurationSec(allowed[0]);
    } else if (mode === 'free' && (durationSec < min || durationSec > max)) {
      setDurationSec(Math.min(max, Math.max(min, durationSec)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capability?.duration]);

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
      const refs = references.filter((r) => r.url.trim());
      const seed = seedInput.trim() ? Number(seedInput.trim()) : undefined;
      await createVideoJob(
        mode === VideoGenerationMode.ARTICLE_TO_VIDEO
          ? { mode, articleId, aspectRatio }
          : {
              prompt: prompt.trim(),
              durationSec,
              resolution,
              aspectRatio,
              generateAudio: generateAudio || undefined,
              references: refs.length ? refs : undefined,
              seed: Number.isInteger(seed) ? seed : undefined,
              draft: draft || undefined,
              returnLastFrame: returnLastFrame || undefined,
            },
      );
      setPrompt('');
      setReferences([]);
      setSeedInput('');
      setDraft(false);
      setReturnLastFrame(false);
      toast({
        type: 'success',
        message:
          mode === VideoGenerationMode.ARTICLE_TO_VIDEO
            ? t('toast.finalCutCreated')
            : t('toast.clipCreated'),
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
      toast({ type: 'success', message: t('toast.resubmitted') });
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
      toast({ type: 'success', message: t('toast.cancelled') });
      await refresh();
    } catch (err) {
      reportApiError(err);
    } finally {
      setActingId(null);
    }
  }

  /** 参考物行操作(仅 L1;角色可选项由 capability gating) */
  const refRoles = capability?.references.roles ?? [];
  const frameExclusive = capability?.references.frameReferenceExclusive === true;
  /**
   * 帧/参考互斥(Ark 实测):已选行含帧角色时其他行只能选帧角色,反之亦然。
   * rowIndex 传 -1 表示"新增行"(按全部已选行计算)。
   */
  const allowedRolesFor = (
    rows: VideoReference[],
    rowIndex: number,
  ): VideoReferenceRole[] => {
    if (!frameExclusive) return refRoles;
    const others = rows.filter((_, i) => i !== rowIndex).map((r) => r.role);
    const hasFrame = others.some((r) => FRAME_ROLES.includes(r));
    const hasRefMedia = others.some((r) => !FRAME_ROLES.includes(r));
    if (hasFrame) return refRoles.filter((r) => FRAME_ROLES.includes(r));
    if (hasRefMedia) return refRoles.filter((r) => !FRAME_ROLES.includes(r));
    return refRoles;
  };
  const addReference = () => {
    const allowed = allowedRolesFor(references, -1);
    const defaultRole = allowed.includes('first_frame')
      ? 'first_frame'
      : allowed[0];
    if (!defaultRole) return;
    setReferences((rows) => [...rows, { role: defaultRole, url: '' }]);
  };
  const updateReference = (i: number, patch: Partial<VideoReference>) =>
    setReferences((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    );
  const removeReference = (i: number) =>
    setReferences((rows) => rows.filter((_, idx) => idx !== i));

  // 词典驱动的文案映射(状态/引擎/参考物角色;未知值回退原始枚举)
  const statusMeta: Record<VideoJobStatus, { label: string; tone: StatusTone }> = {
    [VideoJobStatus.PENDING]: { label: t('status.pending'), tone: 'neutral' },
    [VideoJobStatus.SCRIPTING]: { label: t('status.scripting'), tone: 'info' },
    [VideoJobStatus.STORYBOARDING]: { label: t('status.storyboarding'), tone: 'info' },
    [VideoJobStatus.ASSETS_GENERATING]: { label: t('status.assetsGenerating'), tone: 'brand' },
    [VideoJobStatus.VOICE_SYNTHESIZING]: { label: t('status.voiceSynthesizing'), tone: 'info' },
    [VideoJobStatus.COMPOSING]: { label: t('status.composing'), tone: 'info' },
    [VideoJobStatus.UPLOADING]: { label: t('status.uploading'), tone: 'info' },
    [VideoJobStatus.SUCCEEDED]: { label: t('status.succeeded'), tone: 'success' },
    [VideoJobStatus.FAILED]: { label: t('status.failed'), tone: 'danger' },
    [VideoJobStatus.CANCELLED]: { label: t('status.cancelled'), tone: 'neutral' },
  };
  const providerLabel: Record<string, string> = {
    volcengine: t('provider.volcengine'),
    minimax: t('provider.minimax'),
  };
  /** 参考物角色标签(可用角色由 capability.references.roles gating) */
  const referenceRoleLabel: Record<VideoReferenceRole, string> = {
    first_frame: t('refRole.firstFrame'),
    last_frame: t('refRole.lastFrame'),
    reference_image: t('refRole.referenceImage'),
    reference_video: t('refRole.referenceVideo'),
    reference_audio: t('refRole.referenceAudio'),
  };

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
        <PageHeader title={t('title')} subtitle={t('subtitleDisabled')} />
        <Card className="flex flex-col items-center px-5 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
            <Clapperboard className="h-5 w-5 text-subtle" />
          </div>
          <p className="text-sm font-medium text-foreground">{t('disabled.title')}</p>
          <p className="mt-1 text-xs text-muted">
            {t('disabled.desc')}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', {
          provider: providerLabel[capability.provider ?? ''] ?? capability.provider,
        })}
      />

      {/* 新建任务 */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-line bg-surface-muted/50 px-5 py-3.5">
          <div className="brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm">
            <Clapperboard className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('form.title')}</h2>
            <p className="text-xs text-muted">{t('form.desc')}</p>
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
            {t('form.tabTextToClip')}
          </button>
          <button
            type="button"
            onClick={() => capability.l2 && setMode(VideoGenerationMode.ARTICLE_TO_VIDEO)}
            disabled={!capability.l2}
            title={capability.l2 ? undefined : t('form.l2DisabledTitle')}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === VideoGenerationMode.ARTICLE_TO_VIDEO
                ? 'border-b-2 border-brand text-brand'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {t('form.tabArticleToVideo')}
          </button>
        </div>

        {mode === VideoGenerationMode.TEXT_TO_CLIP ? (
          <form onSubmit={onSubmit} className="space-y-4 p-5">
            <div>
              <label htmlFor="video-prompt" className="mb-1.5 block text-xs font-medium text-muted">
                {t('form.promptLabel')}
              </label>
              <textarea
                id="video-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={t('form.promptPlaceholder')}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <div>
                <label htmlFor="video-duration" className="mb-1.5 block text-xs font-medium text-muted">{t('form.durationLabel')}</label>
                {capability?.duration?.mode === 'free' ? (
                  <input
                    id="video-duration"
                    type="number"
                    min={capability.duration.min}
                    max={capability.duration.max}
                    step={1}
                    value={durationSec}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isInteger(n)) {
                        setDurationSec(
                          Math.min(
                            capability.duration.max,
                            Math.max(capability.duration.min, n),
                          ),
                        );
                      }
                    }}
                    className={`${SELECT_CLASS} w-24`}
                  />
                ) : (
                  <select
                    id="video-duration"
                    value={durationSec}
                    onChange={(e) => setDurationSec(Number(e.target.value))}
                    className={SELECT_CLASS}
                  >
                    {(capability?.duration?.allowed ?? [6, 10]).map((d) => (
                      <option key={d} value={d}>
                        {t('form.durationSeconds', { seconds: d })}
                      </option>
                    ))}
                  </select>
                )}
                {capability?.duration?.mode === 'free' && (
                  <span className="ml-1 text-[11px] text-subtle">
                    {capability.duration.min}~{capability.duration.max}s
                  </span>
                )}
              </div>
              <div>
                <label htmlFor="video-resolution" className="mb-1.5 block text-xs font-medium text-muted">{t('form.resolutionLabel')}</label>
                <select
                  id="video-resolution"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as '480P' | '720P')}
                  className={SELECT_CLASS}
                >
                  <option value="480P">480P</option>
                  <option value="720P">720P</option>
                </select>
              </div>
              <div>
                <label htmlFor="video-ratio" className="mb-1.5 block text-xs font-medium text-muted">{t('form.aspectRatioLabel')}</label>
                <select
                  id="video-ratio"
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as '16:9' | '9:16' | '1:1')}
                  className={SELECT_CLASS}
                >
                  <option value="9:16">{t('form.aspectPortrait')}</option>
                  <option value="16:9">{t('form.aspectLandscape')}</option>
                  <option value="1:1">{t('form.aspectSquare')}</option>
                </select>
              </div>
              {capability?.nativeAudio && (
                <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={generateAudio}
                    onChange={(e) => setGenerateAudio(e.target.checked)}
                    className="h-3.5 w-3.5 accent-brand"
                  />
                  {t('form.nativeAudioLabel')}
                </label>
              )}
              <Button type="submit" size="sm" className="ml-auto h-9" loading={submitting} disabled={!prompt.trim()}>
                {!submitting && <Sparkles className="h-4 w-4" />}
                {t('form.submitClip')}
              </Button>
            </div>

            {/* 多模态参考素材(Seedance 2.x;PRD §18) */}
            {refRoles.length > 0 && (
              <div className="rounded-lg border border-line bg-surface-muted/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-muted">
                    {t('refs.title')}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addReference}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('refs.add')}
                  </Button>
                </div>
                {references.length === 0 ? (
                  <p className="text-[11px] text-subtle">
                    {frameExclusive ? t('refs.hintExclusive') : t('refs.hint')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {references.map((ref, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <select
                          aria-label={t('refs.roleAria', { index: i + 1 })}
                          value={ref.role}
                          onChange={(e) =>
                            updateReference(i, {
                              role: e.target.value as VideoReferenceRole,
                            })
                          }
                          className={`${SELECT_CLASS} shrink-0`}
                        >
                          {allowedRolesFor(references, i).map((role) => (
                            <option key={role} value={role}>
                              {referenceRoleLabel[role]}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={t('refs.urlAria', { index: i + 1 })}
                          value={ref.url}
                          onChange={(e) =>
                            updateReference(i, { url: e.target.value })
                          }
                          placeholder={t('refs.urlPlaceholder')}
                          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-foreground placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          title={t('refs.pickFromLibrary')}
                          onClick={() => setPickerIndex(i)}
                        >
                          <Library className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          title={t('refs.remove')}
                          onClick={() => removeReference(i)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 可选参数:seed 复现 / draft 打样 / 尾帧续拍链 */}
            {(capability?.seed || capability?.draft || capability?.returnLastFrame) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {capability?.seed && (
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="video-seed" className="text-xs text-muted">
                      {t('options.seedLabel')}
                    </label>
                    <input
                      id="video-seed"
                      value={seedInput}
                      onChange={(e) => setSeedInput(e.target.value)}
                      inputMode="numeric"
                      placeholder={t('options.seedPlaceholder')}
                      className="h-8 w-24 rounded-lg border border-line bg-surface px-2 text-sm text-foreground placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                  </div>
                )}
                {capability?.draft && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={draft}
                      onChange={(e) => setDraft(e.target.checked)}
                      className="h-3.5 w-3.5 accent-brand"
                    />
                    {t('options.draftLabel')}
                  </label>
                )}
                {capability?.returnLastFrame && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={returnLastFrame}
                      onChange={(e) => setReturnLastFrame(e.target.checked)}
                      className="h-3.5 w-3.5 accent-brand"
                    />
                    {t('options.returnLastFrameLabel')}
                  </label>
                )}
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 p-5">
            <div>
              <label htmlFor="video-article" className="mb-1.5 block text-xs font-medium text-muted">
                {t('articleForm.label')}
              </label>
              <select
                id="video-article"
                value={articleId}
                onChange={(e) => setArticleId(e.target.value)}
                className={`${SELECT_CLASS} w-full`}
              >
                <option value="">{t('articleForm.placeholder')}</option>
                {articles.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-subtle">
                {t('articleForm.pipelineHint')}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <div>
                <label htmlFor="video-ratio-l2" className="mb-1.5 block text-xs font-medium text-muted">{t('form.aspectRatioLabel')}</label>
                <select
                  id="video-ratio-l2"
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as '16:9' | '9:16' | '1:1')}
                  className={SELECT_CLASS}
                >
                  <option value="9:16">{t('form.aspectPortrait')}</option>
                  <option value="16:9">{t('form.aspectLandscape')}</option>
                  <option value="1:1">{t('form.aspectSquare')}</option>
                </select>
              </div>
              {capability.nativeAudio ? (
                <p className="text-xs text-muted">{t('articleForm.nativeAudioHint')}</p>
              ) : (
                <p className="text-xs text-amber-600">{t('articleForm.noNativeAudioHint')}</p>
              )}
              <Button type="submit" size="sm" className="ml-auto h-9" loading={submitting} disabled={!articleId}>
                {!submitting && <FileText className="h-4 w-4" />}
                {t('articleForm.submit')}
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
          <p className="text-sm font-medium text-foreground">{t('list.emptyTitle')}</p>
          <p className="mt-1 text-xs text-muted">{t('list.emptyDesc')}</p>
        </Card>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">{t('list.title')}</h2>
              <span className="tnum rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted">
                {total}
              </span>
            </div>
            {hasActive && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('list.activeHint', { seconds: POLL_INTERVAL_MS / 1000 })}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {jobs.map((job) => {
              const meta = statusMeta[job.status] ?? { label: job.status, tone: 'neutral' as StatusTone };
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
                          <MetaChip>{t('list.modeFinalCut')}</MetaChip>
                        ) : (
                          <>
                            <MetaChip>{job.durationSec ?? '-'}s</MetaChip>
                            <MetaChip>{job.resolution ?? '-'}</MetaChip>
                          </>
                        )}
                        <MetaChip>{job.aspectRatio ?? '-'}</MetaChip>
                        {job.costEstimate != null && (
                          <MetaChip>{t('list.costEstimate', { cost: job.costEstimate })}</MetaChip>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-foreground">{job.prompt}</p>
                      {job.status === VideoJobStatus.FAILED && job.error && (
                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                          {job.error}
                        </div>
                      )}
                      <p className="tnum mt-2 text-[11px] text-subtle">
                        {new Date(job.createdAt).toLocaleString(locale)}
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
                          {tCommon('actions.cancel')}
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
                          {tCommon('actions.retry')}
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
                  {job.lastFrameUrl && (
                    <div className="mt-2 flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={job.lastFrameUrl}
                        alt={t('list.lastFrameAlt')}
                        className="h-14 w-auto rounded-md ring-1 ring-line"
                      />
                      <p className="text-[11px] text-subtle">
                        {t('list.lastFrameHint')}
                      </p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
      <MediaPicker
        open={pickerIndex !== null}
        onClose={() => setPickerIndex(null)}
        mimePrefix={
          pickerIndex !== null
            ? REFERENCE_ROLE_MIME[references[pickerIndex]?.role ?? 'reference_image']
            : 'image'
        }
        title={
          pickerIndex !== null
            ? t('picker.title', {
                role: t(`refRole.${references[pickerIndex]?.role ?? 'reference_image'}`),
              })
            : undefined
        }
        onPick={(asset) => {
          if (pickerIndex !== null) updateReference(pickerIndex, { url: asset.url });
        }}
      />
    </div>
  );
}
