import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';
import AuthPage from '../components/AuthPage';
import { useAuthStore } from '../store/auth';
import { useIsMobile } from '../hooks/useIsMobile';
import { MobileApp, type Tab } from './MobileApp';
import { DesktopApp } from './DesktopApp';

const VALID_TABS: Tab[] = ['notes', 'tasks', 'routines', 'sprints', 'analysis', 'profile'];

export default function App() {
  const { user, isReady, init } = useAuthStore();
  const isMobile = useIsMobile();

  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('jarvnote:tab');
    if (saved && VALID_TABS.includes(saved as Tab)) return saved as Tab;
    return 'notes';
  });
  useEffect(() => { localStorage.setItem('jarvnote:tab', tab); }, [tab]);

  const [dark, setDark] = useState(false);

  useEffect(() => { init(); }, []);

  useEffect(() => {
    const saved = localStorage.getItem('jarvnote:theme');
    const isDark = saved === 'dark' ||
      (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setTab((e as CustomEvent<Tab>).detail);
    window.addEventListener('jarvnote:navigate', handler);
    return () => window.removeEventListener('jarvnote:navigate', handler);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('jarvnote:theme', next ? 'dark' : 'light');
  };

  const toaster = (
    <Toaster
      richColors
      position="top-center"
      toastOptions={{
        style: {
          fontFamily: 'var(--font-sans)',
          borderRadius: 'var(--r-control)',
          boxShadow: 'var(--sh-popover)',
        },
      }}
    />
  );

  if (!isReady) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
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
    </>
  );
}
