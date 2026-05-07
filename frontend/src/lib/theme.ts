export type ThemeMode = 'dark' | 'light' | 'auto';

const STORAGE_KEY = 'jarvnote:theme';

export function getStoredTheme(): ThemeMode {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return v === 'dark' || v === 'light' ? v : 'auto';
}

export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'auto') {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return mode;
}

export function applyTheme(mode: ThemeMode): 'dark' | 'light' {
  const resolved = resolveTheme(mode);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
  }
  if (typeof localStorage !== 'undefined') {
    if (mode === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, mode);
  }
  return resolved;
}

export function applyInitialTheme(): 'dark' | 'light' {
  return applyTheme(getStoredTheme());
}

let mql: MediaQueryList | null = null;
let mqlListener: ((e: MediaQueryListEvent) => void) | null = null;

export function watchSystemTheme(onChange: (resolved: 'dark' | 'light') => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  mql = window.matchMedia('(prefers-color-scheme: dark)');
  mqlListener = (e) => {
    if (getStoredTheme() === 'auto') onChange(e.matches ? 'dark' : 'light');
  };
  mql.addEventListener('change', mqlListener);
  return () => {
    if (mql && mqlListener) mql.removeEventListener('change', mqlListener);
    mql = null;
    mqlListener = null;
  };
}
