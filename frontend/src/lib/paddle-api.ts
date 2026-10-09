import { api } from './api';

/**
 * 为当前登录用户签发 Paddle 客户门户会话。
 * customerId 由后端根据登录态邮箱解析，前端不传任何标识。
 * 返回的 URL 一次性且限时，每次点击都要重新签发。
 */
export async function createPaddlePortalSession(): Promise<{ url: string }> {
  const { data } = await api.post<{ url: string }>('/paddle/portal-session');
  return data;
}
