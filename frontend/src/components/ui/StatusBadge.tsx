import { getArticleStatusMeta } from '@/lib/article-status';
import { cn } from './cn';

export interface StatusBadgeProps {
  status?: string | null;
  /** 是否显示文字标签（默认 true）；仅显示圆点时可关闭。 */
  withLabel?: boolean;
  className?: string;
}

/** 状态徽章：圆点 + 中性文字。圆点承载语义色，保持全站冷调一致。 */
export function StatusBadge({ status, withLabel = true, className }: StatusBadgeProps) {
  const meta = getArticleStatusMeta(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted', className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {withLabel && meta.label}
    </span>
  );
}
