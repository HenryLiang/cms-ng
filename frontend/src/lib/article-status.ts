import { ArticleStatus } from '@cms-ng/shared';

/**
 * 稿件状态的统一展示元数据。
 * 全站状态一律用「圆点 + 中性文字」呈现，圆点承载语义色，保持页面整体冷调一致。
 */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

export interface ArticleStatusMeta {
  label: string;
  tone: StatusTone;
  /** Tailwind bg-* 类，用于状态圆点 */
  dot: string;
}

export const ARTICLE_STATUS_META: Record<string, ArticleStatusMeta> = {
  [ArticleStatus.DRAFT]: { label: '草稿', tone: 'neutral', dot: 'bg-slate-400' },
  [ArticleStatus.WRITING]: { label: '采写中', tone: 'info', dot: 'bg-blue-500' },
  [ArticleStatus.AI_OPTIMIZING]: { label: 'AI优化中', tone: 'brand', dot: 'bg-cyan-500' },
  [ArticleStatus.PENDING_REVIEW]: { label: '待审核', tone: 'warning', dot: 'bg-amber-500' },
  [ArticleStatus.IN_REVIEW]: { label: '审核中', tone: 'info', dot: 'bg-blue-500' },
  [ArticleStatus.REVISION]: { label: '退回修改', tone: 'danger', dot: 'bg-red-500' },
  [ArticleStatus.APPROVED]: { label: '已通过', tone: 'success', dot: 'bg-emerald-500' },
  [ArticleStatus.PUBLISHED]: { label: '已发布', tone: 'success', dot: 'bg-emerald-500' },
  [ArticleStatus.ARCHIVED]: { label: '已归档', tone: 'neutral', dot: 'bg-slate-400' },
  [ArticleStatus.PIPELINE_FAILED]: { label: '发布失败', tone: 'danger', dot: 'bg-red-500' },
  [ArticleStatus.AUTO_PUBLISHED]: { label: '自动发布', tone: 'success', dot: 'bg-emerald-500' },
};

const FALLBACK: ArticleStatusMeta = { label: '未知', tone: 'neutral', dot: 'bg-slate-400' };

/** 取状态元数据；未传或未知状态返回兜底（label 退化为 '-' 或原始值）。 */
export function getArticleStatusMeta(status?: string | null): ArticleStatusMeta {
  if (!status) return { ...FALLBACK, label: '-' };
  return ARTICLE_STATUS_META[status] ?? { ...FALLBACK, label: status };
}
