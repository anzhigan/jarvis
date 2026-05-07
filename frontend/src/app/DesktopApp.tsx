import { lazy, Suspense, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DesktopShell } from '../components/shell/DesktopShell';
import { CommandPalette } from '../components/shell/CommandPalette';
import { TooltipProvider } from '../components/ui';
import { useShortcuts } from '../hooks/useShortcuts';
import type { Tab } from './tabs';

const NotesView    = lazy(() => import('../features/notes/components/NotesView'));
const GoalsView    = lazy(() => import('../features/goals/components/GoalsView'));
const RoutinesView = lazy(() => import('../features/routines/components/RoutinesView'));
const SprintsView  = lazy(() => import('../features/sprints/components/SprintsView'));
const AnalysisView = lazy(() => import('../features/analytics/components/AnalysisView'));
const ProfileView  = lazy(() => import('../features/profile/components/ProfileView'));

interface Props {
  tab: Tab;
  onTabChange: (next: Tab) => void;
  dark: boolean;
  onToggleTheme: () => void;
}

function ViewFallback() {
  return (
    <main className="content">
      <div className="content-empty">
        <Loader2 size={20} className="animate-spin" />
      </div>
    </main>
  );
}

export function DesktopApp({ tab, onTabChange, dark, onToggleTheme }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useShortcuts({
    bindings: {
      openPalette: { keys: { key: 'k', modifiers: ['mod'] }, handler: () => setPaletteOpen(true) },
      slashSearch: { keys: { key: '/' }, handler: () => setPaletteOpen(true) },
      toggleTheme: { keys: { key: 'l', modifiers: ['mod', 'shift'] }, handler: onToggleTheme },
      escape:      { keys: { key: 'Escape' }, handler: () => setPaletteOpen(false) },
    },
    sequences: {
      g: {
        n: () => onTabChange('notes'),
        g: () => onTabChange('tasks'),
        r: () => onTabChange('routines'),
        s: () => onTabChange('sprints'),
        a: () => onTabChange('analysis'),
        p: () => onTabChange('profile'),
      },
    },
    enabled: !paletteOpen,
  });

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={150}>
      <DesktopShell
        tab={tab}
        onTabChange={onTabChange}
        dark={dark}
        onToggleTheme={onToggleTheme}
        onOpenSearch={() => setPaletteOpen(true)}
      >
        <Suspense fallback={<ViewFallback />}>
          {tab === 'notes'    && <NotesView />}
          {tab === 'tasks'    && <GoalsView />}
          {tab === 'routines' && <RoutinesView />}
          {tab === 'sprints'  && <SprintsView />}
          {tab === 'analysis' && <AnalysisView />}
          {tab === 'profile'  && <ProfileView />}
        </Suspense>
      </DesktopShell>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onTabChange={onTabChange}
        onToggleTheme={onToggleTheme}
        onSelectNote={(n) => {
          localStorage.setItem('jarvnote:notes:selectedId', n.id);
          window.dispatchEvent(new CustomEvent('jarvnote:openNote', { detail: n.id }));
        }}
      />
    </TooltipProvider>
  );
}
