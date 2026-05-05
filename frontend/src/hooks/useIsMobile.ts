import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;

let listeners = new Set<() => void>();
let lastValue = typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;
let resizeAttached = false;

function ensureResizeListener() {
  if (resizeAttached || typeof window === 'undefined') return;
  resizeAttached = true;
  const onResize = () => {
    const next = window.innerWidth < MOBILE_BREAKPOINT;
    if (next !== lastValue) {
      lastValue = next;
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener('resize', onResize, { passive: true });
}

function subscribe(cb: () => void): () => void {
  ensureResizeListener();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): boolean {
  return lastValue;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Single shared `window.innerWidth < 768` flag. Replaces the `useEffect +
 * window.addEventListener('resize')` pattern duplicated in ~30 components —
 * one resize listener for the whole app instead of N.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
