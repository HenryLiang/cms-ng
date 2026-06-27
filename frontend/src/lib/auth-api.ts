import { api } from './api';
import { LoginCredentials, RegisterCredentials, User } from '@/types/auth';
import { UserRole } from '@cms-ng/shared';

interface AuthResponse {
  user: User;
  accessToken: string;
}

export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', credentials);
  return data;
}

export async function register(credentials: RegisterCredentials): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/register', credentials);
  return data;
}

export async function getCurrentUser(): Promise<User> {
  const { data } = await api.get<User>('/auth/me');
  return data;
}

export function logoutClient(): void {
  localStorage.removeItem('accessToken');
}

export interface RegistrationStatus {
  registrationOpen: boolean;
}

/** 注册是否开放（公开接口，无需登录）。用于注册页决定渲染表单还是「已关闭」面板。 */
export async function getRegistrationStatus(): Promise<RegistrationStatus> {
  const { data } = await api.get<RegistrationStatus>('/auth/registration/status');
  return data;
}

/** 开/关注册（管理员）。返回切换后的开放状态。 */
export async function toggleRegistration(
  enabled: boolean,
  reason?: string,
): Promise<RegistrationStatus> {
  const { data } = await api.post<RegistrationStatus>('/auth/registration/toggle', {
    enabled,
    reason,
  });
  return data;
}

