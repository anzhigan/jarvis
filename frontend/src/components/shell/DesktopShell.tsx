import { useEffect, useState } from 'react';
import { Search, PanelLeft } from 'lucide-react';
import { resolveUrl } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { useT } from '../../store/i18n';
import { Tooltip } from '../ui';
import { PomodoroPanel } from './PomodoroPanel';
import {
  AnalysisIcon, GoalsIcon, MoonIcon, NotesIcon, RoutinesIcon, SprintsIcon, SunIcon,
} from '../SectionIcons';
import type { Tab } from '../../app/tabs';
import { sectionForTab } from '../../app/tabs';

const NAV: { key: Tab; labelKey: string; icon: React.ElementType; acc: string }[] = [
  { key: 'notes',    labelKey: 'nav.notes',    icon: NotesIcon,    acc: 'notes' },
  { key: 'tasks',    labelKey: 'nav.tasks',    icon: GoalsIcon,    acc: 'goals' },
  { key: 'routines', labelKey: 'nav.routines', icon: RoutinesIcon, acc: 'routines' },
  { key: 'sprints',  labelKey: 'nav.sprints',  icon: SprintsIcon,  acc: 'sprints' },
  { key: 'analysis', labelKey: 'nav.analysis', icon: AnalysisIcon, acc: 'analysis' },
];

interface Props {
  tab: Tab;
  onTabChange: (next: Tab) => void;
  dark: boolean;
  onToggleTheme: () => void;
  onOpenSearch: () => void;
  children: React.ReactNode;
}

const NOTES_PANE_KEY = 'jarvnote:notes:libCollapsed';

export function DesktopShell({ tab, onTabChange, dark, onToggleTheme, onOpenSearch, children }: Props) {
  const { user } = useAuthStore();
  const t = useT();

  // Mirror the Notes-pane collapsed flag so the rail toggle can show its
  // active state. NotesView is the source of truth (persists to localStorage);
  // we just react to its broadcast event.
  const [notesPaneCollapsed, setNotesPaneCollapsed] = useState(
    () => typeof localStorage !== 'undefined'
      && localStorage.getItem(NOTES_PANE_KEY) === '1',
  );
  useEffect(() => {
    const handler = (e: Event) => {
      const collapsed = (e as CustomEvent<boolean>).detail;
      if (typeof collapsed === 'boolean') setNotesPaneCollapsed(collapsed);
    };
    window.addEventListener('jarvnote:notesPaneState', handler);
    return () => window.removeEventListener('jarvnote:notesPaneState', handler);
  }, []);

  if (!user) return null;

  const initial = (user.username?.[0] ?? '?').toUpperCase();
  const avatarSrc = user.avatar_url ? resolveUrl(user.avatar_url) : undefined;

  return (
    <div className="dk-shell" data-section={sectionForTab(tab)}>
      <aside className="rail">
        <div className="rail-brand" aria-label="Jarvnote">
          <svg viewBox="0 0 32 32" fill="none">
            {/* Ring removed; sparkle grows to fill the box. Path is the same
                four-point editorial sparkle from before, scaled to 28px tall. */}
            <g transform="rotate(25 16 16)">
              <path
                d="M16 2 C16 9 13 12 5 16 C13 20 16 23 16 30 C16 23 19 20 27 16 C19 12 16 9 16 2 Z"
                fill="currentColor"
              />
            </g>
          </svg>
        </div>

        <div className="rail-section">
          {/* Hide-sidebar slot — only active in Notes, but the slot is always
              present (rendered as a hidden placeholder elsewhere) so the nav
              buttons below stay in the same vertical position across sections. */}
          {tab === 'notes' ? (
            <Tooltip content={notesPaneCollapsed ? 'Show sidebar' : 'Hide sidebar'} side="right">
              <button
                className="rail-btn"
                aria-label="Toggle sidebar"
                aria-pressed={!notesPaneCollapsed}
                data-active={!notesPaneCollapsed || undefined}
                onClick={() => window.dispatchEvent(
                  new CustomEvent('jarvnote:toggleNotesPane'),
                )}
              >
                <PanelLeft />
              </button>
            </Tooltip>
          ) : (
            <div className="rail-btn rail-btn-placeholder" aria-hidden="true" />
          )}
          <Tooltip content={`${t('search.placeholder') || 'Search'} (⌘K)`} side="right">
            <button className="rail-btn" onClick={onOpenSearch} aria-label="Search">
              <Search />
            </button>
          </Tooltip>
        </div>

        <div className="rail-divider" />

        <div className="rail-section">
          {NAV.map(({ key, labelKey, icon: Icon, acc }) => {
            const active = tab === key;
            return (
              <Tooltip key={key} content={t(labelKey)} side="right">
                <button
                  className="rail-btn"
                  data-active={active || undefined}
                  data-acc={acc}
                  onClick={() => onTabChange(key)}
                  aria-label={t(labelKey)}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon />
                </button>
              </Tooltip>
            );
          })}
        </div>

        <div className="rail-foot">
          <PomodoroPanel />
          <Tooltip content={dark ? 'Light theme' : 'Dark theme'} side="right">
            <button className="rail-btn" onClick={onToggleTheme} aria-label="Toggle theme">
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </Tooltip>
          <Tooltip content={user.username} side="right">
            <button
              className="rail-avatar"
              onClick={() => onTabChange('profile')}
              aria-label="Profile"
              data-active={tab === 'profile' || undefined}
            >
              {avatarSrc ? <img src={avatarSrc} alt="" /> : initial}
            </button>
          </Tooltip>
        </div>
      </aside>

      {children}
    </div>
  );
}
