import { useMemo } from 'react';
import {
  ChevronLeft, FileDown, FileUp, LogOut, Mail, Moon, Send, Sun, Target, User,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../../store/auth';
import { useGoals } from '../../goals/hooks/useGoals';
import { useGos } from '../../goals/hooks/useGos';
import { useRoutines } from '../../routines/hooks/useRoutines';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileShell } from '../components/MobileShell';
import { MobileListGroup, MobileListCell } from '../components/MobileList';
import type { Tab } from '../../../app/tabs';
import { confirmDialog } from '../../../components/ui';

interface Props {
  tab: Tab;
  /** Where to navigate after closing the profile screen (back arrow). */
  previousTab: Tab;
  onTabChange: (tab: Tab) => void;
  dark: boolean;
  onToggleTheme: () => void;
}

export default function MobileProfileScreen({
  tab, previousTab, onTabChange, dark, onToggleTheme,
}: Props) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const goals = useGoals();
  const gos = useGos(goals);
  const routines = useRoutines();

  const stats = useMemo(() => {
    const entries =
      gos.gos.reduce((s, g) => s + g.entries.length, 0) +
      routines.routines.reduce((s, r) => s + r.entries.length, 0);

    // First-seen date = oldest entry across routines + gos. Used for "Member since".
    let firstISO: string | null = null;
    for (const r of routines.routines) {
      for (const e of r.entries) {
        if (!firstISO || e.date < firstISO) firstISO = e.date;
      }
    }
    for (const g of gos.gos) {
      for (const e of g.entries) {
        if (!firstISO || e.date < firstISO) firstISO = e.date;
      }
    }

    let weeks = 0;
    if (firstISO) {
      const start = new Date(firstISO).getTime();
      weeks = Math.max(0, Math.floor((Date.now() - start) / (7 * 86_400_000)));
    }

    return {
      entries,
      weeks,
      routines: routines.routines.length,
      goals: goals.tasks.length,
      firstISO,
    };
  }, [gos.gos, routines.routines, goals.tasks]);

  const memberSince = stats.firstISO
    ? new Date(stats.firstISO).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;
  const tagline = memberSince ? `Active since ${memberSince}` : '';

  const initial = (user?.username?.[0] ?? user?.email?.[0] ?? 'A').toUpperCase();

  const handleSignOut = async () => {
    const ok = await confirmDialog({
      title: 'Sign out?',
      body: 'You will be signed out of this device.',
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    logout();
  };

  const topBar = (
    <MobileTopBar
      title="Profile"
      mode="compact"
      leftSlot={
        <button
          type="button"
          className="tb-btn"
          onClick={() => onTabChange(previousTab)}
          aria-label="Back"
        ><ChevronLeft size={18} /></button>
      }
      rightSlot={<div className="tb-spacer" />}
    />
  );

  return (
    <MobileShell topBar={topBar} tab={tab} onTabChange={onTabChange}>
      {/* Hero ─────────────────────────────────────────────────────────── */}
      <header className="pf-header">
        <div className="pf-avatar-big">{initial}</div>
        <div className="pf-info">
          <h1 className="pf-name">{user?.username ?? 'You'}</h1>
          {tagline && <p className="pf-tagline">{tagline}</p>}
        </div>
      </header>

      <div className="pf-stats">
        <div className="pf-stat">
          <div className="pf-stat-num">{stats.entries.toLocaleString()}</div>
          <div className="pf-stat-lab">Entries</div>
        </div>
        <div className="pf-stat">
          <div className="pf-stat-num">{stats.weeks}</div>
          <div className="pf-stat-lab">Weeks</div>
        </div>
        <div className="pf-stat">
          <div className="pf-stat-num">{stats.routines}</div>
          <div className="pf-stat-lab">Routines</div>
        </div>
        <div className="pf-stat">
          <div className="pf-stat-num">{stats.goals}</div>
          <div className="pf-stat-lab">Goals</div>
        </div>
      </div>

      {/* Account ──────────────────────────────────────────────────────── */}
      <MobileListGroup label="Account">
        <MobileListCell
          icon={<User size={15} />}
          iconColor="indigo"
          title="Name"
          trailing={user?.username ?? '—'}
          chevron
        />
        <MobileListCell
          icon={<Mail size={15} />}
          iconColor="slate"
          title="Email"
          trailing={user?.email ?? '—'}
          chevron
        />
      </MobileListGroup>

      {/* Appearance ───────────────────────────────────────────────────── */}
      <MobileListGroup label="Appearance">
        <MobileListCell
          icon={dark ? <Moon size={15} /> : <Sun size={15} />}
          iconColor={dark ? 'slate' : 'ochre'}
          title="Theme"
          trailing={dark ? 'Dark' : 'Light'}
          chevron
          onClick={onToggleTheme}
        />
      </MobileListGroup>

      {/* Data ─────────────────────────────────────────────────────────── */}
      <MobileListGroup label="Data">
        <MobileListCell
          icon={<FileDown size={15} />}
          iconColor="moss"
          title="Export to JSON"
          chevron
          onClick={() => toast.info('Export coming soon')}
        />
        <MobileListCell
          icon={<FileUp size={15} />}
          iconColor="moss"
          title="Import from CSV"
          chevron
          onClick={() => toast.info('Import coming soon')}
        />
      </MobileListGroup>

      {/* About ────────────────────────────────────────────────────────── */}
      <MobileListGroup label="About">
        <MobileListCell
          icon={<Target size={15} />}
          iconColor="slate"
          title="Version"
          trailing="1.0.0"
        />
        <MobileListCell
          icon={<Send size={15} />}
          iconColor="indigo"
          title="Send feedback"
          chevron
          onClick={() => window.open('mailto:support@jarvnote.ru', '_blank')}
        />
        <MobileListCell
          icon={<LogOut size={15} />}
          iconColor="rust"
          title="Sign out"
          destructive
          chevron
          onClick={handleSignOut}
        />
      </MobileListGroup>

      {/* Bottom breathing room for the tab bar */}
      <div style={{ height: 24 }} />
    </MobileShell>
  );
}
