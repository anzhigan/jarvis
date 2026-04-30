import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import {
  Loader2, Moon, Sun, BookOpen, Target, BarChart3, User as UserIcon,
  PanelLeftClose, PanelLeftOpen, Repeat, Zap, Settings,
} from 'lucide-react';
import Notes from '../components/Notes';
import Tasks from '../components/Tasks';
import Routines from '../components/Routines';
import Sprints from '../components/Sprints';
import Dashboard from '../components/Metrics';
import Profile from '../components/Profile';
import AuthPage from '../components/AuthPage';
import AITutorPage from '../components/AITutorPage';
import { resolveUrl } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useT } from '../store/i18n';
import JarvnoteLogo from '../components/JarvnoteLogo';

type Tab = 'notes' | 'tasks' | 'routines' | 'sprints' | 'tutor' | 'analysis' | 'profile';

const TABS: { key: Tab; labelKey: string; icon: React.ElementType }[] = [
  { key: 'notes',    labelKey: 'nav.notes',    icon: BookOpen },
  { key: 'tasks',    labelKey: 'nav.tasks',    icon: Target },
  { key: 'routines', labelKey: 'nav.routines', icon: Repeat },
  { key: 'sprints',  labelKey: 'nav.sprints',  icon: Zap },
  { key: 'analysis', labelKey: 'nav.analysis', icon: BarChart3 },
];

export { PanelLeftOpen, PanelLeftClose };

