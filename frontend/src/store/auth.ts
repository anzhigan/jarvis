import { create } from 'zustand';
import { authApi, ApiError } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  init: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isReady: false,

  setUser: (user) => set({ user }),

  init: async () => {
    if (!localStorage.getItem('access_token')) {
      set({ isReady: true });
      return;
    }
    try {
      const user = await authApi.me();
      set({ user, isReady: true });
    } catch {
      authApi.logout();
      set({ user: null, isReady: true });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      await authApi.login(email, password);
      const user = await authApi.me();
      set({ user });
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (email, username, password) => {
    set({ isLoading: true });
    try {
      await authApi.register(email, username, password);
      await authApi.login(email, password);
      const user = await authApi.me();
      set({ user });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: () => {
    authApi.logout();
    set({ user: null });
  },
}));

// Listen for auto-logout from interceptor
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    useAuthStore.setState({ user: null });
  });
}
