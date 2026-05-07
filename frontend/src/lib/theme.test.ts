import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme, getStoredTheme, resolveTheme, watchSystemTheme,
} from './theme';

const STORAGE_KEY = 'jarvnote:theme';

beforeEach(() => {
  // jsdom isn't available (env: 'node'); we polyfill the bits theme.ts touches.
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };

  let attr: string | null = null;
  (globalThis as any).document = {
    documentElement: {
      setAttribute: (_: string, v: string) => { attr = v; },
      getAttribute: () => attr,
    },
  };

  // matchMedia stub — defaults to "system is light".
  (globalThis as any).window = {
    matchMedia: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  };
});

afterEach(() => {
  delete (globalThis as any).localStorage;
  delete (globalThis as any).document;
  delete (globalThis as any).window;
});

describe('getStoredTheme', () => {
  it("returns 'auto' when nothing is stored", () => {
    expect(getStoredTheme()).toBe('auto');
  });

  it("returns 'dark' when stored", () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it("returns 'auto' when stored value is unrecognized", () => {
    localStorage.setItem(STORAGE_KEY, 'sepia');
    expect(getStoredTheme()).toBe('auto');
  });
});

describe('resolveTheme', () => {
  it('passes dark/light through', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
  });

  it("'auto' resolves to light when system is light", () => {
    (globalThis as any).window.matchMedia = vi.fn().mockReturnValue({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
    expect(resolveTheme('auto')).toBe('light');
  });

  it("'auto' resolves to dark when system is dark", () => {
    (globalThis as any).window.matchMedia = vi.fn().mockReturnValue({
      matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
    expect(resolveTheme('auto')).toBe('dark');
  });
});

describe('applyTheme', () => {
  it("'dark' writes data-theme=dark and persists 'dark' in storage", () => {
    expect(applyTheme('dark')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it("'light' writes data-theme=light and persists 'light' in storage", () => {
    expect(applyTheme('light')).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it("'auto' clears storage and resolves to current system theme", () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    expect(applyTheme('auto')).toBe('light'); // system stub = light
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('watchSystemTheme', () => {
  it('returns a no-op cleanup when matchMedia is unavailable', () => {
    delete (globalThis as any).window;
    const cleanup = watchSystemTheme(() => {});
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });

  it('subscribes and the cleanup unsubscribes', () => {
    const add = vi.fn();
    const remove = vi.fn();
    (globalThis as any).window.matchMedia = vi.fn().mockReturnValue({
      matches: false, addEventListener: add, removeEventListener: remove,
    });
    const cleanup = watchSystemTheme(() => {});
    expect(add).toHaveBeenCalledTimes(1);
    cleanup();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
