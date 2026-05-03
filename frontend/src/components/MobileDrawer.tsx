import { BookOpen, Target, Repeat, Zap, BarChart3, LogOut, Moon, Sun } from 'lucide-react';
import { resolveUrl } from '../api/client';
import { useAuthStore } from '../store/auth';
import type { User } from '../api/types';

interface Props {
  open: boolean;
  onClose: () => void;
  user: User;
  activeTab: string;
  onNavigate: (tab: string) => void;
  dark: boolean;
  onToggleTheme: () => void;
}

const NAV_ITEMS = [
  { key: 'notes',    label: 'Notes',    icon: BookOpen,  acc: 'notes' },
  { key: 'tasks',    label: 'Goals',    icon: Target,    acc: 'goals' },
  { key: 'routines', label: 'Routines', icon: Repeat,    acc: 'routines' },
  { key: 'sprints',  label: 'Sprints',  icon: Zap,       acc: 'sprints' },
  { key: 'analysis', label: 'Analysis', icon: BarChart3, acc: 'analysis' },
];

export default function MobileDrawer({ open, onClose, user, activeTab, onNavigate, dark, onToggleTheme }: Props) {
  if (!open) return null;

  return (
    <div className="drawer-root" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          {user.avatar_url
            ? <img src={resolveUrl(user.avatar_url)} alt="" className="avatar" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} />
            : <div className="avatar">{user.username.charAt(0).toUpperCase()}</div>}
          <div className="info">
            <div className="name">{user.username}</div>
          </div>
        </div>

        <div className="nav-section">Workspace</div>
        {NAV_ITEMS.map(({ key, label, icon: Icon, acc }) => (
          <button
            key={key}
            className={`nav-item${activeTab === key ? ' active' : ''}`}
            data-acc={acc}
            onClick={() => { onNavigate(key); onClose(); }}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}

        <div className="nav-section" style={{ marginTop: 8 }}>Account</div>
        <button className="nav-item" onClick={onToggleTheme}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
          Theme
          <span className="right">{dark ? 'Dark' : 'Light'}</span>
        </button>
        <button className="nav-item" style={{ color: 'var(--danger)' }} onClick={() => { useAuthStore.getState().logout(); onClose(); }}>
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  );
}
