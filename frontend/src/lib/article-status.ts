import { ArticleStatus } from '@cms-ng/shared';
import { libT } from '@/i18n/client-dict';

/**
 * 稿件状态的统一展示元数据。
 * 全站状态一律用「圆点 + 中性文字」呈现，圆点承载语义色，保持页面整体冷调一致。
 * label 走 lib 词典(libT 读 cookie,语言切换后整页刷新,取值总是当前语言)。
 */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

export interface ArticleStatusMeta {
  label: string;
  tone: StatusTone;
  /** Tailwind bg-* 类，用于状态圆点 */
  dot: string;
}

const STATUS_KEYS: Record<string, string> = {
  [ArticleStatus.DRAFT]: 'articleStatus.draft',
  [ArticleStatus.WRITING]: 'articleStatus.writing',
  [ArticleStatus.AI_OPTIMIZING]: 'articleStatus.aiOptimizing',
  [ArticleStatus.PENDING_REVIEW]: 'articleStatus.pendingReview',
  [ArticleStatus.IN_REVIEW]: 'articleStatus.inReview',
  [ArticleStatus.REVISION]: 'articleStatus.revision',
  [ArticleStatus.APPROVED]: 'articleStatus.approved',
  [ArticleStatus.PUBLISHED]: 'articleStatus.published',
  [ArticleStatus.ARCHIVED]: 'articleStatus.archived',
  [ArticleStatus.PIPELINE_FAILED]: 'articleStatus.pipelineFailed',
  [ArticleStatus.AUTO_PUBLISHED]: 'articleStatus.autoPublished',
};

const FALLBACK_TONE: StatusTone = 'neutral';
const FALLBACK_DOT = 'bg-slate-400';

/** 取状态元数据；未传或未知状态返回兜底（label 退化为 '-' 或原始值）。 */
export function getArticleStatusMeta(status?: string | null): ArticleStatusMeta {
  if (!status) return { label: '-', tone: FALLBACK_TONE, dot: FALLBACK_DOT };
  const key = STATUS_KEYS[status];
  if (key) {
    return { label: libT(key), tone: toneFor(status), dot: dotFor(status) };
  }
  return { label: status, tone: FALLBACK_TONE, dot: FALLBACK_DOT };
}

const TONES: Record<string, StatusTone> = {
  [ArticleStatus.DRAFT]: 'neutral',
  [ArticleStatus.WRITING]: 'info',
  [ArticleStatus.AI_OPTIMIZING]: 'brand',
  [ArticleStatus.PENDING_REVIEW]: 'warning',
  [ArticleStatus.IN_REVIEW]: 'info',
  [ArticleStatus.REVISION]: 'danger',
  [ArticleStatus.APPROVED]: 'success',
  [ArticleStatus.PUBLISHED]: 'success',
  [ArticleStatus.ARCHIVED]: 'neutral',
  [ArticleStatus.PIPELINE_FAILED]: 'danger',
  [ArticleStatus.AUTO_PUBLISHED]: 'success',
};

const DOTS: Record<string, string> = {
  [ArticleStatus.DRAFT]: 'bg-slate-400',
  [ArticleStatus.WRITING]: 'bg-blue-500',
  [ArticleStatus.AI_OPTIMIZING]: 'bg-cyan-500',
  [ArticleStatus.PENDING_REVIEW]: 'bg-amber-500',
  [ArticleStatus.IN_REVIEW]: 'bg-blue-500',
  [ArticleStatus.REVISION]: 'bg-red-500',
  [ArticleStatus.APPROVED]: 'bg-emerald-500',
  [ArticleStatus.PUBLISHED]: 'bg-emerald-500',
  [ArticleStatus.ARCHIVED]: 'bg-slate-400',
  [ArticleStatus.PIPELINE_FAILED]: 'bg-red-500',
  [ArticleStatus.AUTO_PUBLISHED]: 'bg-emerald-500',
};

function toneFor(status: string): StatusTone {
  return TONES[status] ?? FALLBACK_TONE;
}

function dotFor(status: string): string {
  return DOTS[status] ?? FALLBACK_DOT;
}
