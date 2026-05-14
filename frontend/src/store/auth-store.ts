import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AuthState, User } from '@/types/auth';
import { login as loginApi, register as registerApi, getCurrentUser, logoutClient } from '@/lib/auth-api';

interface AuthStore extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string, role?: string) => Promise<void>;
  fetchUser: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { user, accessToken } = await loginApi({ email, password });
          localStorage.setItem('accessToken', accessToken);
          set({ user, accessToken, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (email, name, password, role) => {
        set({ isLoading: true });
        try {
          const { user, accessToken } = await registerApi({ email, name, password, role });
          localStorage.setItem('accessToken', accessToken);
          set({ user, accessToken, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      fetchUser: async () => {
        const token = get().accessToken;
        if (!token) {
          set({ isLoading: false });
          return;
        }
        set({ isLoading: true });
        try {
          const user = await getCurrentUser();
          set({ user, isAuthenticated: true, isLoading: false });
        } catch {
          logoutClient();
          set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
        }
      },

      logout: () => {
        logoutClient();
        set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ accessToken: state.accessToken, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
