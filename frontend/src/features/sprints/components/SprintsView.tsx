import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Repeat, Target, Zap, ListChecks } from 'lucide-react';
import type { Sprint, SprintItem } from '../../../api/types';
import { useSprints, type SprintWithProgress } from '../hooks/useSprints';
import { useSprintsFilters, type ViewFilter } from '../hooks/useSprintsFilters';
import { SprintDetailPanel } from './SprintDetailPanel';
import { SprintCreateDialog } from './SprintCreateDialog';
import './sprints.css';

const VIEW_LABELS: Record<ViewFilter, string> = {
  all: 'All', active: 'Active', upcoming: 'Upcoming', past: 'Past',
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtPeriod(start: string, end: string): string {
  const s = new Date(start), e = new Date(end);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(s)} — ${fmt(e)}`;
}
function fmtClosed(end: string): string {
  return `closed ${new Date(end).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

const ITEM_ICON: Record<SprintItem['item_type'], React.ElementType> = {
  goal:    Target,
  step:    ListChecks,
  go:      Zap,
  routine: Repeat,
};
const ITEM_KIND_LABEL: Record<SprintItem['item_type'], string> = {
  goal: 'Goal', step: 'Step', go: 'Go', routine: 'Routine',
};

function FeaturedSprint({ row, onSelect }: { row: SprintWithProgress; onSelect: (id: string) => void }) {
  const { sprint, daysRemaining, daysTotal } = row;
  const pct = Math.round(row.progress * 100);
  const items = sprint.items;
  // Pace projection: if elapsed% > progress% by > 15 — behind; if behind much — at risk.
  const elapsedPct = ((daysTotal - daysRemaining) / Math.max(1, daysTotal)) * 100;
  const pace =
    pct >= elapsedPct ? 'on track'
    : pct + 15 >= elapsedPct ? 'slowing'
    : 'behind';

  return (
    <article
      className="sp-featured"
      onClick={() => onSelect(sprint.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(sprint.id); }}
    >
      <div className="sp-featured-head">
        <div>
          <div className="sp-featured-period">{fmtPeriod(sprint.start_date, sprint.end_date)}</div>
          <h2 className="sp-featured-title">{sprint.title}</h2>
          {sprint.description && <p className="sp-featured-desc">{sprint.description}</p>}
        </div>
        <div className="sp-featured-status">
          <div className="sp-featured-pct">
            {pct}<em>%</em>
          </div>
          <div className="sp-featured-pct-label">complete</div>
        </div>
      </div>

      <div className="sp-featured-bar">
        <div className="sp-featured-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="sp-featured-meta">
        <div className="sp-featured-meta-cell">
          <span className="sp-featured-meta-num">{items.length}<em> items</em></span>
          <span className="sp-featured-meta-label">In this sprint</span>
        </div>
        <div className="sp-featured-meta-cell">
          <span className="sp-featured-meta-num">{daysRemaining}<em> {daysRemaining === 1 ? 'day' : 'days'}</em></span>
          <span className="sp-featured-meta-label">Time remaining</span>
        </div>
        <div className="sp-featured-meta-cell">
          <span className="sp-featured-meta-num">{pace}</span>
          <span className="sp-featured-meta-label">Pace projection</span>
        </div>
      </div>

      {items.length > 0 && (
        <>
          <div className="sp-items-head">— Items in this sprint</div>
          <div className="sp-items">
            {items.map((it) => {
              const Icon = ITEM_ICON[it.item_type];
              return (
                <div key={it.id} className="sp-item">
                  <span className="sp-item-icon"><Icon /></span>
                  <span className="sp-item-kind">{ITEM_KIND_LABEL[it.item_type]}</span>
                  <span className="sp-item-name">{it.title || `(unnamed ${it.item_type})`}</span>
                  <span className="sp-item-status">linked</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </article>
  );
}

function CompactCard({ row, onSelect }: { row: SprintWithProgress; onSelect: (id: string) => void }) {
  const { sprint, bucket, daysRemaining, daysTotal } = row;
  const pct = Math.round(row.progress * 100);
  const status = bucket === 'past' ? 'done' : bucket; // map 'past' → 'done' for CSS
  const startsIn = (() => {
    if (bucket !== 'upcoming') return null;
    const days = Math.max(0, Math.round(
      (new Date(sprint.start_date).getTime() - Date.now()) / 86400_000,
    ));
    return `starts in ${days} day${days === 1 ? '' : 's'}`;
  })();
  const itemsLabel = `${sprint.items.length} item${sprint.items.length === 1 ? '' : 's'}${bucket === 'upcoming' ? ' planned' : ''}`;

  return (
    <article
      className="sp-card-compact"
      data-status={status}
      onClick={() => onSelect(sprint.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(sprint.id); }}
    >
      <div className="sp-card-compact-period">{fmtPeriod(sprint.start_date, sprint.end_date)}</div>
      <h3 className="sp-card-compact-title">{sprint.title}</h3>
      {bucket === 'upcoming' && sprint.description && (
        <p className="sp-card-compact-desc">{sprint.description}</p>
      )}
      <div className="sp-card-compact-meta">
        {bucket === 'active' && (
          <>
            <span className="sp-card-compact-progress">{pct}% complete</span>
            <span className="sp-card-compact-sep">·</span>
            <span>{itemsLabel}</span>
            <span className="sp-card-compact-sep">·</span>
            <span className="sp-card-compact-days">
              {daysRemaining} day{daysRemaining === 1 ? '' : 's'} left
            </span>
          </>
        )}
        {bucket === 'upcoming' && (
          <>
            <span>{itemsLabel}</span>
            {startsIn && (
              <>
                <span className="sp-card-compact-sep">·</span>
                <span className="sp-card-compact-days">{startsIn}</span>
              </>
            )}
          </>
        )}
        {bucket === 'past' && (
          <>
            <span className="sp-card-compact-progress sp-progress-done">{pct}% complete</span>
            <span className="sp-card-compact-sep">·</span>
            <span>{itemsLabel}</span>
            <span className="sp-card-compact-sep">·</span>
            <span>{fmtClosed(sprint.end_date)}</span>
          </>
        )}
      </div>
      {bucket === 'active' && (
        <div className="sp-card-compact-bar">
          <div className="sp-card-compact-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {void daysTotal}
    </article>
  );
}

export default function SprintsView() {
  const library = useSprints();
  const f = useSprintsFilters();

  const [detailSprintId, setDetailSprintId] = useState<string | null>(null);
  const detailSprint = useMemo(
    () => library.decorated.find((d) => d.sprint.id === detailSprintId) ?? null,
    [library.decorated, detailSprintId],
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [templateDays, setTemplateDays] = useState<number | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const days = (e as CustomEvent<number>).detail;
      setTemplateDays(typeof days === 'number' && days > 0 ? days : null);
      setCreateOpen(true);
    };
    window.addEventListener('jarvnote:newSprintFromTemplate', handler);
    return () => window.removeEventListener('jarvnote:newSprintFromTemplate', handler);
  }, []);

  const onSelectSprint = useCallback((id: string) => setDetailSprintId(id), []);
  const onNewSprint = useCallback(() => setCreateOpen(true), []);
  // "Templates" pill-seg button opens the create dialog with default 14-day length —
  // matches gallery section 06 where the templates entry sits inline with the filters.
  const onTemplatesClick = useCallback(() => {
    setTemplateDays(14);
    setCreateOpen(true);
  }, []);

  const filtered = useMemo(() => f.apply(library.decorated), [f, library.decorated]);

  // Buckets within the filtered set.
  const today = ymd(new Date());
  void today;
  const active   = filtered.filter((d) => d.bucket === 'active');
  const upcoming = filtered.filter((d) => d.bucket === 'upcoming');
  const past     = filtered.filter((d) => d.bucket === 'past');

  // Featured sprint: active with the *closest* end date.
  const featured = active.length > 0
    ? [...active].sort((a, b) => a.sprint.end_date.localeCompare(b.sprint.end_date))[0]
    : null;
  const otherActive = featured ? active.filter((d) => d.sprint.id !== featured.sprint.id) : [];
  const recentCompleted = [...past]
    .sort((a, b) => b.sprint.end_date.localeCompare(a.sprint.end_date))
    .slice(0, 3);

  if (library.loading) {
    return (
      <main className="content">
        <div className="content-empty">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </main>
    );
  }

  // Headline depends on number of active sprints.
  const title = active.length === 0
    ? <>The runway, <em>open</em>.</>
    : <>{active.length} sprint{active.length === 1 ? '' : 's'}<br /><em>in flight</em>.</>;

  // Average completion across past sprints (for progress strip).
  const avgComplete = past.length === 0 ? 0 : Math.round(
    past.reduce((acc, d) => acc + (d.progress * 100), 0) / past.length,
  );

  return (
    <>
      <main className="content">
        <div className="content-bar">
          <div className="breadcrumb">
            <b>Sprints</b>
            <span className="breadcrumb-sep">›</span>
            <span>{VIEW_LABELS[f.filters.view]}</span>
          </div>
          <div className="pill-seg" role="tablist">
            {(['all', 'active', 'upcoming', 'past'] as ViewFilter[]).map((v) => (
              <button
                key={v}
                className={f.filters.view === v ? 'on' : ''}
                role="tab"
                aria-selected={f.filters.view === v}
                onClick={() => f.set('view', v)}
              >{VIEW_LABELS[v]}</button>
            ))}
            <button onClick={onTemplatesClick}>Templates</button>
          </div>
          <button className="new-btn" onClick={onNewSprint}>
            <Plus /> New sprint
          </button>
        </div>

        <div className="content-scroll">
          <header className="go-hero">
            <div className="go-kicker">Time-bound focus periods</div>
            <h1 className="go-hero-title">{title}</h1>
            <p className="go-lede">
              A sprint groups goals, steps, daily targets, and routines into a bounded period.
              When the period closes, you have a clear answer: what you finished, what you didn't,
              and what to carry forward.
            </p>
          </header>

          <div className="go-progress-strip">
            <div className="ps-cell">
              <div className="ps-num">{library.counts.active}</div>
              <div className="ps-label">Active</div>
            </div>
            <div className="ps-cell">
              <div className="ps-num">{library.counts.upcoming}</div>
              <div className="ps-label">Upcoming</div>
            </div>
            <div className="ps-cell">
              <div className="ps-num">{library.counts.past}</div>
              <div className="ps-label">Completed</div>
            </div>
            <div className="ps-cell">
              <div className="ps-num">{avgComplete}<em>%</em></div>
              <div className="ps-label">Avg completion</div>
            </div>
          </div>

          {featured && (f.filters.view === 'all' || f.filters.view === 'active') && (
            <>
              <div className="section-head">
                <span className="section-title">In focus now</span>
                <span className="section-rule" />
                <span className="section-meta">
                  {featured.daysRemaining} {featured.daysRemaining === 1 ? 'day' : 'days'} left
                  {featured.sprint.items.length > 0 && ` · ${featured.sprint.items.length} item${featured.sprint.items.length === 1 ? '' : 's'}`}
                </span>
              </div>
              <FeaturedSprint row={featured} onSelect={onSelectSprint} />
            </>
          )}

          {otherActive.length > 0 && (f.filters.view === 'all' || f.filters.view === 'active') && (
            <>
              <div className="section-head">
                <span className="section-title">Also active</span>
                <span className="section-rule" />
              </div>
              <div className="sp-grid">
                {otherActive.map((d) => (
                  <CompactCard key={d.sprint.id} row={d} onSelect={onSelectSprint} />
                ))}
              </div>
            </>
          )}

          {upcoming.length > 0 && (f.filters.view === 'all' || f.filters.view === 'upcoming') && (
            <>
              <div className="section-head">
                <span className="section-title">Upcoming</span>
                <span className="section-rule" />
                <span className="section-meta">Scheduled to start</span>
              </div>
              <div className="sp-grid">
                {upcoming.map((d) => (
                  <CompactCard key={d.sprint.id} row={d} onSelect={onSelectSprint} />
                ))}
              </div>
            </>
          )}

          {(f.filters.view === 'all' || f.filters.view === 'past') && recentCompleted.length > 0 && (
            <>
              <div className="section-head">
                <span className="section-title">
                  {f.filters.view === 'past' ? 'Completed' : 'Recently completed'}
                </span>
                <span className="section-rule" />
                {f.filters.view === 'all' && past.length > 3 && (
                  <span className="section-meta">Last 3 of {past.length}</span>
                )}
              </div>
              <div className="sp-grid sp-grid-completed">
                {(f.filters.view === 'past' ? past : recentCompleted).map((d) => (
                  <CompactCard key={d.sprint.id} row={d} onSelect={onSelectSprint} />
                ))}
              </div>
            </>
          )}

          {filtered.length === 0 && (
            <div className="content-empty">
              <div className="content-empty-eyebrow">Sprints</div>
              <div className="content-empty-title">
                Nothing <em>{f.filters.view === 'all' ? 'planned' : VIEW_LABELS[f.filters.view].toLowerCase()}</em>.
              </div>
              <div className="content-empty-desc">
                Start a sprint from a template in the library, or use "New sprint" to plan one.
              </div>
            </div>
          )}

          <div style={{ height: 80 }} />
        </div>
      </main>

      <SprintDetailPanel
        decorated={detailSprint}
        library={library}
        open={detailSprintId !== null}
        onOpenChange={(o) => { if (!o) setDetailSprintId(null); }}
      />

      <SprintCreateDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) setTemplateDays(null); }}
        library={library}
        templateDays={templateDays}
      />
    </>
  );
}

// Touch unused-symbol guard so type-import for Sprint above isn't dropped.
export type _SprintsViewExport = Sprint;
