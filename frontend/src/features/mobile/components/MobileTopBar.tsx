import { Bell } from 'lucide-react';
import { useAuthStore } from '../../../store/auth';

/** A contextual AI generation trigger that screens can plant in the
 *  top-bar (e.g. "Plan day" on Goals, "AI sprint" on Sprints, "Coach" on
 *  Analysis). Renders as a tinted pill to the LEFT of the bell. */
export interface AIActionProp {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  busy?: boolean;
}

interface Props {
  title: string;
  subtitle?: string;
  /** Optional left slot (back button, drawer, etc.). When omitted a 36px
   *  spacer is rendered so the title stays centred (compact) or the grid
   *  alignment stays consistent (large). */
  leftSlot?: React.ReactNode;
  /** Optional right slot — overrides the default avatar. */
  rightSlot?: React.ReactNode;
  /** Avatar click handler — defaults to navigating to the profile screen. */
  onAvatarClick?: () => void;
  /** Show the AI/notifications bell next to the avatar (opens the AI jobs
   *  bottom-sheet). Default true; pass false on screens that take over
   *  the right slot entirely (e.g. a note editor with action buttons). */
  aiButton?: boolean;
  /** Contextual AI generation action (Plan day / AI sprint / Coach …)
   *  shown to the left of the bell. */
  aiAction?: AIActionProp;
  /** Display mode:
   *    - `large` (default): iOS large-title pattern — compact bar at the
   *      top with empty centre, large display-font title + sub-line below.
   *      Used for sectional home screens.
   *    - `compact`: classic single-row bar with centred title — used for
   *      detail screens (Settings, Note editor) where vertical space is
   *      precious.
   *    - `legacy`: pre-design-system layout (single row, centred title +
   *      subtitle stacked). Retained so screens that haven't migrated still
   *      render correctly during the rollout. */
  mode?: 'large' | 'compact' | 'legacy';
}

/** Event name that triggers the mobile AI jobs bottom-sheet to open.
 *  Dispatched by the header AI button; listened to by MobileAIToastStack. */
export const OPEN_AI_PANEL_EVENT = 'jarvnote:openAIPanel';

/**
 * iOS-style mobile top bar. The `large` mode mirrors UIKit's
 * `prefersLargeTitles` collapsed-at-rest variant: a 52pt compact bar with
 * back/avatar slots, followed by a 32px Fraunces title and an 11px mono
 * sub-line. Sectional screens (Notes/Routines/Goals/Sprints/Analysis) use
 * this. Detail screens drop to `compact` so the bar takes 52pt instead of
 * ~108pt.
 */
export function MobileTopBar({
  title, subtitle, leftSlot, rightSlot, onAvatarClick, aiButton = true,
  aiAction, mode = 'large',
}: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = (user?.username?.[0] ?? user?.email?.[0] ?? 'A').toUpperCase();

  const aiActionBtn = aiAction ? (
    <button
      type="button"
      className="tb-ai-action"
      onClick={aiAction.onClick}
      disabled={aiAction.busy}
      aria-label={aiAction.label}
    >
      {aiAction.icon}
      <span>{aiAction.busy ? '…' : aiAction.label}</span>
    </button>
  ) : null;

  const aiBtn = aiButton ? (
    <button
      type="button"
      className="tb-ai"
      aria-label="AI notifications"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_AI_PANEL_EVENT))}
    >
      <Bell size={16} />
    </button>
  ) : null;

  const right = rightSlot ?? (
    <>
      {aiActionBtn}
      {aiBtn}
      <button
        type="button"
        className="tb-avatar"
        onClick={onAvatarClick}
        aria-label="Open profile"
      >{initial}</button>
    </>
  );

  if (mode === 'legacy') {
    return (
      <header className="top-bar" data-legacy>
        <div className="tb-side">{leftSlot ?? <div className="tb-spacer" />}</div>
        <div className="tb-center">
          <div className="tb-title">{title}</div>
          {subtitle && <div className="tb-sub">{subtitle}</div>}
        </div>
        <div className="tb-side tb-side-right">{right}</div>
      </header>
    );
  }

  if (mode === 'compact') {
    // Compact = same layout as large, but with smaller title font
    // (matches detail screens where the title is contextual rather than
    // a section header — e.g. Profile, nested Notes).
    return (
      <header className="top-bar">
        <div className="top-bar__compact">
          {leftSlot && <div className="tb-side">{leftSlot}</div>}
          <div className="top-bar__heading">
            <div className="top-bar__title" style={{ fontSize: 16 }}>{title}</div>
            {subtitle && <div className="top-bar__sub">{subtitle}</div>}
          </div>
          <div className="tb-side tb-side-right">{right}</div>
        </div>
      </header>
    );
  }

  // large mode — single row, title LEFT, avatar RIGHT.
  // No left slot is rendered when `leftSlot` is unspecified — that way
  // the title sits flush against the bar's 14px padding (matching the
  // 14px right-edge gap to the avatar). When a back button IS passed,
  // it consumes the left slot and the title shifts right naturally.
  return (
    <header className="top-bar">
      <div className="top-bar__compact">
        {leftSlot && <div className="tb-side">{leftSlot}</div>}
        <div className="top-bar__heading">
          <div className="top-bar__title">{title}</div>
          {subtitle && <div className="top-bar__sub">{subtitle}</div>}
        </div>
        <div className="tb-side tb-side-right">{right}</div>
      </div>
    </header>
  );
}
