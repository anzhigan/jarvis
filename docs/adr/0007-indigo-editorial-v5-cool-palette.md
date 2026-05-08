# ADR-0007: Indigo Editorial v5 — cool palette + section reworks

**Date:** 2026-05-08
**Status:** Accepted

## Context

After ADR-0006 introduced the Indigo Editorial v4 design system, four sections
proved hard to use as the data model expanded:

- **Goals · Go** (single hero list of every Go for today): when the user has
  multiple active goals each with a few daily targets, the flat list became
  noisy. Selecting a goal to focus on required scrolling and re-reading.
- **Goals · Step** (vertical milestone list with progress bars): showed each
  step as a row, but lost the time dimension — a quick scan no longer told the
  user which steps overlap or which weeks are over-committed.
- **Routines** (Today list with hero + skipped buttons): worked for the
  current day but offered no glance-able view of the past two weeks across all
  practices, which is the primary question users opened the section to answer.
- **Analytics** (hero + insights cards + heatmap): the editorial-essay shape
  was beautiful but read more like a magazine spread than a dashboard. Power
  users wanted a denser surface — multiple charts visible at once.

A canonical visual document (`jarvnote-indigo.html`) was produced that
formalises a cooler palette (the v4 warm cream/rail-bg surfaces softened the
sense of focus on long sessions) and rebuilds those four sections around
their canonical questions.

## Decision

Adopt **Indigo Editorial v5** as the canonical desktop presentation, replacing
v4 wholesale on the desktop tree. Mobile remains untouched. Old v4 components
are removed (no feature flags, no parallel paths).

Concrete commitments:

### Cool palette (token swap)

- **Surfaces** shifted from warm cream to cool slate:
  `--cream` `#E6E2D6` → `#E1E4E5`, `--rail-bg` `#D6D2C8` → `#C9CDCE`,
  `--soft` `#DAD3C0` → `#CFD3D5`.
- **Ink ramp** rewritten from warm browns to cool slate:
  `--ink` `#1A1F22` → `#15202A`, descending through `#2C353D / #455058 /
  #6E7780 / #9EA5AB`.
- **Brand indigo** deepened: `#3A5364` → `#2C4A60`, `--indigo-2` `#2A3D4B` →
  `#1B3447`.
- **Editorial accents** (moss, ochre, rust) **kept** at the same hex values —
  they are intentional warm pops against cool surfaces, used for italic em
  emphasis and status colours (moss = on-track / done, ochre = mid /
  pending, rust = at-risk / slipping).
