import { useToastStore } from '@/store/toast-store';
import { libT } from '@/i18n/client-dict';

interface ApiErrorShape {
  response?: {
    status?: number;
    data?: { message?: string };
  };
}

/**
 * Map an axios error to a user-facing toast message. Pure function - no
 * side effects beyond calling useToastStore.getState().show. Returns the
 * message it showed (or null if it was a 401, which is handled by the
 * caller via redirect). Fallback texts resolve from the lib catalog.
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
    message = libT('apiError.network');
    type = 'warning';
  } else if (status >= 500) {
    message = apiMsg || libT('apiError.server');
  } else if (status === 403) {
    message = apiMsg || libT('apiError.forbidden');
  } else if (status === 404) {
    message = apiMsg || libT('apiError.notFound');
  } else {
    message = apiMsg || libT('apiError.requestFailed');
  }

  useToastStore.getState().show({ message, type });
  return message;
}
