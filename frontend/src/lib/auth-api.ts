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
