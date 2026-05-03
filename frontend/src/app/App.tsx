import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import {
  Loader2, Moon, Sun, BookOpen, BarChart3, Repeat, Zap,
  PanelLeftClose, PanelLeftOpen, Search, Target,
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

const TABS: { key: Tab; labelKey: string; icon: React.ElementType; acc: string }[] = [
  { key: 'notes',    labelKey: 'nav.notes',    icon: BookOpen,  acc: 'notes' },
  { key: 'tasks',    labelKey: 'nav.tasks',    icon: Target,    acc: 'goals' },
  { key: 'routines', labelKey: 'nav.routines', icon: Repeat,    acc: 'routines' },
  { key: 'sprints',  labelKey: 'nav.sprints',  icon: Zap,       acc: 'sprints' },
  { key: 'analysis', labelKey: 'nav.analysis', icon: BarChart3, acc: 'analysis' },
];

export default function App() {
  const { user, isReady, init } = useAuthStore();
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
    const saved = localStorage.getItem('jarvnote:theme');
    const isDark = saved === 'dark' ||
      (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  useEffect(() => { localStorage.setItem('jarvnote:tab', tab); }, [tab]);
  useEffect(() => { localStorage.setItem('jarvnote:sidebarOpen:v3', sidebarOpen ? '1' : '0'); }, [sidebarOpen]);

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
        <Toaster richColors position="top-center" />
      </>
    );
  }

  return (
    <div className="app-root">
      <div className="app-shell">
        <aside className="app-sidebar app-only-desktop" data-collapsed={!sidebarOpen}>
          <div className="sidebar-head">
            <span className="sidebar-brand">Jarvnote</span>
            <button onClick={() => setSidebarOpen(false)} className="icon-btn icon-btn-sm" title="Hide sidebar">
              <PanelLeftClose size={14} />
            </button>
          </div>

          <div className="sidebar-search">
            <button className="field" type="button">
              <Search size={11} strokeWidth={2} />
              <span>Search…</span>
              <span className="kbd">⌘K</span>
            </button>
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
                  className="nav-item"
                  data-active={active}
                  data-acc={tabDef.acc}
                >
                  <Icon className="icon" />
                  <span>{t(tabDef.labelKey)}</span>
                </button>
              );
            })}
          </nav>

          <div className="sidebar-foot">
            <div className="sidebar-foot-row">
              <button onClick={() => setTab('profile')} className="profile-row" style={{ flex: 1, width: 'auto', minWidth: 0 }}>
                {user.avatar_url ? (
                  <img src={resolveUrl(user.avatar_url)} alt="" className="profile-avatar" />
                ) : (
                  <span className="profile-avatar">{user.username.charAt(0).toUpperCase()}</span>
                )}
                <span className="profile-name">{user.username}</span>
              </button>
              <button onClick={toggleTheme} className="icon-btn icon-btn-sm" title="Toggle theme" style={{ flexShrink: 0 }}>
                {dark ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            </div>
          </div>
        </aside>

        <div className="app-workspace">
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} className="icon-btn float-sidebar-toggle app-only-desktop" title="Show sidebar">
              <PanelLeftOpen size={14} />
            </button>
          )}

          <main className="app-main">
            <div className="app-page" data-visible={tab === 'notes'}><Notes /></div>
            <div className="app-page" data-visible={tab === 'tasks'}><Tasks /></div>
            <div className="app-page" data-visible={tab === 'routines'}><Routines /></div>
            <div className="app-page" data-visible={tab === 'sprints'}><Sprints /></div>
            <div className="app-page" data-visible={tab === 'tutor'}><AITutorPage /></div>
            <div className="app-page" data-visible={tab === 'analysis'}><Dashboard /></div>
            <div className="app-page" data-visible={tab === 'profile'}><Profile /></div>
          </main>

          <nav className="mobile-tabbar app-only-mobile">
            {TABS.map((tabDef) => {
              const Icon = tabDef.icon;
              const active = tab === tabDef.key;
              return (
                <button
                  key={tabDef.key}
                  onClick={() => setTab(tabDef.key)}
                  className="mobile-tab"
                  data-active={active}
                  data-acc={tabDef.acc}
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
            borderRadius: 'var(--r-control)',
            boxShadow: 'var(--sh-popover)',
          },
        }}
      />
    </div>
  );
}
