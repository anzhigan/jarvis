# ADR-0005: Knowledge base hierarchy — Way → Topic → Note

**Date:** 2026-05-07
**Status:** Accepted

## Context

Notes-app design space ranges from "flat list with tags" (Apple Notes) to "infinite tree" (Notion). Each tradeoff has consequences for navigation UI, mobile gestures, and user mental model.

## Decision

**Three hard levels:**

1. **Way** — top-level area of focus ("Research", "Personal", "Reading"). User has a small number of these (≤10 typical). Wide intent.
2. **Topic** — a project or theme inside a Way ("Number theory", "Distributed systems"). Optional — a Way can contain notes directly.
3. **Note** — actual content (Tiptap doc with images, tags, pin). Lives under a Topic *or* directly under a Way.

The schema enforces this: `Note.way_id` and `Note.topic_id` are mutually exclusive (one is set, the other is null). Mixing-up of levels is a 400.

## Consequences

**Positive:**
- Mobile navigation is a stack of three depths max: root → way → topic → note. Easy back-button, easy breadcrumb, no infinite-scroll-tree pathology.
- Desktop tree (`tree-row[data-depth=0|1|2]`) maps directly to the schema — no recursion.
- Cognitive load is bounded. The user can actually *find* a note three taps in.
- Hierarchical drag-drop (move note between topics) is a small enumeration of cases, not a generic graph operation.

**Negative:**
- Doesn't model "this note belongs to two topics" — solved by tags (`Note.tags` M2M). Tags are flat, hierarchy is positional.
- Power users who want sub-topics will hit the wall. Accepted: the project's value prop is "small focused KB", not "personal Wikipedia".
- Renaming a Topic is cheap; restructuring a Way (mass-moving notes) is a UI gap — bulk-move will need explicit drag-drop or a keyboard shortcut.

## Alternatives considered

- **Single level with tags only:** rejected — destroys spatial intuition. The brain wants "where is the thing".
- **Notion-style infinite tree:** rejected — explosion of UI complexity (drag-drop reordering, breadcrumbs of length N, tree shortcuts). Out of scope.
- **Folders + notes (two levels):** considered. Lost — three turned out to be the natural shape: user's mental model is "domain → project → note".
