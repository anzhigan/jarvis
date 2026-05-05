import { lazy, Suspense, useEffect, useState } from 'react';
import { Loader2, BookOpen, BarChart3, Repeat, Zap, Target } from 'lucide-react';
import MobileDrawer from '../components/MobileDrawer';
import { useAuthStore } from '../store/auth';
import { useT } from '../store/i18n';

const Notes     = lazy(() => import('../components/Notes'));
const Tasks     = lazy(() => import('../components/Tasks'));
const Routines  = lazy(() => import('../components/Routines'));
const Sprints   = lazy(() => import('../components/Sprints'));
const Dashboard = lazy(() => import('../components/Metrics'));
const Profile   = lazy(() => import('../components/Profile'));

export type Tab = 'notes' | 'tasks' | 'routines' | 'sprints' | 'analysis' | 'profile';

const TABS: { key: Tab; labelKey: string; icon: React.ElementType; acc: string }[] = [
  { key: 'notes',    labelKey: 'nav.notes',    icon: BookOpen,  acc: 'notes' },
  { key: 'tasks',    labelKey: 'nav.tasks',    icon: Target,    acc: 'goals' },
  { key: 'routines', labelKey: 'nav.routines', icon: Repeat,    acc: 'routines' },
  { key: 'sprints',  labelKey: 'nav.sprints',  icon: Zap,       acc: 'sprints' },
  { key: 'analysis', labelKey: 'nav.analysis', icon: BarChart3, acc: 'analysis' },
];

interface Props {
  tab: Tab;
  onTabChange: (next: Tab) => void;
  dark: boolean;
  onToggleTheme: () => void;
}

function TabFallback() {
  return (
    <div className="size-full flex items-center justify-center">
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
    </div>
  );
}

export function MobileApp({ tab, onTabChange, dark, onToggleTheme }: Props) {
  const { user } = useAuthStore();
  const t = useT();

  const [visited, setVisited] = useState<Set<Tab>>(() => new Set([tab]));
  useEffect(() => {
    setVisited((prev) => prev.has(tab) ? prev : new Set([...prev, tab]));
  }, [tab]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    const handler = () => setDrawerOpen(true);
    window.addEventListener('jarvnote:drawerOpen', handler);
    return () => window.removeEventListener('jarvnote:drawerOpen', handler);
  }, []);

  if (!user) return null;

  return (
    <div className="app-root">
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        activeTab={tab}
        onNavigate={(t) => onTabChange(t as Tab)}
        dark={dark}
        onToggleTheme={onToggleTheme}
      />
      <div className="app-shell">
        <div className="app-workspace">
          <main className="app-main">
            <Suspense fallback={<TabFallback />}>
              {visited.has('notes')    && <div className="app-page" data-visible={tab === 'notes'}><Notes /></div>}
              {visited.has('tasks')    && <div className="app-page" data-visible={tab === 'tasks'}><Tasks /></div>}
              {visited.has('routines') && <div className="app-page" data-visible={tab === 'routines'}><Routines /></div>}
              {visited.has('sprints')  && <div className="app-page" data-visible={tab === 'sprints'}><Sprints /></div>}
              {visited.has('analysis') && <div className="app-page" data-visible={tab === 'analysis'}><Dashboard /></div>}
              {visited.has('profile')  && <div className="app-page" data-visible={tab === 'profile'}><Profile /></div>}
            </Suspense>
          </main>

          <nav className="mobile-tabbar">
            {TABS.map((tabDef) => {
              const Icon = tabDef.icon;
              const active = tab === tabDef.key;
              return (
                <button
                  key={tabDef.key}
                  onClick={() => onTabChange(tabDef.key)}
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
    </div>
  );
}
