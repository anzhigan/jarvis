import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import {
  Loader2, Moon, Sun, BookOpen, BarChart3, Repeat, Zap,
  PanelLeftClose, PanelLeftOpen, Search, Bell, Plus, Target, Play,
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

type Tab = 'notes' | 'tasks' | 'routines' | 'sprints' | 'tutor' | 'analysis' | 'profile';

const TABS: { key: Tab; labelKey: string; icon: React.ElementType }[] = [
  { key: 'notes',    labelKey: 'nav.notes',    icon: BookOpen },
  { key: 'tasks',    labelKey: 'nav.tasks',    icon: Target },
  { key: 'routines', labelKey: 'nav.routines', icon: Repeat },
  { key: 'sprints',  labelKey: 'nav.sprints',  icon: Zap },
  { key: 'analysis', labelKey: 'nav.analysis', icon: BarChart3 },
];

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
    const saved = localStorage.getItem('jarvnote:sidebarOpen:v3');
    return saved === null ? true : saved === '1';
  });

  useEffect(() => { init(); }, []);

  useEffect(() => {
    if (needsBiometryPrompt) {
      const timer = setTimeout(() => { triggerBiometryUnlock(); }, 300);
      return () => clearTimeout(timer);
    }
  }, [needsBiometryPrompt, triggerBiometryUnlock]);

  useEffect(() => {
    const saved = localStorage.getItem('jarvnote:theme');
    const isDark = saved === 'dark' ||
      (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
    import('../native/bridge').then(({ hideSplash, setStatusBarTheme }) => {
      hideSplash();
      setStatusBarTheme(isDark);
    });
  }, []);

  useEffect(() => { localStorage.setItem('jarvnote:tab', tab); }, [tab]);
  useEffect(() => { localStorage.setItem('jarvnote:sidebarOpen:v3', sidebarOpen ? '1' : '0'); }, [sidebarOpen]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('jarvnote:theme', next ? 'dark' : 'light');
    import('../native/bridge').then(({ setStatusBarTheme }) => setStatusBarTheme(next));
  };

  if (!isReady) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
      </div>
    );
  }

  if (needsBiometryPrompt && !user) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 px-8 text-center"
        style={{ background: 'var(--bg-app)' }}>
        <h1 className="text-display">Jarvnote</h1>
        <p style={{ color: 'var(--fg-tertiary)' }}>
          {biometryType === 'faceId' ? 'Use Face ID to unlock' :
           biometryType === 'touchId' ? 'Use Touch ID to unlock' :
           'Authenticate to continue'}
        </p>
        <button onClick={triggerBiometryUnlock} className="btn btn-md btn-primary">
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

  return (
    <div className="app-root">
      <div className="app-shell">
        {/* ─── Sidebar ─────────────────────────────────────────────────── */}
        <aside className="app-sidebar app-only-desktop" data-collapsed={!sidebarOpen}>
          <div className="sidebar-header">
            <span className="sidebar-brand">Jarvnote</span>
          </div>

          <div className="sidebar-section-label">Workspace</div>
          <nav className="sidebar-nav">
            {TABS.map((tabDef) => {
              const Icon = tabDef.icon;
              const active = tab === tabDef.key;
              return (
                <button
                  key={tabDef.key}
                  onClick={() => setTab(tabDef.key)}
                  className="sidebar-item"
                  data-active={active}
                  data-page={tabDef.key}
                >
                  <Icon className="icon" strokeWidth={active ? 2.2 : 1.6} />
                  <span>{t(tabDef.labelKey)}</span>
                </button>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <div className="focus-card">
              <div className="focus-card-label">Focus mode</div>
              <div className="focus-card-title">Deep work</div>
              <div className="focus-card-row">
                <div className="focus-timer">25:00</div>
                <button className="focus-play" aria-label="Start focus session">
                  <Play size={11} fill="currentColor" />
                </button>
              </div>
            </div>

            <button
              onClick={() => setTab('profile')}
              className="sidebar-item"
              data-active={tab === 'profile'}
              style={{ paddingLeft: 6 }}
            >
              {user.avatar_url ? (
                <img src={resolveUrl(user.avatar_url)} alt="" className="icon" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', opacity: 1 }} />
              ) : (
                <span className="icon" style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-notes-soft)', color: 'var(--accent-notes)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, opacity: 1 }}>
                  {user.username.charAt(0).toUpperCase()}
                </span>
              )}
              <span>{user.username}</span>
            </button>
          </div>
        </aside>

        {/* ─── Workspace ─────────────────────────────────────────────── */}
        <div className="app-workspace">
          {/* Topbar */}
          <header className="topbar">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="topbar-toggle app-only-desktop"
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>

            <button className="topbar-search">
              <Search size={13} strokeWidth={2} />
              <span>Search anything…</span>
              <span className="topbar-search-kbd">⌘K</span>
            </button>

            <div className="topbar-spacer app-only-desktop" />

            <button className="topbar-icon-btn" title="Quick capture">
              <Plus size={15} />
            </button>
            <button className="topbar-icon-btn" title="Notifications">
              <Bell size={15} />
            </button>
            <button onClick={toggleTheme} className="topbar-icon-btn" title="Toggle theme">
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button onClick={() => setTab('profile')} className="topbar-user">
              {user.avatar_url ? (
                <img src={resolveUrl(user.avatar_url)} alt="" className="topbar-user-avatar" />
              ) : (
                <span className="topbar-user-avatar">{user.username.charAt(0).toUpperCase()}</span>
              )}
              <span className="topbar-user-name app-only-desktop">{user.username}</span>
            </button>
          </header>

          {/* Main content */}
          <main className="app-main">
            <div className="app-page" data-visible={tab === 'notes'}><Notes /></div>
            <div className="app-page" data-visible={tab === 'tasks'}><Tasks /></div>
            <div className="app-page" data-visible={tab === 'routines'}><Routines /></div>
            <div className="app-page" data-visible={tab === 'sprints'}><Sprints /></div>
            <div className="app-page" data-visible={tab === 'tutor'}><AITutorPage /></div>
            <div className="app-page" data-visible={tab === 'analysis'}><Dashboard /></div>
            <div className="app-page" data-visible={tab === 'profile'}><Profile /></div>
          </main>

          {/* Mobile bottom tab bar */}
          <nav className="mobile-tabbar app-only-mobile">
            {TABS.map((tabDef) => {
              const Icon = tabDef.icon;
              const active = tab === tabDef.key;
              return (
                <button
                  key={tabDef.key}
                  onClick={async () => {
                    setTab(tabDef.key);
                    const { hapticTap } = await import('../native/bridge');
                    hapticTap();
                  }}
                  className="mobile-tab"
                  data-active={active}
                >
                  <Icon className="icon" strokeWidth={active ? 2.2 : 1.7} />
                  <span className="label">{t(tabDef.labelKey)}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <Toaster richColors position="top-center"
        toastOptions={{
          style: {
            fontFamily: 'var(--font-sans)',
            borderRadius: 'var(--r-md)',
            border: '0.5px solid var(--line)',
          },
        }}
      />
    </div>
  );
}
