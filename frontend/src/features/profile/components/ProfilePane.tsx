import {
  Database, Globe, HelpCircle, Info, PaintBucket, PanelLeftClose, Search, Shield, User,
} from 'lucide-react';

export type ProfileSectionKey = 'account' | 'appearance';

interface Props {
  active: ProfileSectionKey;
  onSelect: (key: ProfileSectionKey) => void;
  search: string;
  setSearch: (s: string) => void;
  collapsed: boolean;
  onCollapseToggle: () => void;
  memberSince: string;
}

const SETTINGS: { key: ProfileSectionKey | 'language' | 'data'; label: string; icon: React.ElementType; ready: boolean }[] = [
  { key: 'account',    label: 'Account',       icon: User,         ready: true  },
  { key: 'appearance', label: 'Appearance',    icon: PaintBucket,  ready: true  },
  { key: 'language',   label: 'Language',      icon: Globe,        ready: false },
  { key: 'data',       label: 'Data & export', icon: Database,     ready: false },
];

const ABOUT = [
  { key: 'privacy', label: 'Privacy', icon: Shield     },
  { key: 'terms',   label: 'Terms',   icon: Info       },
  { key: 'help',    label: 'Help',    icon: HelpCircle },
];

/**
 * Profile library pane — Settings group (Account/Appearance are wired and
 * scroll to their canvas section; Language and Data are visible-but-disabled
 * placeholders for the planned shape) and About group (also placeholders).
 */
export function ProfilePane({
  active, onSelect, search, setSearch, collapsed, onCollapseToggle, memberSince,
}: Props) {
  return (
    <aside className="pane" data-collapsed={collapsed || undefined}>
      <header className="pane-head">
        <div className="pane-eyebrow">Settings & shelf</div>
        <div className="pane-title">Profile</div>
        <div className="pane-sub">{memberSince}</div>
      </header>

      <div className="pane-tools">
        <label className="field">
          <Search />
          <input
            placeholder="Search settings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          className="collapse-btn"
          title="Hide library"
          onClick={onCollapseToggle}
          aria-label="Hide library"
        >
          <PanelLeftClose />
        </button>
      </div>

      <div className="pane-body">
        <div className="pane-section">
          <div className="pane-section-label">Settings</div>
          {SETTINGS.map(({ key, label, icon: Icon, ready }) => (
            <button
              key={key}
              className="lib-row"
              data-active={ready && key === active || undefined}
              disabled={!ready}
              onClick={() => ready && onSelect(key as ProfileSectionKey)}
              title={ready ? undefined : 'Coming soon'}
            >
              <span className="ico"><Icon /></span>
              <span className="name">{label}</span>
            </button>
          ))}
        </div>

        <div className="pane-section">
          <div className="pane-section-label">About</div>
          {ABOUT.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className="lib-row"
              disabled
              title="Coming soon"
            >
              <span className="ico"><Icon /></span>
              <span className="name">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
