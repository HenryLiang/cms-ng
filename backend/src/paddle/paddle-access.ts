/**
 * Paddle 订阅访问判定（纯函数，服务端唯一口径）。
 *
 * 规则：
 * - active / trialing → 有访问权
 * - past_due → 有访问权（扣款失败进入 dunning，Paddle 会自动重试，给宽限期）
 * - paused / canceled / 其他 → 无访问权
 * - scheduledChange 存在（如约期末取消）不影响判定——只有 status 真正翻转为
 *   canceled / paused 才撤销访问。
 */
export interface PaddleAccessView {
  status: string;
  scheduledChangeAction?: string | null;
  scheduledChangeAt?: Date | null;
}

export function hasPaidAccess(
  sub: PaddleAccessView | null | undefined,
): boolean {
  if (!sub) return false;
  return (
    sub.status === 'active' ||
    sub.status === 'trialing' ||
    sub.status === 'past_due'
  );
}

/** UI 展示态：区分「生效中」「已预约期末取消/暂停」「已结束」。 */
export function getSubscriptionUiState(
  sub: PaddleAccessView | null | undefined,
): string {
  if (!sub) return 'no-subscription';
  if (sub.scheduledChangeAction === 'cancel') return 'cancel-scheduled';
  if (sub.scheduledChangeAction === 'pause') return 'pause-scheduled';
  return sub.status;
}
