import { useMemo, useState } from 'react';
import { Loader2, MoreHorizontal, Plus } from 'lucide-react';
import type { Sprint, SprintItem } from '../../../api/types';
import { useSprints, type SprintWithProgress } from '../../sprints/hooks/useSprints';
import { SprintForm } from '../components/MobileAddForms';
import { SwipeableRow } from '../components/SwipeableRow';
import { MobileConfirmSheet } from '../components/MobileConfirmSheet';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileShell } from '../components/MobileShell';
import type { Tab } from '../../../app/tabs';

interface Props {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onAvatarClick: () => void;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function fmtPeriod(start: string, end: string): string {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}
function weeksLeft(daysRemaining: number): string {
  if (daysRemaining <= 0) return 'closed';
  if (daysRemaining < 14) return `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`;
  const w = Math.round(daysRemaining / 7);
  return `${w} week${w === 1 ? '' : 's'} remaining`;
}

const ITEM_GLYPH: Record<SprintItem['item_type'], string> = {
  goal: '◯', step: '✓', go: '⚡', routine: '↻',
};

export default function MobileSprintsScreen({ tab, onTabChange, onAvatarClick }: Props) {
  const lib = useSprints();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Sprint | null>(null);

  const { featured, others } = useMemo(() => {
    const active = lib.decorated.filter((d) => d.bucket === 'active')
      .sort((a, b) => a.sprint.end_date.localeCompare(b.sprint.end_date));
    const upcoming = lib.decorated.filter((d) => d.bucket === 'upcoming')
      .sort((a, b) => a.sprint.start_date.localeCompare(b.sprint.start_date));
    const past = lib.decorated.filter((d) => d.bucket === 'past')
      .sort((a, b) => b.sprint.end_date.localeCompare(a.sprint.end_date));
    const featured = active[0] ?? null;
    const others = [
      ...(featured ? active.slice(1) : []),
      ...upcoming,
      ...past.slice(0, 5),
    ];
    return { featured, others };
  }, [lib.decorated]);

  const subtitle = `${lib.counts.active} active · ${lib.counts.upcoming} in queue`;
  const topBar = (
    <MobileTopBar
      title="Sprints"
      subtitle={subtitle}
      onAvatarClick={onAvatarClick}
    />
  );

  if (lib.loading) {
    return (
      <MobileShell topBar={topBar} tab={tab} onTabChange={onTabChange}>
        <div style={{ display: 'grid', placeItems: 'center', height: '60dvh', color: 'var(--ink-4)' }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell
      topBar={topBar}
      tab={tab}
      onTabChange={onTabChange}
    >
      <button type="button" className="m-add-btn" onClick={() => setCreateOpen(true)}>
        <Plus /> Sprint
      </button>

      {featured && (
        <SwipeableRow
          onEdit={() => setEditing(featured.sprint)}
          onDelete={() => setConfirmDelete(featured.sprint)}
        >
          <FeaturedSprint row={featured} />
        </SwipeableRow>
      )}

      {others.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Other sprints</span>
            <span className="sec-rule" />
            <span className="sec-meta">{others.length}</span>
          </div>
          <div className="other-sprints-list">
            {others.map((row) => (
              <SwipeableRow
                key={row.sprint.id}
                onEdit={() => setEditing(row.sprint)}
                onDelete={() => setConfirmDelete(row.sprint)}
              >
                <OtherSprint row={row} />
              </SwipeableRow>
            ))}
          </div>
        </>
      )}

      {!featured && others.length === 0 && (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: 'var(--ink-4)',
          fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5,
        }}>
          No sprints yet. Tap + to start one.
        </div>
      )}

      <SprintForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        library={lib}
      />
      <SprintForm
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        library={lib}
        editing={editing}
      />
      <MobileConfirmSheet
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Delete "${confirmDelete?.title ?? ''}"?`}
        description="The sprint will be removed. Linked goals/steps/gos/routines will not be deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDelete) await lib.remove(confirmDelete.id);
        }}
      />
    </MobileShell>
  );
}

function FeaturedSprint({ row }: { row: SprintWithProgress }) {
  const { sprint, daysRemaining, daysTotal, progress } = row;
  const elapsedPct = Math.round(progress * 100);
  // Pace: compare elapsed % vs items completion (we don't have per-item progress
  // resolved here, so fall back to elapsedPct as the headline).
  const pct = elapsedPct;
  const status = daysRemaining === 0 ? 'Closed'
    : pct < 75 ? 'On track'
    : 'Closing soon';

  return (
    <article className="sprint-featured">
      <header className="sf-head">
        <div className="sf-status">
          <span className="sf-status-dot" />
          <span className="sf-status-text">{status}</span>
        </div>
        <button className="sf-edit" aria-label="More"><MoreHorizontal /></button>
      </header>

      <h2 className="sf-name">{sprint.title}</h2>
      <p className="sf-period">
        {fmtPeriod(sprint.start_date, sprint.end_date)} · {weeksLeft(daysRemaining)}
      </p>
      {sprint.description && <p className="sf-desc">{sprint.description}</p>}

      <div className="sf-prog">
        <div className="sf-prog-num">{pct}<em>%</em></div>
        <div className="sf-prog-bar">
          <div className="sf-prog-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="sf-stats">
        <span><b>{row.daysElapsed}</b> of {daysTotal} days elapsed</span>
      </div>

      <div className="sf-items">
        <div className="sf-items-head">
          <span>Items in sprint</span>
          <span className="sf-items-rule" />
        </div>
        {sprint.items.length === 0 ? (
          <div style={{
            padding: 14, textAlign: 'center', color: 'var(--ink-4)',
            fontFamily: 'var(--font-body)', fontSize: 13,
          }}>
            No items linked yet.
          </div>
        ) : (
          <div className="sf-items-list">
            {sprint.items.map((item) => (
              <SprintItemRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function SprintItemRow({ item }: { item: SprintItem }) {
  const accent = item.color || 'var(--ink-4)';
  return (
    <div className="sp-item sp-item-on-track" style={{ ['--gc' as any]: accent }}>
      <span className="sp-item-kind">{ITEM_GLYPH[item.item_type]}</span>
      <div className="sp-item-text">
        <div className="sp-item-title">{item.title ?? `(${item.item_type})`}</div>
        <div className="sp-item-meta">{item.item_type}</div>
      </div>
    </div>
  );
}

function OtherSprint({ row }: { row: SprintWithProgress }) {
  const { sprint, bucket, progress } = row;
  const pct = Math.round(progress * 100);
  const statusLabel = bucket === 'active' ? 'Active' : bucket === 'upcoming' ? 'Upcoming' : 'Completed';
  const statusClass = bucket === 'active' ? 'os-status-on-track'
    : bucket === 'upcoming' ? 'os-status-upcoming'
    : 'os-status-done';
  const itemsCount = sprint.items.length;
  return (
    <article className="other-sprint">
      <header className="os-head">
        <span className={`os-status ${statusClass}`}>{statusLabel}</span>
        <button className="os-edit" aria-label="More"><MoreHorizontal /></button>
      </header>
      <h3 className="os-name">{sprint.title}</h3>
      <div className="os-period">{fmtPeriod(sprint.start_date, sprint.end_date)}</div>
      <div className="os-prog">
        <div className="os-bar"><div className="os-bar-fill" style={{ width: `${pct}%` }} /></div>
        <span className="os-pct">{pct}%</span>
      </div>
      <footer className="os-foot">
        <span className="os-items">{itemsCount} item{itemsCount === 1 ? '' : 's'}</span>
      </footer>
    </article>
  );
}
