import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import type { Tab } from './tabs';

export type { Tab };

// Each screen lazy-loads its own bundle. Tabs visited get cached in the bundle
// cache automatically by Vite/React; we don't keep them mounted.
const MobileNotesScreen    = lazy(() => import('../features/mobile/screens/MobileNotesScreen'));
const MobileGoalsScreen    = lazy(() => import('../features/mobile/screens/MobileGoalsScreen'));
const MobileRoutinesScreen = lazy(() => import('../features/mobile/screens/MobileRoutinesScreen'));
const MobileSprintsScreen  = lazy(() => import('../features/mobile/screens/MobileSprintsScreen'));
const MobileAnalysisScreen = lazy(() => import('../features/mobile/screens/MobileAnalysisScreen'));
const MobileProfileScreen  = lazy(() => import('../features/mobile/screens/MobileProfileScreen'));

interface Props {
  tab: Tab;
  onTabChange: (next: Tab) => void;
  dark: boolean;
  onToggleTheme: () => void;
}

function TabFallback() {
  return (
    <div style={{
      display: 'grid', placeItems: 'center', height: '100dvh',
      background: 'var(--paper)', color: 'var(--ink-4)',
    }}>
      <Loader2 size={24} className="animate-spin" />
    </div>
  );
}

export function MobileApp({ tab, onTabChange, dark, onToggleTheme }: Props) {
  const { user } = useAuthStore();

  // Track the previous (non-profile) tab so the Profile back-button returns
  // to wherever the user came from instead of always landing on Notes.
  const previousTabRef = useRef<Tab>(tab === 'profile' ? 'notes' : tab);
  useEffect(() => {
    if (tab !== 'profile') previousTabRef.current = tab;
  }, [tab]);

  const onAvatarClick = useCallback(() => onTabChange('profile'), [onTabChange]);

  if (!user) return null;

  return (
    <Suspense fallback={<TabFallback />}>
      {tab === 'notes' && (
        <MobileNotesScreen tab={tab} onTabChange={onTabChange} onAvatarClick={onAvatarClick} />
      )}
      {tab === 'tasks' && (
        <MobileGoalsScreen tab={tab} onTabChange={onTabChange} onAvatarClick={onAvatarClick} />
      )}
      {tab === 'routines' && (
        <MobileRoutinesScreen tab={tab} onTabChange={onTabChange} onAvatarClick={onAvatarClick} />
      )}
      {tab === 'sprints' && (
        <MobileSprintsScreen tab={tab} onTabChange={onTabChange} onAvatarClick={onAvatarClick} />
      )}
      {tab === 'analysis' && (
        <MobileAnalysisScreen tab={tab} onTabChange={onTabChange} onAvatarClick={onAvatarClick} />
      )}
      {tab === 'profile' && (
        <MobileProfileScreen
          tab={tab}
          previousTab={previousTabRef.current}
          onTabChange={onTabChange}
          dark={dark}
          onToggleTheme={onToggleTheme}
        />
      )}
    </Suspense>
  );
}