- **Italic em convention:** the section-hero italic em is now uniformly
  `var(--indigo)` (it was rust in v4 — rust now reserved for warning states
  and the profile identity strip's name accent).
- **Layout variables renamed** with backward-compat aliases:
  `--indigo-rail-w` → `--rail-w`, `--indigo-pane-w` → `--library-w`,
  `--indigo-topbar-h` → `--topbar-h`. The old names alias to the new ones so
  desktop.css consumers continued to work during the migration.

### Goals · Go v6 — split shell

Replace the single-canvas Today list with `.go-shell` grid `380px 1fr`:

- **Left pane** (`.go-leftpane`) — hero + 3-cell stat strip (Done · Pending ·
  Goals advancing) + active-goals card list (`.gl-card`) with deterministic
  per-goal accent (`--gc`), 4 px progress bar on the left of each card,
  today-progress meta line colour-coded (`gl-card-today-{none|pending|mid|done}`),
  due/streak meta in JetBrains Mono.
- **Right pane** (`.go-rightpane`) — focused goal canvas with editorial
  context block (`.goal-ctx`), 4-cell ledger (today's targets · streak ·
  days to deadline · due date), then a 2-column `.tg-cards` grid.
- **Inline value capture** for numeric targets: `.tg-card[data-kind=numeric]`
  shows a 40 px display "logged / target unit" plus a `−/+` stepper that
  calls `gos.logToday(go.id, value)` directly. data-done (moss) when target
  hit; data-partial (ochre) for in-progress. Boolean targets get a full-width
  toggle plus a 52 px skip square.

### Goals · Step v2 — Gantt timeline

Replace the milestone list with a true Gantt:

- **Left** (`.step-main`) — `.step-head` (period kicker + title + 4-cell
  Done/Active/At risk/Upcoming summary) + `.gantt`:
  - `.gantt-header` with `.gt-axis` (months positioned absolutely by
    `(monthStart - windowStart) / windowDuration`).
  - `.gantt-body` with `.gt-grid` (vertical month boundaries + `.gt-today-line`
    + `.gt-today-flag` triangle).
  - `.gt-lanes` — one `.gt-lane` per goal, grid `220px 1fr`, with
    `.gt-bar[data-status]` positioned by step dates. Bars carry `--gc`
    (goal accent) on the left stripe; status colours: done = moss-soft + 0.65
    opacity, on-track = paper + accent, at-risk = rust 1.5 px border,
    upcoming = dashed border.
  - `.step-legend` at the bottom.
- **Right** (`.step-detail`, 380 px) — goal-coloured tag pill + status pill +
  step title + period strip (Started → Ends) + `.dp-prog-card` with an
  `.dp-prog-expected` dashed line at `(elapsed / total)`% showing where
  today should be + ahead/behind delta in moss/rust + 3-cell Elapsed/
  Remaining/Total + Gos-in-step list + Mark done / View goal actions.

### Routines v3 — table grid

Replace the Today list with a 5-column table:

- **`.rt-header`** with hero (40 px Fraunces title + italic indigo em) +
  4-cell `.rh-cell` strip (Done today X/Y · Pending · Longest streak Xd
  with routine name in `.rh-meta` italic · 30-day overall %).
- **`.rt-table`** with columns:
  1. Routine name (Fraunces title + meta — schedule + linked-goal pill with
     dot or "standalone" italic).
  2. Last 14 days (`grid-template-columns: repeat(14, 1fr)`, `.hg-cell` per
     day with state classes `done` / `partial` / `skipped` / `empty`; today
     gets `box-shadow: 0 0 0 2px var(--indigo)`).
  3. Streak (Fraunces 20 px, moss when ≥7 d, ink-5 when 0 d) + best d below.
  4. Completion 30 d (moss ≥80%, rust <50%).
  5. Today actions (pair of round 30 px ✓/✗ buttons; not scheduled today
     shows `—`).
- **`.rt-summary`** 3-card row: distribution by schedule (bar chart),
  top streaks (top 4), needs attention (rate < 60% with rust `!` rank).

### Analysis v3 — dashboard

Replace the editorial single-column with a true dashboard:

- **Row 1 (`.ana-row-hero`)** — Hero (kicker + 44 px Fraunces title with
  italic indigo em + lede) | KPI 2×2 grid of `.kpi-tile` with trend line.
- **Row 2 (`.ana-row-charts-1`)** — Routine completion line+area chart
  (900×240, 30 days, % completed per day with hover dot on the last point) |
  Goals progress vs plan (horizontal bars on cream track with dashed
  expected line at `(elapsed / total)`% per goal).
- **Row 3 (`.ana-row-charts-2` 380px+1fr+1fr)** — Routines-by-status donut
  (Strong streak / Active / Slipping / On hold) | Top streaks · trending list
  with cumulative-streak sparklines (80×22 polyline) | Practice activity
  area chart with 3 top tags mini-list under it.
- **Row 4** — Year heatmap card (53×7) with month axis above and "% days
  with at least 1 entry" stat in the header.

### Hooks discipline

The four feature hooks `useGoals`, `useGos`, `useSteps`, `useRoutines` were
**not modified** in v5. Two hooks needed minor extensions:

- `useAnalytics` — added raw `tasks` and `routines` arrays to the return so
  v3 dashboard charts can derive the donut categorisation, sparkline data,
  and goals-progress bars without a second fetch.
- `useProfile` — switched `stats` from "active counts" to "lifetime totals"
  (`goals` / `routines` / `topStreak` / `entriesLogged`) to match the v5
  identity-strip pattern. `streaksCount` retained for the rail/route badge.

### Section structure consequence

Goals · Go and Goals · Step v6/v2 both own the entire content area below
the bar — their internal panes scroll independently, so `GoalsView` skips
the outer `.content-scroll` wrapper for those two modes. Kanban still uses
the wrapper.

## Consequences

**Positive:**
- Cooler surfaces wear better on long sessions. Editorial accents (moss /
  ochre / rust) pop *more* against cool slate, so the visual hierarchy is
  actually stronger than v4.
- Each redesigned section answers its primary question at a glance: Go
  shows multiple goals side by side; Step shows the time dimension; Routines
  shows two-week behavior across all practices; Analytics shows multiple
  charts simultaneously.
- Inline value capture (Go v6 numeric stepper) removes a click for the most
  common interaction — bumping a numeric goal up by one.
- The Gantt timeline (Step v2) makes over-commitment visible: when two lanes
  have overlapping bars, the user sees the conflict directly.

**Negative:**
- More CSS surface area. Goals CSS grew from ~620 → ~1900 lines (kanban + v6
  Go + v2 Step + the legacy `.go-hero/.go-row` shared utilities still used by
  Sprints view). Routines CSS replaced its 30-line Today helpers with ~370
  lines of grid CSS. Analytics CSS replaced its v4 single-column with ~290
  lines of dashboard layout.
- Two hooks gained minor return-shape changes. Mitigation: documented in
  this ADR, easy rollback if needed (revert the two diffs).
- Step Gantt assumes the user has steps with start_date and end_date; goals
  with no steps render an empty state. This is correct (steps are how the
  user models time) but may surprise users who never created a step.
- The Profile identity-strip avatar deliberately stays warm (rust → ochre
  gradient) while everything else cools. This is intentional editorial pop
  but a reader scanning tokens.css might wonder why the avatar bucks the
  pattern. Documented inline in profile.css and here.

## Phase plan (executed)

- **V5-0**: tokens swap (warm → cool, layout vars renamed with aliases).
- **V5-1**: Notes — confirmed gallery is structurally identical to v4; no
  code changes needed (token swap suffices).
- **V5-2**: Goals · Kanban — same conclusion; structural parity with v4.
- **V5-3**: Goals · Go v6 — full rewrite to split shell + inline value
  capture.
- **V5-4**: Goals · Step v2 — full rewrite to Gantt timeline + detail pane.
- **V5-5**: Routines v3 — full rewrite to table grid + summary cards.
- **V5-6**: Sprints — same as Notes/Kanban; no changes needed.
- **V5-7**: Analytics v3 — full rewrite to dashboard layout (4 rows of
  varied widths). Five v4 components deleted, six new chart components
  added.
- **V5-8**: Profile — rail-avatar gradient indigo/walnut → indigo/indigo-2;
  identity strip stats relabelled to lifetime totals.
- **V5-9**: cleanup — `.go-hero-title em` recoloured rust → indigo to align
  with v5 hero convention; final lint, tsc, build, backend tests pass.

## References

- Source: `frontend/jarvnote-indigo.html` (canonical v5 design document).
- Implementation: `frontend/src/styles/tokens.css`,
  `frontend/src/features/<domain>/components/`.
- Predecessor: ADR-0006 (Indigo Editorial v4) — same layout philosophy,
  warmer palette, simpler section views.
