import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { authApi, routinesApi, tasksApi } from '../../../api/client';
import type { Routine, Task } from '../../../api/types';
import { useAuthStore } from '../../../store/auth';
import { currentStreak } from '../../routines/lib/heatmap';

const FONT_SIZE_KEY = 'note-font-size';
const DEFAULT_FONT_SIZE = 16;
export const FONT_SIZES = [14, 15, 16, 17, 18, 20, 22, 24];

function readFontSize(): number {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(FONT_SIZE_KEY) : null;
  const n = raw ? parseInt(raw, 10) : DEFAULT_FONT_SIZE;
  return FONT_SIZES.includes(n) ? n : DEFAULT_FONT_SIZE;
}

/**
 * Reads the current user from the auth store and exposes account mutations.
 *
 * Identity-strip stats (active goals / active routines / top streak) are loaded
 * once on mount — they do not need to be live-updated, this surface is settings,
 * not a dashboard.
 */
export function useProfile() {
  const auth = useAuthStore();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    Promise.all([tasksApi.list(), routinesApi.list()])
      .then(([t, r]) => { setTasks(t); setRoutines(r); })
      .catch(() => { /* silent — stats are non-critical */ })
      .finally(() => setStatsLoading(false));
  }, []);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = {
    /** Lifetime counts displayed on the profile identity strip. */
    goals:    tasks.length,
    routines: routines.length,
    topStreak: routines.length === 0 ? 0
      : Math.max(...routines.map((r) => currentStreak(r))),
    /** Sum of positive-value entries across every routine — "Entries logged". */
    entriesLogged: routines.reduce((acc, r) =>
      acc + r.entries.filter((e) => (e.value ?? 0) > 0).length, 0),
    /** Active streaks (≥3 days) — kept as a derivation for the rail/route badge. */
    streaksCount: routines.filter((r) => !r.is_paused && currentStreak(r) >= 3).length,
  };

  const memberSince = (() => {
    if (!auth.user) return '';
    // User type doesn't expose created_at — best-effort label.
    return 'Active member';
  })();

  // ── Font size ────────────────────────────────────────────────────────────
  const [fontSize, setFontSizeState] = useState<number>(readFontSize);
  const setFontSize = useCallback((n: number) => {
    setFontSizeState(n);
    localStorage.setItem(FONT_SIZE_KEY, String(n));
    document.documentElement.style.setProperty('--editor-font-size', `${n}px`);
  }, []);

  // ── Mutations ────────────────────────────────────────────────────────────
  const changePassword = useCallback(async (current: string, next: string) => {
    try {
      await authApi.changePassword(current, next);
      toast.success('Password updated');
      return true;
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to update password');
      return false;
    }
  }, []);

  const uploadAvatar = useCallback(async (file: File) => {
    try {
      const updated = await authApi.uploadAvatar(file);
      // The auth store holds `user`; refetch via init() to refresh.
      await auth.init();
      return updated;
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to upload avatar');
      return null;
    }
  }, [auth]);

  const updateProfile = useCallback(async (data: { username?: string; email?: string }) => {
    try {
      await authApi.updateProfile(data);
      await auth.init();
      toast.success('Profile updated');
      return true;
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to update profile');
      return false;
    }
  }, [auth]);

  const removeAvatar = useCallback(async () => {
    try {
      await authApi.updateProfile({ avatar_url: null } as any);
      await auth.init();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to remove avatar');
    }
  }, [auth]);

  const deleteAccount = useCallback(async () => {
    try {
      await authApi.deleteAccount();
      auth.logout();
      toast.success('Account deleted');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to delete account');
    }
  }, [auth]);

  const logout = useCallback(() => { auth.logout(); }, [auth]);

  return {
    user: auth.user,
    stats, statsLoading, memberSince,
    fontSize, setFontSize,
    changePassword, uploadAvatar, removeAvatar, updateProfile,
    deleteAccount, logout,
  };
}
