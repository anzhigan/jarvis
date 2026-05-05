import { useEffect, useState } from 'react';
import {
  BookOpen, Target, Repeat, Zap, BarChart3, Search, PanelLeftClose, PanelLeftOpen,
  Moon, Sun, Settings,
} from 'lucide-react';
import { resolveUrl } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { useT } from '../../store/i18n';
import { Avatar, IconButton, Kbd, Tooltip } from '../ui';

export type Tab = 'notes' | 'tasks' | 'routines' | 'sprints' | 'analysis' | 'profile';

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

export function DesktopShell({ tab, onTabChange, dark, onToggleTheme, onOpenSearch, children }: Props) {
  const { user } = useAuthStore();
  const t = useT();

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('jarvnote:sidebar:v4') === 'collapsed';
  });
  useEffect(() => {
    localStorage.setItem('jarvnote:sidebar:v4', collapsed ? 'collapsed' : 'open');
  }, [collapsed]);

  if (!user) return null;

  return (
    <div className="dt-root">
      <div className="dt-shell">
        <aside className="dt-sidebar" data-collapsed={collapsed}>
          <div className="dt-sidebar-head">
            {!collapsed && <span className="dt-brand">Jarvnote</span>}
            <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
              <IconButton size="sm" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar">
                {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
              </IconButton>
            </Tooltip>
          </div>

          {!collapsed && (
            <div className="dt-sidebar-search">
              <button type="button" className="dt-sidebar-search-btn" onClick={onOpenSearch}>
                <Search size={12} />
                <span>{t('search.placeholder') || 'Search…'}</span>
                <Kbd className="kbd-suffix" keys={['mod', 'k']} />
              </button>
            </div>
          )}

          {!collapsed && <div className="dt-sidebar-section">Workspace</div>}

          <nav className="dt-sidebar-nav">
            {NAV.map(({ key, labelKey, icon: Icon, acc }) => {
              const active = tab === key;
              const node = (
                <button
                  key={key}
                  className="dt-nav-item"
                  data-active={active || undefined}
                  data-acc={acc}
                  onClick={() => onTabChange(key)}
                >
                  <Icon className="icon" />
                  {!collapsed && <span>{t(labelKey)}</span>}
                </button>
              );
              return collapsed ? (
                <Tooltip key={key} content={t(labelKey)} side="right">{node}</Tooltip>
              ) : node;
            })}
          </nav>

          <div className="dt-sidebar-foot">
            <div className="dt-sidebar-foot-row">
              <button className="dt-profile-row" onClick={() => onTabChange('profile')}>
                <Avatar
                  src={user.avatar_url ? resolveUrl(user.avatar_url) : undefined}
                  name={user.username}
                  size="sm"
                />
                {!collapsed && <span className="dt-profile-name">{user.username}</span>}
              </button>
              {!collapsed && (
                <>
                  <Tooltip content={dark ? 'Light theme' : 'Dark theme'} side="top">
                    <IconButton size="sm" onClick={onToggleTheme} aria-label="Toggle theme">
                      {dark ? <Sun size={14} /> : <Moon size={14} />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip content="Settings" side="top">
                    <IconButton size="sm" onClick={() => onTabChange('profile')} aria-label="Settings">
                      <Settings size={14} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </div>
          </div>
        </aside>

        <div className="dt-workspace">
          <main className="dt-main">{children}</main>
        </div>
      </div>
    </div>
  );
}
