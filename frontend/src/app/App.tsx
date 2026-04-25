import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { Loader2, Moon, Sun, BookOpen, CheckSquare, BarChart3, User, PanelLeft, Brain } from 'lucide-react';
import Notes from '../components/Notes';
import Tasks from '../components/Tasks';
import Dashboard from '../components/Metrics';
import Profile from '../components/Profile';
import AuthPage from '../components/AuthPage';
import AITutorPage from '../components/AITutorPage';
import { useAuthStore } from '../store/auth';
import { useT } from '../store/i18n';

type Tab = 'notes' | 'tasks' | 'tutor' | 'analysis' | 'profile';

const TABS: { key: Tab; labelKey: string; icon: React.ElementType }[] = [
  { key: 'notes',    labelKey: 'nav.notes',    icon: BookOpen },
  { key: 'tasks',    labelKey: 'nav.tasks',    icon: CheckSquare },
  // { key: 'tutor',    labelKey: 'nav.tutor',    icon: Brain },  // hidden temporarily
  { key: 'analysis', labelKey: 'nav.analysis', icon: BarChart3 },
];

export { PanelLeft }; // Re-export for other components to use same icon

export default function App() {
  const { user, isReady, init } = useAuthStore();
  const t = useT();
  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('jarvnote:tab');
    if (saved === 'notes' || saved === 'tasks' || saved === 'tutor' || saved === 'analysis' || saved === 'profile') return saved;
    return 'notes';
  });
  const [dark, setDark] = useState(false);

  useEffect(() => { init(); }, []);

  useEffect(() => {
    localStorage.setItem('jarvnote:tab', tab);
  }, [tab]);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDark = saved === 'dark' || (!saved && prefersDark);
    setDark(useDark);
    document.documentElement.classList.toggle('dark', useDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthPage />
        <Toaster richColors position="bottom-right" />
      </>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center px-3 md:px-4 h-14 border-b border-border flex-shrink-0 gap-2">
        {/* Left: profile pill */}
        <div className="flex-1 min-w-0 flex items-center">
          <button
            onClick={() => setTab('profile')}
            className={`h-9 flex items-center gap-2 pr-3 pl-1 rounded-full transition-colors ${
              tab === 'profile'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            title="Account"
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                className="w-7 h-7 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                <User size={14} />
              </div>
            )}
            <span className="hidden sm:inline text-sm font-medium truncate max-w-[100px] md:max-w-[140px]">
              {user.username}
            </span>
          </button>
        </div>

        {/* Center: main tabs */}
        <nav className="flex items-center gap-0.5 flex-shrink-0">
          {TABS.map((tabDef) => {
            const active = tab === tabDef.key;
            const Icon = tabDef.icon;
            const label = t(tabDef.labelKey);
            return (
              <button
                key={tabDef.key}
                onClick={() => setTab(tabDef.key)}
                className={`flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium transition-all ${
                  active
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                }`}
                title={label}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: theme */}
        <div className="flex-1 min-w-0 flex items-center justify-end">
          <button
            onClick={toggleTheme}
            className="h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Toggle theme"
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      {/* Main — keep all tabs mounted; toggle visibility. */}
      <main className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${tab === 'notes' ? '' : 'hidden'}`}><Notes /></div>
        <div className={`absolute inset-0 ${tab === 'tasks' ? '' : 'hidden'}`}><Tasks /></div>
        <div className={`absolute inset-0 ${tab === 'tutor' ? '' : 'hidden'}`}><AITutorPage /></div>
        <div className={`absolute inset-0 ${tab === 'analysis' ? '' : 'hidden'}`}><Dashboard /></div>
        <div className={`absolute inset-0 ${tab === 'profile' ? '' : 'hidden'}`}><Profile /></div>
      </main>

      <Toaster richColors position="bottom-right" />
    </div>
  );
}
