import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { notesApi } from '../../../api/client';

const SAVE_DEBOUNCE_MS = 600;

interface DraftPatch {
  name?: string;
  content?: string;
}

/**
 * Debounced auto-save for note edits. Drafts are keyed by note id so switching
 * between notes does not clobber pending writes. `flush()` forces an immediate
 * save (e.g. on note switch or unmount); flush is awaited so callers can wait
 * for pending writes before navigating.
 */
export function useNoteAutoSave(onSaved?: (id: string) => void) {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const drafts = useRef<Map<string, DraftPatch>>(new Map());
  const timer = useRef<number | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const pending = Array.from(drafts.current.entries());
    if (pending.length === 0) {
      return inflight.current ?? Promise.resolve();
    }
    drafts.current.clear();
    setSaving(true);
    const op = (async () => {
      try {
        for (const [id, patch] of pending) {
          // Single retry on transient gateway timeouts (504) — typical cause
          // is the backend being briefly busy with another request. One
          // retry after a short delay clears most of these silently so the
          // user doesn't see scary "Failed to save" toasts for fluky waits.
          try {
            await notesApi.update(id, patch);
          } catch (err: any) {
            if (err?.status === 504 || err?.status === 502) {
              await new Promise((r) => setTimeout(r, 800));
              await notesApi.update(id, patch);
            } else {
              throw err;
            }
          }
          onSaved?.(id);
        }
        setSavedAt(Date.now());
      } catch (e: any) {
        // Re-queue the unsaved patch so the next edit picks it up — losing
        // an autosave silently is worse than a brief retry.
        for (const [id, patch] of pending) {
          const cur = drafts.current.get(id) ?? {};
          drafts.current.set(id, { ...patch, ...cur });
        }
        toast.error(e?.detail ?? e?.message ?? 'Failed to save');
      } finally {
        setSaving(false);
      }
    })();
    inflight.current = op;
    await op;
    inflight.current = null;
  }, [onSaved]);

  const queueSave = useCallback((id: string, patch: DraftPatch) => {
    const cur = drafts.current.get(id) ?? {};
    drafts.current.set(id, { ...cur, ...patch });
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void flush();
    }, SAVE_DEBOUNCE_MS);
  }, [flush]);

  // Save outstanding drafts on tab close.
  useEffect(() => {
    const handler = () => { void flush(); };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  return { queueSave, flush, saving, savedAt };
}
