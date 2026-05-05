import { useEffect, useRef } from 'react';

type Modifier = 'mod' | 'shift' | 'alt';

interface KeyDef {
  key: string;
  modifiers?: Modifier[];
}

interface ShortcutMap {
  [name: string]: KeyDef | KeyDef[];
}

interface SequenceMap {
  [prefix: string]: { [suffix: string]: () => void };
}

interface UseShortcutsOptions {
  /** Direct shortcuts (single key or chord). */
  bindings: { [name: string]: { keys: KeyDef | KeyDef[]; handler: (e: KeyboardEvent) => void } };
  /** Sequence shortcuts (e.g. "g then n"). Trigger window: 1500ms. */
  sequences?: SequenceMap;
  /** When false, skip handlers (e.g. while a modal is open). */
  enabled?: boolean;
}

/**
 * Centralized keyboard shortcut hook. Skips when focus is in an editable element
 * (input/textarea/contenteditable) unless the shortcut itself uses ⌘/Ctrl.
 */
export function useShortcuts({ bindings, sequences, enabled = true }: UseShortcutsOptions) {
  const seqState = useRef<{ prefix: string | null; timer: number | null }>({ prefix: null, timer: null });

  useEffect(() => {
    if (!enabled) return;

    const isEditable = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      return false;
    };

    const matches = (e: KeyboardEvent, def: KeyDef): boolean => {
      const k = e.key.toLowerCase();
      if (def.key.toLowerCase() !== k) return false;
      const need = (m: Modifier) => def.modifiers?.includes(m) ?? false;
      const mod = e.metaKey || e.ctrlKey;
      if (need('mod')   !== mod)        return false;
      if (need('shift') !== e.shiftKey) return false;
      if (need('alt')   !== e.altKey)   return false;
      return true;
    };

    const onKey = (e: KeyboardEvent) => {
      // Direct bindings always fire on ⌘/Ctrl combos even in inputs.
      for (const name in bindings) {
        const { keys, handler } = bindings[name];
        const list = Array.isArray(keys) ? keys : [keys];
        if (list.some((d) => matches(e, d))) {
          const usesMod = list.some((d) => d.modifiers?.includes('mod'));
          if (!usesMod && isEditable(e.target)) continue;
          e.preventDefault();
          handler(e);
          return;
        }
      }

      // Sequence shortcuts: only outside editable elements, no modifiers.
      if (!sequences) return;
      if (isEditable(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

      const k = e.key.toLowerCase();

      if (seqState.current.prefix) {
        const sub = sequences[seqState.current.prefix]?.[k];
        // clear regardless of match
        const prevPrefix = seqState.current.prefix;
        seqState.current.prefix = null;
        if (seqState.current.timer) { clearTimeout(seqState.current.timer); seqState.current.timer = null; }
        if (sub) {
          e.preventDefault();
          sub();
        }
        return;
        // (Allowing prevPrefix unused)
        void prevPrefix;
      }

      if (sequences[k]) {
        seqState.current.prefix = k;
        seqState.current.timer = window.setTimeout(() => {
          seqState.current.prefix = null;
          seqState.current.timer = null;
        }, 1500);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindings, sequences, enabled]);
}

export type { ShortcutMap };
