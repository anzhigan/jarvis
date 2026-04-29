import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { Loader2, Moon, Sun, BookOpen, CheckSquare, BarChart3, User, PanelLeft, Brain, Repeat, Zap } from 'lucide-react';
import Notes from '../components/Notes';
import Tasks from '../components/Tasks';
import Routines from '../components/Routines';
import Sprints from '../components/Sprints';
import Dashboard from '../components/Metrics';
import Profile from '../components/Profile';
import AuthPage from '../components/AuthPage';
import { resolveUrl } from '../api/client';
import AITutorPage from '../components/AITutorPage';
import { useAuthStore } from '../store/auth';
import { useT } from '../store/i18n';

type Tab = 'notes' | 'tasks' | 'routines' | 'sprints' | 'tutor' | 'analysis' | 'profile';

const TABS: { key: Tab; labelKey: string; icon: React.ElementType }[] = [
  { key: 'notes',    labelKey: 'nav.notes',    icon: BookOpen },
  { key: 'tasks',    labelKey: 'nav.tasks',    icon: CheckSquare },
  { key: 'routines', labelKey: 'nav.routines', icon: Repeat },
  { key: 'sprints',  labelKey: 'nav.sprints',  icon: Zap },
  // { key: 'tutor',    labelKey: 'nav.tutor',    icon: Brain },  // hidden temporarily
  { key: 'analysis', labelKey: 'nav.analysis', icon: BarChart3 },
];

export { PanelLeft }; // Re-export for other components to use same icon

export default function App() {
  const { user, isReady, init, needsBiometryPrompt, triggerBiometryUnlock, biometryType } = useAuthStore();
  const t = useT();
  const [tab, setTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('jarvnote:tab');
    if (saved === 'notes' || saved === 'tasks' || saved === 'tutor' || saved === 'analysis' || saved === 'profile') return saved;
    return 'notes';
  });
  const [dark, setDark] = useState(false);

  useEffect(() => { init(); }, []);

  // Auto-prompt biometry once init detects stored credentials
  useEffect(() => {
    if (needsBiometryPrompt) {
      // Small delay so the splash screen and lock UI fade in first
      const t = setTimeout(() => { triggerBiometryUnlock(); }, 300);
      return () => clearTimeout(t);
    }
  }, [needsBiometryPrompt, triggerBiometryUnlock]);

  // Hide native splash + sync status bar with theme
  useEffect(() => {
    import('../native/bridge').then(({ hideSplash, isNative, isIOS }) => {
      if (isNative && isReady) hideSplash();
      if (isIOS) document.documentElement.classList.add('native-ios');
    });
  }, [isReady]);

  useEffect(() => {
    import('../native/bridge').then(({ setStatusBarDark, setStatusBarLight }) => {
      if (dark) setStatusBarLight(); else setStatusBarDark();
    });
  }, [dark]);

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

  if (needsBiometryPrompt && !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 px-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-primary flex items-center justify-center">
          <svg width="44" height="44" viewBox="0 0 100 100" fill="none">
            <path d="M 28 38 H 72 M 28 50 H 62 M 28 62 H 50" stroke="white" strokeWidth="8" strokeLinecap="round"/>
            <path d="M 56 62 L 72 70 L 68 80" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-semibold mb-2">Jarvnote</h1>
          <p className="text-sm text-muted-foreground">
            {biometryType === 'faceId' ? 'Use Face ID to unlock' :
             biometryType === 'touchId' ? 'Use Touch ID to unlock' :
             'Authenticate to continue'}
          </p>
        </div>
        <button
          onClick={triggerBiometryUnlock}
          className="h-11 px-6 rounded-full bg-primary text-primary-foreground font-medium"
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
        <Toaster richColors position="bottom-right" />
      </>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* === Top header — desktop only on native iOS, full on web === */}
      <header
        className="flex items-center px-3 md:px-5 border-b border-border flex-shrink-0 gap-2 bg-background/80 backdrop-blur-md sticky top-0 z-20 native-ios-header"
        style={{ height: 52 }}
      >
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
                src={resolveUrl(user.avatar_url)}
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

        {/* Center: main tabs (DESKTOP only) */}
        <nav className="hidden md:flex items-center gap-0 flex-shrink-0">
          {TABS.map((tabDef) => {
            const active = tab === tabDef.key;
            const Icon = tabDef.icon;
            const label = t(tabDef.labelKey);
            return (
              <button
                key={tabDef.key}
                onClick={() => setTab(tabDef.key)}
                className={`relative flex items-center gap-1.5 h-9 px-3 rounded-md text-[13px] font-medium ${
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                title={label}
              >
                <Icon size={15} strokeWidth={active ? 2.4 : 2} />
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

      {/* === Main content === */}
      <main className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${tab === 'notes' ? '' : 'hidden'}`}><Notes /></div>
        <div className={`absolute inset-0 ${tab === 'tasks' ? '' : 'hidden'}`}><Tasks /></div>
        <div className={`absolute inset-0 ${tab === 'routines' ? '' : 'hidden'}`}><Routines /></div>
        <div className={`absolute inset-0 ${tab === 'sprints' ? '' : 'hidden'}`}><Sprints /></div>
        <div className={`absolute inset-0 ${tab === 'tutor' ? '' : 'hidden'}`}><AITutorPage /></div>
        <div className={`absolute inset-0 ${tab === 'analysis' ? '' : 'hidden'}`}><Dashboard /></div>
        <div className={`absolute inset-0 ${tab === 'profile' ? '' : 'hidden'}`}><Profile /></div>
      </main>

      {/* === Bottom tab bar (MOBILE) — iOS-native style === */}
      <nav
        className="md:hidden flex items-stretch justify-around border-t border-border bg-background/95 backdrop-blur-xl flex-shrink-0 native-ios-tabbar"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          height: 'calc(56px + env(safe-area-inset-bottom, 0px))',
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
                // Tactile feedback on tab switch
                const { hapticTap } = await import('../native/bridge');
                hapticTap();
              }}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:bg-secondary/50 ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              <span className="text-[10px] font-medium tracking-tight">{label}</span>
            </button>
          );
        })}
      </nav>

      <Toaster richColors position="top-center" />
    </div>
  );
}
