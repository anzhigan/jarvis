import { useEffect, useState } from 'react';
import {
  Search, BookOpen, Target, Repeat, Zap, BarChart3, Moon, PanelLeft, Sun,
} from 'lucide-react';
import { resolveUrl } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { useT } from '../../store/i18n';
import { Tooltip } from '../ui';
import type { Tab } from '../../app/tabs';
import { sectionForTab } from '../../app/tabs';

const NAV: { key: Tab; labelKey: string; icon: React.ElementType; acc: string }[] = [
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
            <g transform="rotate(25 16 16)">
              <rect x="-3" y="14.6" width="7" height="2.8" rx="1.4" fill="var(--soft)" />
              <rect x="28" y="14.6" width="7" height="2.8" rx="1.4" fill="var(--soft)" />
              <path
                d="M16 3 C16 10 13 13 6 16 C13 19 16 22 16 29 C16 22 19 19 26 16 C19 13 16 10 16 3 Z"
                fill="currentColor"
              />
            </g>
          </svg>
        </div>

        <div className="rail-section">
          <Tooltip content={`${t('search.placeholder') || 'Search'} (⌘K)`} side="right">
            <button className="rail-btn" onClick={onOpenSearch} aria-label="Search">
              <Search />
            </button>
          </Tooltip>
          {tab === 'notes' && (
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
          )}
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
          <Tooltip content={dark ? 'Light theme' : 'Dark theme'} side="right">
            <button className="rail-btn" onClick={onToggleTheme} aria-label="Toggle theme">
              {dark ? <Sun /> : <Moon />}
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
