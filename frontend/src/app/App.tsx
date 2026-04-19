import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { Brain, Loader2, LogOut, Moon, Sun, BookOpen, CheckSquare, BarChart3 } from 'lucide-react';
import Notes from '../components/Notes';
import Tasks from '../components/Tasks';
import Dashboard from '../components/Metrics';
import AuthPage from '../components/AuthPage';
import { useAuthStore } from '../store/auth';

type Tab = 'notes' | 'tasks' | 'dashboard';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'notes',     label: 'Notes',     icon: BookOpen },
  { key: 'tasks',     label: 'Tasks',     icon: CheckSquare },
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
];

export default function App() {
  const { user, isReady, init, logout } = useAuthStore();
  const [tab, setTab] = useState<Tab>('notes');
  const [dark, setDark] = useState(false);

  useEffect(() => {
    init();
  }, []);

  // Theme
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
      <header className="flex items-center justify-between px-3 md:px-5 h-14 border-b border-border flex-shrink-0 gap-2">
        <div className="flex items-center gap-3 md:gap-8 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Brain size={14} className="text-primary-foreground" />
            </div>
            <span className="hidden sm:inline font-semibold tracking-tight">Jarvis</span>
          </div>

          <nav className="flex items-center gap-1">
            {TABS.map((t) => {
              const active = tab === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 h-9 px-2.5 md:h-8 md:px-3 rounded-md text-sm font-medium transition-all ${
                    active
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                  }`}
                  title={t.label}
                >
                  <Icon size={15} />
                  <span className="hidden md:inline">{t.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={toggleTheme}
            className="h-9 w-9 md:h-8 md:w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Toggle theme"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <div className="hidden md:block w-px h-5 bg-border mx-0.5" />
          <span className="hidden md:inline text-sm text-muted-foreground pr-1 truncate max-w-[120px]">{user.username}</span>
          <button
            onClick={logout}
            className="h-9 w-9 md:h-8 md:w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-hidden">
        {tab === 'notes' && <Notes />}
        {tab === 'tasks' && <Tasks />}
        {tab === 'dashboard' && <Dashboard />}
      </main>

      <Toaster richColors position="bottom-right" />
    </div>
  );
}
