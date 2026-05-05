import { lazy, Suspense, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DesktopShell, type Tab } from '../components/shell/DesktopShell';
import { CommandPalette } from '../components/shell/CommandPalette';
import { TooltipProvider } from '../components/ui';
import { useShortcuts } from '../hooks/useShortcuts';

const NotesView    = lazy(() => import('../components/views/NotesView'));
const GoalsView    = lazy(() => import('../components/views/GoalsView'));
const RoutinesView = lazy(() => import('../components/views/RoutinesView'));
const SprintsView  = lazy(() => import('../components/views/SprintsView'));
const AnalysisView = lazy(() => import('../components/views/AnalysisView'));
const ProfileView  = lazy(() => import('../components/views/ProfileView'));

interface Props {
  tab: Tab;
  onTabChange: (next: Tab) => void;
  dark: boolean;
  onToggleTheme: () => void;
}

function ViewFallback() {
  return (
    <div className="size-full flex items-center justify-center">
      <Loader2 size={24} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
    </div>
  );
}

export function DesktopApp({ tab, onTabChange, dark, onToggleTheme }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useShortcuts({
    bindings: {
      openPalette: {
        keys: { key: 'k', modifiers: ['mod'] },
        handler: () => setPaletteOpen(true),
      },
      slashSearch: {
        keys: { key: '/' },
        handler: () => setPaletteOpen(true),
      },
      toggleTheme: {
        keys: { key: 'l', modifiers: ['mod', 'shift'] },
        handler: onToggleTheme,
      },
      escape: {
        keys: { key: 'Escape' },
        handler: () => setPaletteOpen(false),
      },
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
