import { lazy, Suspense, useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';
import AuthPage from '../components/AuthPage';
import { useAuthStore } from '../store/auth';
import { useIsMobile } from '../hooks/useIsMobile';
import { applyTheme, getStoredTheme, resolveTheme, watchSystemTheme } from '../lib/theme';
import { MobileApp } from './MobileApp';
import { DesktopApp } from './DesktopApp';
import { VALID_TABS, type Tab } from './tabs';

// Lazy: only loaded once the user starts an AI generation. Tiny but pulls
// the AIGenerationToast bundle including pulse animation styles. Two
// variants — `AIToastStack` for desktop (right-side bottom toast +
// sidebar panel) and `MobileAIToastStack` for mobile (full-width
// translucent capsule above the tab bar + bottom-sheet panel).
const AIToastStack = lazy(() => import('../features/ai/AIToastStack').then((m) => ({ default: m.AIToastStack })));
const MobileAIToastStack = lazy(() => import('../features/mobile/components/MobileAIToastStack').then((m) => ({ default: m.MobileAIToastStack })));

const PublicNoteView = lazy(() => import('../features/notes/components/PublicNoteView'));

/** Match /share/<token> at any depth — returns the token or null. */
function publicShareToken(): string | null {
  const m = window.location.pathname.match(/^\/share\/([A-Za-z0-9_-]+)\/?$/);
  return m ? m[1] : null;
}

export default function App() {
  // Public reader route: short-circuit BEFORE any auth init so unauthenticated
  // visitors never hit /auth/me or get redirected to the login screen.
  const [shareToken] = useState(() => publicShareToken());
  if (shareToken) {
    return (
      <Suspense fallback={
        <div className="h-full flex items-center justify-center" style={{ background: 'var(--paper)' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--ink-4)' }} />
        </div>
      }>
        <PublicNoteView token={shareToken} />
      </Suspense>
    );
  }
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const { user, isReady, init } = useAuthStore();
  const isMobile = useIsMobile();

  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('jarvnote:tab');
    if (saved && VALID_TABS.includes(saved as Tab)) return saved as Tab;
    return 'notes';
  });
  useEffect(() => { localStorage.setItem('jarvnote:tab', tab); }, [tab]);

  // Theme is applied to <html data-theme="..."> by applyInitialTheme() in main.tsx.
  // We only mirror its current resolved value to drive UI (icon swap, etc.).
  const [dark, setDark] = useState(() => resolveTheme(getStoredTheme()) === 'dark');

  useEffect(() => { init(); }, []);

  useEffect(() => {
    return watchSystemTheme((resolved) => {
      applyTheme('auto');
      setDark(resolved === 'dark');
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setTab((e as CustomEvent<Tab>).detail);
    window.addEventListener('jarvnote:navigate', handler);
    return () => window.removeEventListener('jarvnote:navigate', handler);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    applyTheme(next ? 'dark' : 'light');
    setDark(next);
  };

  const toaster = (
    <Toaster
      richColors
      position="top-center"
      toastOptions={{
        style: {
          fontFamily: 'var(--font-ui)',
          borderRadius: 'var(--r-control)',
          boxShadow: 'var(--sh-popover)',
        },
      }}
    />
  );

  if (!isReady) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--paper)' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--ink-4)' }} />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthPage />
        {toaster}
      </>
    );
  }

  return (
    <>
      {isMobile ? (
        <MobileApp tab={tab} onTabChange={setTab} dark={dark} onToggleTheme={toggleTheme} />
      ) : (
        <DesktopApp tab={tab} onTabChange={setTab} dark={dark} onToggleTheme={toggleTheme} />
      )}
      {toaster}
      <Suspense fallback={null}>
        {isMobile ? <MobileAIToastStack /> : <AIToastStack />}
      </Suspense>
    </>
  );
}
