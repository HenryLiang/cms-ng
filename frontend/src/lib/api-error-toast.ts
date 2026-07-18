import { useToastStore } from '@/store/toast-store';

interface ApiErrorShape {
  response?: {
    status?: number;
    data?: { message?: string };
  };
}

/**
 * Map an axios error to a user-facing toast message. Pure function — no
 * side effects beyond calling useToastStore.getState().show. Returns the
 * message it showed (or null if it was a 401, which is handled by the
 * caller via redirect).
 */
export function reportApiError(error: unknown): string | null {
  if (typeof window === 'undefined') return null;

  const err = error as ApiErrorShape | null | undefined;

  // 401: caller handles via redirect; we don't toast (the page is about to
  // change and a toast on /login would be confusing).
  if (err?.response?.status === 401) return null;

  const status = err?.response?.status;
  const apiMsg = err?.response?.data?.message;

  let message: string;
  let type: 'error' | 'warning' = 'error';

  if (!status) {
    message = '网络异常，请检查连接后重试';
    type = 'warning';
  } else if (status >= 500) {
    message = apiMsg || '服务器错误，请稍后重试';
  } else if (status === 403) {
    message = apiMsg || '没有权限执行此操作';
  } else if (status === 404) {
    message = apiMsg || '资源不存在';
  } else if (status >= 400) {
    message = apiMsg || '请求失败';
  } else {
    message = apiMsg || '请求失败';
  }

  useToastStore.getState().show({ message, type });
  return message;
}
