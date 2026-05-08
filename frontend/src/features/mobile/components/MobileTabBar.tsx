import { BookOpen, Repeat, Target, Zap, BarChart3 } from 'lucide-react';
import type { Tab } from '../../../app/tabs';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

/** 5-tab bottom navigation matching jarvnote-mobile.html.
 *  Profile is reachable via the avatar in MobileTopBar — not via a tab. */
const TABS: { key: Tab; label: string; Icon: React.ElementType }[] = [
  { key: 'notes',    label: 'Notes',    Icon: BookOpen },
  { key: 'routines', label: 'Routines', Icon: Repeat   },
  { key: 'tasks',    label: 'Goals',    Icon: Target   },
  { key: 'sprints',  label: 'Sprints',  Icon: Zap      },
  { key: 'analysis', label: 'Analysis', Icon: BarChart3 },
];

export function MobileTabBar({ active, onChange }: Props) {
  return (
    <nav className="tab-bar" role="tablist">
      {TABS.map(({ key, label, Icon }) => {
        const on = active === key;
        return (
          <button
            key={key}
            type="button"
            className="tab-btn"
            data-active={on || undefined}
            onClick={() => onChange(key)}
            aria-selected={on}
            role="tab"
          >
            <span className="tab-ico">
              <Icon size={22} strokeWidth={on ? 2 : 1.7} />
            </span>
            <span className="tab-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
