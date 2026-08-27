import { UserRole, ContentLanguage, type DisplayLanguage } from '@cms-ng/shared';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  department?: string;
  displayLanguage?: DisplayLanguage | null;
  preferredLanguage?: ContentLanguage | null;
  isActive?: boolean;
  balance?: number;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
}
