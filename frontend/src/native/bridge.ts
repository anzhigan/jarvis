/**
 * Native bridge — graceful fallback when running in browser.
 *
 * Each function is a no-op in the web; only fires when running inside Capacitor.
 * Use these throughout the app for haptics, status bar, etc.
 */
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();   // 'ios' | 'android' | 'web'
export const isIOS = platform === 'ios';

// ─── Haptics ─────────────────────────────────────────────────────────────────

export async function hapticTap(): Promise<void> {
  if (!isNative) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch { /* ignore */ }
}

export async function hapticSuccess(): Promise<void> {
  if (!isNative) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  } catch { /* ignore */ }
}

export async function hapticWarning(): Promise<void> {
  if (!isNative) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Warning });
  } catch { /* ignore */ }
}

export async function hapticHeavy(): Promise<void> {
  if (!isNative) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch { /* ignore */ }
}

export async function hapticSelection(): Promise<void> {
  if (!isNative) return;
  try {
    const { Haptics } = await import('@capacitor/haptics');
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  } catch { /* ignore */ }
}

// ─── Status bar ──────────────────────────────────────────────────────────────

export async function setStatusBarLight(): Promise<void> {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });   // light text on dark bg
  } catch { /* ignore */ }
}

export async function setStatusBarDark(): Promise<void> {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });    // dark text on light bg
  } catch { /* ignore */ }
}

// ─── Splash screen ───────────────────────────────────────────────────────────

export async function hideSplash(): Promise<void> {
  if (!isNative) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch { /* ignore */ }
}

// ─── Keyboard ────────────────────────────────────────────────────────────────

export async function dismissKeyboard(): Promise<void> {
  if (!isNative) return;
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    await Keyboard.hide();
  } catch { /* ignore */ }
}

// ─── App state (for foreground refresh, e.g.) ────────────────────────────────

export async function onAppForeground(callback: () => void): Promise<() => void> {
  if (!isNative) return () => {};
  try {
    const { App } = await import('@capacitor/app');
    const handle = await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) callback();
    });
    return () => handle.remove();
  } catch {
    return () => {};
  }
}
