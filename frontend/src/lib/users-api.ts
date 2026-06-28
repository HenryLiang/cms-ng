import { api } from './api';
import { User } from '@/types/auth';
import { ContentLanguage } from '@cms-ng/shared';

export async function getEditors() {
  const { data } = await api.get('/users/editors');
  return data;
}

// All users — used by the admin manual top-up target picker (GET /users is editor/admin-only).
export async function getUsers(): Promise<User[]> {
  const { data } = await api.get('/users');
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
