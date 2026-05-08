# ADR-0006: Indigo Editorial v4 — desktop redesign

**Date:** 2026-05-08
**Status:** Accepted

## Context

The desktop UI had been through two earlier iterations:

1. The original tab+sidebar layout (mobile-first CSS dragged onto a wide screen).
2. A Rail+Pane+Content shell themed with cool zinc surfaces and an indigo brand
   accent — solid foundation, but with a generic "SaaS dashboard" feel: every
   surface was the same paper, headings were Inter at the same weight, and
   content density made long sessions feel transactional rather than
   contemplative. The Sprints area in particular had three competing presentations
   (Timeline / Cards / Table) and no clear canonical view.

We wanted Jarvnote to feel less like a productivity dashboard and more like a
working notebook — closer in spirit to a small-press editorial site than to
Linear or Asana — without sacrificing the data density power users need.

A reference document (`jarvnote-indigo-3.html`) was produced to canonise the
new visual language. It defines an "Indigo Editorial v4" system: warm paper
surfaces, a cream secondary surface, a single brand indigo, four supporting
accents (slate, moss, ochre, rust), italic display em-accents on hero titles,
and serif body type.

## Decision

Adopt the Indigo Editorial v4 design system as the canonical desktop
presentation, replacing the cool-zinc theme everywhere on the desktop tree.
Mobile is untouched.

Concrete commitments:

- **Type system.** Fraunces (display, with italic em-accents on hero titles),
  Source Serif 4 (body), Inter (UI labels and chrome), JetBrains Mono
  (numerics, codes, periods). Loaded from Google Fonts CDN at the document
  level — one network round-trip on app load, then cached.
- **Colour system.** `--paper` `#EFF1F0`, `--cream` `#E6E2D6`, `--rail-bg`
  `#D6D2C8`. Ink ramp `--ink` → `--ink-5` (5 steps). Brand `--indigo`
  `#3A5364`. Accents `--moss`, `--ochre`, `--rust`, `--slate`, `--walnut`. No
  pure black, no pure white, no saturated primaries on default surfaces.
- **Geometry.** Sharp radii (`--r-sharp` 2 px, `--r-control` 5 px, `--r-card`
  6 px). Hairlines via `box-shadow: 0 0 0 1px var(--hairline)` rather than
  drop shadows — the only place a real shadow lives is in popovers and modals.
- **Layout.** Three-zone shell — 56 px Rail (icon nav), 280 px Pane (library),
  fluid Content. Each section gets a distinct pane with eyebrow + display
  title + sub, plus its own canvas (max-width 760–1180 px depending on
  density).
- **Per-section canvas pattern.** Hero (kicker + display title + lede) → a
  4-cell stat strip (italic unit accents) → an `insights-grid` of cards with
  coloured top-stripes → editorial section heads with section-rule and
  section-meta → list/board/heatmap content.
- **UI-kit reuse.** All Indigo work goes through shared primitives:
  `.pill-seg` (segmented control), `.ui-chip` (filter / tag), `.ui-input`,
  `.ui-form / .ui-form-row`, `.ui-color-grid / .ui-color-swatch`. Detail
  panels still use the Drawer primitive; create flows still use the Dialog
  primitive — both are themed via tokens, not new components.
- **Hooks discipline.** Every feature hook (`useNotesLibrary`, `useGoals`,
  `useGos`, `useSteps`, `useRoutines`, `useSprints`, `useAnalytics`) is
  preserved verbatim. Only view components and CSS get rewritten. `useProfile`
  was minimally extended (added `streaksCount` to stats and an
  `updateProfile` method) but its contract did not break.
- **Sprints canonical view.** Single canvas of "Featured + grids" replaces
  the old Timeline / Cards / Table trio. Templates pane row triggers a
  pre-filled length in the create dialog via `templateDays` prop.

## Consequences

**Positive:**
- Stronger sense of place. The hero kicker + italic em-accent on the title
  make every section feel deliberate; the user's eye knows where to land.
- Single source of truth for visual language. No more "is this the goals
  colour or the routines colour?" — every accent maps to an Indigo token.
- Cleaner foundation for future work. New sections plug into the same
  hero / stat-strip / section-head / list/card pattern; detail panels and
  create dialogs share `.pill-seg / .ui-chip / .ui-form` rather than
  reinventing each time.
- Smaller surface. Cleanup phase deleted six orphan files
  (TimelineView/CardsView/TableView, useSprintsView, TodayBand,
  RoutinesTable) that had outlived their canonical replacement.

**Negative:**
- Two parallel design systems exist in `tokens.css`: the legacy
  `--bg-app / --accent-notes / --fg-primary` scale (mobile, untouched) and
  the new Indigo `--paper / --indigo / --ink` scale (desktop). They share
  the same file. A reader has to know which scope they're in. We mitigate
  this with comment banners in `tokens.css` and by enforcing through code
  review that desktop CSS reaches only for Indigo tokens.
- Google Fonts CDN dependency at app load. Acceptable for a logged-in
  productivity app; the font swap is unobtrusive (Fraunces and Source Serif 4
  are similar enough to local serif fallbacks). If we ever need to remove
  the CDN, fonts can be self-hosted in `public/fonts/`.
- `.kpi-card`, `.goal-row`, `.year-heatmap`, etc. mobile-era class names
  still live in `styles/index.css`. They are not used by the desktop tree
  but they show up in lint searches and can confuse new contributors. Future
  cleanup item: namespace mobile-only classes under a `.m-` prefix.

## Phase plan (executed)

The redesign was rolled out in eleven phases — each verified with `tsc`,
`vite build`, and the backend test suite — to keep `main` shippable
throughout:

- **IND-0**: tokens + shell + UI-kit + foundation CSS.
- **IND-1**: Notes (3-pane editorial; doc title 64 px, Source Serif 4 body).
- **IND-2 / 3 / 4**: Goals — Kanban, Today (Go), Step (Sprint).
- **IND-5**: Sprints — featured card + grids (replaces Timeline/Cards/Table).
- **IND-6**: Routines — Today list with hero, schedule labels, skipped state.
- **IND-7**: Analytics — hero, KPI strip, insights grid, year heatmap, streak
  ranking, goal-progress board.
- **IND-8**: Profile — identity strip, 4-cell ledger, Account / Appearance /
  Sign-out / Danger sections, four edit dialogs.
- **IND-9**: Detail panels and create dialogs adapted to Indigo (`.pill-seg`,
  `.ui-chip`, `.ui-form`, Indigo accent palette throughout). `templateDays`
  wired end-to-end.
- **IND-10**: Cleanup — delete orphan files, fix lint, write this ADR.

## References

- Source: `frontend/jarvnote-indigo-3.html` (canonical design document).
- Implementation: `frontend/src/styles/tokens.css`, `frontend/src/styles/desktop.css`, `frontend/src/features/<domain>/components/`.
