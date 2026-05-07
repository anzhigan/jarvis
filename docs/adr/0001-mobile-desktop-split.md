# ADR-0001: Separate Mobile and Desktop component trees

**Date:** 2026-05-07
**Status:** Accepted

## Context

The original app rendered the same components on mobile and desktop with media-query CSS. As features grew, this collapsed: drawer animations on mobile clashed with sidebar collapse on desktop, swipe gestures broke on hover, kanban only made sense at ≥1280px. `Notes.tsx` reached 1399 lines holding both UX modes; `Metrics.tsx` was 1586.

## Decision

Split the App at the entry point by viewport:

- `App.tsx` calls `useIsMobile()`, renders either `<MobileApp>` or `<DesktopApp>`.
- Each app has its own component tree under `components/` (mobile) and `features/` (desktop).
- They share **only** the data layer: `api/`, `store/`, `lib/`, and feature-domain hooks (`features/<domain>/hooks/`).

Specifically: the desktop got a brand-new `Rail + Pane + Content` shell (Notion/Linear-style); mobile keeps its tab-bar + drawer + swipe gestures.

## Consequences

**Positive:**
- Each platform can iterate without UX regressions on the other.
- New desktop layouts (Goals kanban with drag-and-drop, year heatmap, timeline view for sprints) are not constrained by what works on touch.
- Code is easier to read — each file does one thing for one viewport.

**Negative:**
- Doubled UI surface for the same domain. We mitigate this by extracting business logic into `features/<domain>/hooks/` (pure, no UI), so the same `useNotesLibrary` powers both `components/Notes.tsx` (mobile) and `features/notes/components/NotesView.tsx` (desktop).
- Risk: domain logic drift between platforms when only one side migrates to the shared hook. Mitigation: when touching a domain on either platform, also wire the shared hook.

## Alternatives considered

- **Single adaptive tree with media queries:** rejected — the divergence between kanban / drawer-stack / table-row / timeline is too wide to express in CSS branches.
- **Container/Presenter with one component, two presenters:** equivalent to the chosen split, just at a finer grain. Net effect identical; current split is simpler to discover.
