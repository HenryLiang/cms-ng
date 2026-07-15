import { api } from './api';
import { User } from '@/types/auth';
import { UserRole, ContentLanguage } from '@cms-ng/shared';
import type { BillingTransaction } from './billing-api';

export async function getEditors() {
  const { data } = await api.get('/users/editors');
  return data;
}

// All users - used by the admin manual top-up target picker (GET /users is editor/admin-only).
export async function getUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>('/users');
  return data;
}

export interface UpdateUserData {
  name?: string;
  department?: string;
  preferredLanguage?: ContentLanguage;
}

export async function updateUser(id: string, data: UpdateUserData): Promise<User> {
  const { data: responseData } = await api.patch<User>(`/users/${id}`, data);
  return responseData;
}

// ─── Account management (admin) ───

export interface CreateUserData {
  email: string;
  name: string;
  role?: UserRole;
  department?: string;
  preferredLanguage?: ContentLanguage;
}

export interface CreateUserResponse {
  user: User;
  initialPassword: string;
}

/** 创建账户，返回一次性随机初始密码（仅本次展示）。 */
export async function createUser(data: CreateUserData): Promise<CreateUserResponse> {
  const { data: resp } = await api.post<CreateUserResponse>('/users', data);
  return resp;
}

/** 启用/禁用账户。 */
export async function updateUserStatus(id: string, isActive: boolean): Promise<User> {
  const { data } = await api.patch<User>(`/users/${id}/status`, { isActive });
  return data;
}

/** 管理员重置密码，返回一次性随机新密码（仅本次展示）。 */
export async function resetUserPassword(id: string): Promise<{ password: string }> {
  const { data } = await api.post<{ password: string }>(`/users/${id}/reset-password`);
  return data;
}

export interface ConsumptionSummary {
  totalSpent: number;
  totalTopUp: number;
  transactionCount: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface UserConsumption {
  user: User;
  summary: ConsumptionSummary;
  recentTransactions: BillingTransaction[];
  meta: { page: number; pageSize: number; total: number };
}

/** 单账户消费汇总（余额、累计消费、累计充值、分布、最近流水）。 */
export async function getUserConsumption(
  id: string,
  page = 1,
  pageSize = 20,
): Promise<UserConsumption> {
  const { data } = await api.get<UserConsumption>(`/users/${id}/consumption`, {
    params: { page, pageSize },
  });
  return data;
}

// ─── Self-service ───

/** 用户自助修改密码。 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await api.post('/users/me/password', { currentPassword, newPassword });
}
