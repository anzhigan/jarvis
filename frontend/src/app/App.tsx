import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { Loader2, Moon, Sun, BookOpen, CheckSquare, BarChart3, User } from 'lucide-react';
import Notes from '../components/Notes';
import Tasks from '../components/Tasks';
import Dashboard from '../components/Metrics';
import Profile from '../components/Profile';
import AuthPage from '../components/AuthPage';
import { useAuthStore } from '../store/auth';

type Tab = 'notes' | 'tasks' | 'dashboard' | 'profile';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'notes',     label: 'Notes',     icon: BookOpen },
  { key: 'tasks',     label: 'Tasks',     icon: CheckSquare },
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
];

export default function App() {
  const { user, isReady, init } = useAuthStore();
  const [tab, setTab] = useState<Tab>('notes');
  const [dark, setDark] = useState(false);

  useEffect(() => {
    init();
  }, []);

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
      <header className="flex items-center px-2 md:px-4 h-14 border-b border-border flex-shrink-0 gap-1">
        {/* Left: main tabs */}
        <nav className="flex items-center gap-0.5 md:gap-1 flex-1 min-w-0">
          {TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium transition-all ${
                  active
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                }`}
                title={t.label}
              >
                <Icon size={18} />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: theme + profile */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={toggleTheme}
            className="h-10 w-10 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Toggle theme"
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={() => setTab('profile')}
            className={`h-10 w-10 rounded-md flex items-center justify-center transition-colors ${
              tab === 'profile'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            title="Account"
          >
            <User size={18} />
          </button>
        </div>
      </header>

      {/* Main — keep all tabs mounted; toggle visibility. Preserves state across tab switches. */}
      <main className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${tab === 'notes' ? '' : 'hidden'}`}><Notes /></div>
        <div className={`absolute inset-0 ${tab === 'tasks' ? '' : 'hidden'}`}><Tasks /></div>
        <div className={`absolute inset-0 ${tab === 'dashboard' ? '' : 'hidden'}`}><Dashboard /></div>
        <div className={`absolute inset-0 ${tab === 'profile' ? '' : 'hidden'}`}><Profile /></div>
      </main>

      <Toaster richColors position="bottom-right" />
    </div>
  );
}
