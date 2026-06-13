import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';

const mockShow = vi.fn();
vi.mock('@/store/toast-store', () => ({
  useToastStore: { getState: () => ({ show: mockShow }) },
}));

import { reportApiError } from './api-error-toast';

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof window === 'undefined') (global as any).window = {};
});

const makeAxiosError = (status: number, body?: any) => {
  const err = new axios.AxiosError('Request failed');
  if (status) {
    err.response = {
      status,
      data: body ?? {},
      statusText: '',
      headers: {},
      config: {} as any,
    };
  }
  return err;
};

describe('reportApiError', () => {
  it('returns null and does not toast on 401 (caller handles redirect)', () => {
    const result = reportApiError(makeAxiosError(401, { message: 'Unauthorized' }));
    expect(result).toBeNull();
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('uses API message and type=error for 5xx', () => {
    const result = reportApiError(makeAxiosError(500, { message: '数据库连接失败' }));
    expect(result).toBe('数据库连接失败');
    expect(mockShow).toHaveBeenCalledWith({ message: '数据库连接失败', type: 'error' });
  });

  it('uses API message for 403', () => {
    const result = reportApiError(makeAxiosError(403, { message: 'You do not have permission' }));
    expect(result).toBe('You do not have permission');
    expect(mockShow).toHaveBeenCalledWith({ message: 'You do not have permission', type: 'error' });
  });

  it('uses fallback for 403 without API message', () => {
    const result = reportApiError(makeAxiosError(403, {}));
    expect(result).toBe('没有权限执行此操作');
  });

  it('uses fallback for 404 without API message', () => {
    const result = reportApiError(makeAxiosError(404, {}));
    expect(result).toBe('资源不存在');
  });

  it('uses type=warning and generic message for network error (no status)', () => {
    const err = new axios.AxiosError('Network Error');
    // no response
    const result = reportApiError(err);
    expect(result).toBe('网络异常，请检查连接后重试');
    expect(mockShow).toHaveBeenCalledWith({ message: '网络异常，请检查连接后重试', type: 'warning' });
  });

  it('uses fallback for 400 without API message', () => {
    const result = reportApiError(makeAxiosError(400, {}));
    expect(result).toBe('请求失败');
  });
});
