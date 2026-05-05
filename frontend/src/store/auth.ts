import { create } from 'zustand';
import { authApi } from '../api/client';
import type { User } from '../api/types';

const SECURE_REFRESH_KEY = 'jarvnote_refresh_token';
const SECURE_ACCESS_KEY = 'jarvnote_access_token';

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
    localStorage.removeItem(SECURE_REFRESH_KEY);
    localStorage.removeItem(SECURE_ACCESS_KEY);
    set({ user: null });
  },
}));

// Listen for auto-logout from interceptor
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    useAuthStore.setState({ user: null });
  });

  // Cross-tab logout: if another tab clears the access token, drop the user
  // here too. Otherwise the second tab would keep firing requests with a
  // stale (still locally cached) Authorization header until refresh fails.
  window.addEventListener('storage', (e) => {
    if (e.key === 'access_token' && !e.newValue) {
      useAuthStore.setState({ user: null });
    }
  });
}
