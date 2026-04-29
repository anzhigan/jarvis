import { create } from 'zustand';
import { authApi, ApiError } from '../api/client';
import type { User } from '../api/types';
import { isNative, checkBiometry, promptBiometry, secureGet, secureSet, secureRemove } from '../native/bridge';

const BIOMETRY_PREF_KEY = 'jarvnote:biometry-enabled';
const SECURE_REFRESH_KEY = 'jarvnote_refresh_token';
const SECURE_ACCESS_KEY = 'jarvnote_access_token';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isReady: boolean;
  biometryAvailable: boolean;
  biometryType: 'faceId' | 'touchId' | 'none';
  biometryEnabled: boolean;
  needsBiometryPrompt: boolean;     // true if app started with stored creds, waiting for Face ID
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  init: () => Promise<void>;
  setUser: (user: User) => void;
  enableBiometry: () => Promise<boolean>;
  disableBiometry: () => Promise<void>;
  triggerBiometryUnlock: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isReady: false,
  biometryAvailable: false,
  biometryType: 'none',
  biometryEnabled: false,
  needsBiometryPrompt: false,

  setUser: (user) => set({ user }),

  init: async () => {
    // Detect biometry capabilities
    const biometry = await checkBiometry();
    const biometryEnabled = isNative && localStorage.getItem(BIOMETRY_PREF_KEY) === '1';

    set({
      biometryAvailable: biometry.available,
      biometryType: biometry.type,
      biometryEnabled,
    });

    // On native: check if we have a stored refresh token in Keychain
    if (isNative && biometryEnabled) {
      const storedRefresh = await secureGet(SECURE_REFRESH_KEY);
      if (storedRefresh) {
        // Wait for biometry unlock
        set({ needsBiometryPrompt: true, isReady: true });
        return;
      }
    }

    // Standard path — check localStorage tokens
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

  triggerBiometryUnlock: async () => {
    const ok = await promptBiometry('Unlock Jarvnote');
    if (!ok) return false;
    try {
      const access = await secureGet(SECURE_ACCESS_KEY);
      const refresh = await secureGet(SECURE_REFRESH_KEY);
      if (access) localStorage.setItem('access_token', access);
      if (refresh) localStorage.setItem('refresh_token', refresh);
      const user = await authApi.me();
      set({ user, needsBiometryPrompt: false });
      return true;
    } catch {
      // Token expired or invalid — wipe and force re-login
      await secureRemove(SECURE_REFRESH_KEY);
      await secureRemove(SECURE_ACCESS_KEY);
      localStorage.removeItem(BIOMETRY_PREF_KEY);
      authApi.logout();
      set({ user: null, needsBiometryPrompt: false, biometryEnabled: false });
      return false;
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      await authApi.login(email, password);
      const user = await authApi.me();
      // If biometry was enabled previously, also save new tokens to keychain
      if (isNative && get().biometryEnabled) {
        const access = localStorage.getItem('access_token');
        const refresh = localStorage.getItem('refresh_token');
        if (access) await secureSet(SECURE_ACCESS_KEY, access);
        if (refresh) await secureSet(SECURE_REFRESH_KEY, refresh);
      }
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
    secureRemove(SECURE_REFRESH_KEY);
    secureRemove(SECURE_ACCESS_KEY);
    localStorage.removeItem(BIOMETRY_PREF_KEY);
    set({ user: null, biometryEnabled: false, needsBiometryPrompt: false });
  },

  enableBiometry: async () => {
    if (!isNative) return false;
    const status = await checkBiometry();
    if (!status.available) return false;
    // Ask Face ID once to confirm user owns the device
    const ok = await promptBiometry('Enable Face ID for Jarvnote');
    if (!ok) return false;
    // Save current tokens to keychain
    const access = localStorage.getItem('access_token');
    const refresh = localStorage.getItem('refresh_token');
    if (refresh) await secureSet(SECURE_REFRESH_KEY, refresh);
    if (access) await secureSet(SECURE_ACCESS_KEY, access);
    localStorage.setItem(BIOMETRY_PREF_KEY, '1');
    set({ biometryEnabled: true });
    return true;
  },

  disableBiometry: async () => {
    await secureRemove(SECURE_REFRESH_KEY);
    await secureRemove(SECURE_ACCESS_KEY);
    localStorage.removeItem(BIOMETRY_PREF_KEY);
    set({ biometryEnabled: false });
  },
}));

// Listen for auto-logout from interceptor
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    useAuthStore.setState({ user: null });
  });
}