export default function App() {
  const { user, isReady, init, needsBiometryPrompt, triggerBiometryUnlock, biometryType } = useAuthStore();
  const t = useT();

  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('jarvnote:tab');
    if (saved && TABS.some((tt) => tt.key === saved)) return saved as Tab;
    return 'notes';
  });

  const [dark, setDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('jarvnote:sidebarOpen');
    return saved === null ? true : saved === '1';
  });

  useEffect(() => { init(); }, []);

  useEffect(() => {
    if (needsBiometryPrompt) {
      const timer = setTimeout(() => { triggerBiometryUnlock(); }, 300);
      return () => clearTimeout(timer);
    }
  }, [needsBiometryPrompt, triggerBiometryUnlock]);

  // Initialize theme
  useEffect(() => {
    const saved = localStorage.getItem('jarvnote:theme');
    const isDark = saved === 'dark' ||
      (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);

    // Hide native splash + sync status bar
    import('../native/bridge').then(({ hideSplash, setStatusBarTheme }) => {
      hideSplash();
      setStatusBarTheme(isDark);
    });
  }, []);

  useEffect(() => {
    localStorage.setItem('jarvnote:tab', tab);
  }, [tab]);

  useEffect(() => {
    localStorage.setItem('jarvnote:sidebarOpen', sidebarOpen ? '1' : '0');
  }, [sidebarOpen]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('jarvnote:theme', next ? 'dark' : 'light');
    import('../native/bridge').then(({ setStatusBarTheme }) => setStatusBarTheme(next));
  };

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--muted-foreground)' }} />
      </div>
    );
  }

  if (needsBiometryPrompt && !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-8 text-center"
        style={{ background: 'var(--background)' }}>
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{ background: 'var(--primary)' }}>
          <JarvnoteLogo size={48} variant="white" />
        </div>
        <div>
          <h1 className="text-display mb-2">Jarvnote</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {biometryType === 'faceId' ? 'Use Face ID to unlock' :
             biometryType === 'touchId' ? 'Use Touch ID to unlock' :
             'Authenticate to continue'}
          </p>
        </div>
        <button
          onClick={triggerBiometryUnlock}
          className="btn btn-md btn-primary"
        >
          {biometryType === 'faceId' ? 'Use Face ID' :
           biometryType === 'touchId' ? 'Use Touch ID' :
           'Authenticate'}
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthPage />
        <Toaster richColors position="top-center" />
      </>
    );
  }

  const SIDEBAR_W = sidebarOpen ? 220 : 56;

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* ═══════════════════════════════════════════════════════════════════
           DESKTOP: Left sidebar
           ═══════════════════════════════════════════════════════════════════ */}
      <aside
        className="hidden md:flex flex-col flex-shrink-0 transition-[width] ease-out"
        style={{
          width: SIDEBAR_W,
          background: 'var(--sidebar)',
          borderRight: '1px solid var(--sidebar-border)',
          transitionDuration: 'var(--dur-base)',
        }}
      >
        {/* Brand + collapse */}
        <div className="flex items-center px-3 h-14 flex-shrink-0">
          {sidebarOpen ? (
            <>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--primary)' }}>
                  <JarvnoteLogo size={18} variant="white" />
                </div>
                <span className="text-sm font-semibold tracking-tight truncate">Jarvnote</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="btn-icon btn-icon-sm"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={15} />
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-8 h-8 mx-auto rounded-lg flex items-center justify-center transition-all hover:opacity-80 active:scale-92"
              style={{ background: 'var(--primary)' }}
              title="Expand sidebar"
            >
              <JarvnoteLogo size={18} variant="white" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 pb-2 flex flex-col gap-0.5">
          {TABS.map((tabDef) => {
            const active = tab === tabDef.key;
            const Icon = tabDef.icon;
            const label = t(tabDef.labelKey);
            return (
              <button
                key={tabDef.key}
                onClick={() => setTab(tabDef.key)}
                className="flex items-center gap-2.5 h-9 rounded-md text-[13px] font-medium transition-all active:scale-[0.98]"
                style={{
                  paddingLeft: sidebarOpen ? 10 : 0,
                  paddingRight: sidebarOpen ? 10 : 0,
                  justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  background: active ? 'var(--sidebar-active)' : 'transparent',
                  color: active ? 'var(--sidebar-active-foreground)' : 'var(--sidebar-foreground)',
                  boxShadow: active ? 'var(--shadow-xs)' : 'none',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--accent)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                title={!sidebarOpen ? label : undefined}
              >
                <Icon size={16} strokeWidth={active ? 2.4 : 2} className="flex-shrink-0" />
                {sidebarOpen && <span className="truncate">{label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom: profile + theme */}
        <div className="px-2 pb-3 pt-2 flex flex-col gap-0.5"
          style={{ borderTop: '1px solid var(--sidebar-border)' }}>
          <button
            onClick={() => setTab('profile')}
            className="flex items-center gap-2.5 h-9 rounded-md text-[13px] font-medium transition-all active:scale-[0.98]"
            style={{
              paddingLeft: sidebarOpen ? 6 : 0,
              paddingRight: sidebarOpen ? 10 : 0,
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              background: tab === 'profile' ? 'var(--sidebar-active)' : 'transparent',
              color: tab === 'profile' ? 'var(--sidebar-active-foreground)' : 'var(--sidebar-foreground)',
              boxShadow: tab === 'profile' ? 'var(--shadow-xs)' : 'none',
            }}
            onMouseEnter={(e) => { if (tab !== 'profile') e.currentTarget.style.background = 'var(--accent)'; }}
            onMouseLeave={(e) => { if (tab !== 'profile') e.currentTarget.style.background = 'transparent'; }}
            title={!sidebarOpen ? user.username : undefined}
          >
            {user.avatar_url ? (
              <img src={resolveUrl(user.avatar_url)} alt=""
                className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold"
                style={{ background: 'var(--primary-soft)', color: 'var(--primary-soft-foreground)' }}>
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}
            {sidebarOpen && <span className="truncate flex-1 text-left">{user.username}</span>}
          </button>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2.5 h-9 rounded-md text-[13px] font-medium transition-all active:scale-[0.98]"
            style={{
              paddingLeft: sidebarOpen ? 10 : 0,
              paddingRight: sidebarOpen ? 10 : 0,
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              color: 'var(--sidebar-foreground)',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            title={!sidebarOpen ? 'Toggle theme' : undefined}
          >
            {dark ? <Sun size={16} className="flex-shrink-0" /> : <Moon size={16} className="flex-shrink-0" />}
            {sidebarOpen && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
          </button>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════════════
           MAIN CONTENT AREA
           ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top header */}
        <header
          className="md:hidden flex items-center px-3 gap-2 flex-shrink-0 native-ios-header"
          style={{
            height: 52,
            background: 'oklch(from var(--background) l c h / 0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--border)',
            zIndex: 20,
          }}
        >
          <button
            onClick={() => setTab('profile')}
            className="flex items-center gap-2 pl-1 pr-3 h-9 rounded-full transition-colors flex-1 min-w-0"
            style={{
              background: tab === 'profile' ? 'var(--secondary)' : 'transparent',
              color: tab === 'profile' ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
          >
            {user.avatar_url ? (
              <img src={resolveUrl(user.avatar_url)} alt=""
                className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold"
                style={{ background: 'var(--primary-soft)', color: 'var(--primary-soft-foreground)' }}>
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-medium truncate">{user.username}</span>
          </button>
          <button onClick={toggleTheme} className="btn-icon" title="Toggle theme">
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </header>

        {/* Tab content */}
        <main className="flex-1 overflow-hidden relative">
          <div className={`absolute inset-0 ${tab === 'notes' ? '' : 'hidden'}`}><Notes /></div>
          <div className={`absolute inset-0 ${tab === 'tasks' ? '' : 'hidden'}`}><Tasks /></div>
          <div className={`absolute inset-0 ${tab === 'routines' ? '' : 'hidden'}`}><Routines /></div>
          <div className={`absolute inset-0 ${tab === 'sprints' ? '' : 'hidden'}`}><Sprints /></div>
          <div className={`absolute inset-0 ${tab === 'tutor' ? '' : 'hidden'}`}><AITutorPage /></div>
          <div className={`absolute inset-0 ${tab === 'analysis' ? '' : 'hidden'}`}><Dashboard /></div>
          <div className={`absolute inset-0 ${tab === 'profile' ? '' : 'hidden'}`}><Profile /></div>
        </main>

        {/* Mobile bottom tab bar */}
        <nav
          className="md:hidden flex items-stretch justify-around flex-shrink-0 native-ios-tabbar"
          style={{
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            height: 'calc(58px + env(safe-area-inset-bottom, 0px))',
            borderTop: '1px solid var(--border)',
          }}
        >
          {TABS.map((tabDef) => {
            const active = tab === tabDef.key;
            const Icon = tabDef.icon;
            const label = t(tabDef.labelKey);
            return (
              <button
                key={tabDef.key}
                onClick={async () => {
                  setTab(tabDef.key);
                  const { hapticTap } = await import('../native/bridge');
                  hapticTap();
                }}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:opacity-70"
                style={{
                  color: active ? 'var(--primary)' : 'var(--muted-foreground)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                <span className="text-[10px] font-medium tracking-tight">{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <Toaster richColors position="top-center"
        toastOptions={{
          style: {
            fontFamily: 'var(--font-sans)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
          },
        }}
      />
    </div>
  );
}
