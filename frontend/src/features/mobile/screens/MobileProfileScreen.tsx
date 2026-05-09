import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../../store/auth';
import { useGoals } from '../../goals/hooks/useGoals';
import { useGos } from '../../goals/hooks/useGos';
import { useRoutines } from '../../routines/hooks/useRoutines';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileShell } from '../components/MobileShell';
import type { Tab } from '../../../app/tabs';

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

  const handleSignOut = () => {
    if (!window.confirm('Sign out of this device?')) return;
    logout();
  };

  const themeLabel = dark ? 'Dark' : 'Light';

  const topBar = (
    <MobileTopBar
      title="Profile"
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

      <Section label="Account">
        <Row label="Name"  value={user?.username ?? '—'} arrow />
        <Row label="Email" value={user?.email    ?? '—'} arrow />
      </Section>

      <Section label="Appearance">
        <Row
          label="Theme"
          value={themeLabel}
          arrow
          onClick={onToggleTheme}
        />
      </Section>

      <Section label="Data">
        <Row label="Export to JSON" arrow onClick={() => toast.info('Export coming soon')} />
        <Row label="Import from CSV" arrow onClick={() => toast.info('Import coming soon')} />
      </Section>

      <Section label="About">
        <Row label="Version" value="1.0.0" />
        <Row label="Send feedback" arrow onClick={() => window.open('mailto:support@jarvnote.ru', '_blank')} />
        <Row label="Sign out" arrow danger onClick={handleSignOut} />
      </Section>
    </MobileShell>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="pf-section">
      <div className="pf-section-label">{label}</div>
      <div className="pf-section-body">{children}</div>
    </section>
  );
}

function Row({
  label, value, arrow, danger, onClick,
}: {
  label: string;
  value?: string;
  arrow?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`pf-row${danger ? ' pf-row-danger' : ''}`}
      onClick={onClick}
    >
      <span className="pf-row-label">{label}</span>
      <span className="pf-row-right">
        {value && <span className="pf-row-value">{value}</span>}
        {arrow && <span className="pf-row-arrow"><ChevronRight size={14} /></span>}
      </span>
    </button>
  );
}

