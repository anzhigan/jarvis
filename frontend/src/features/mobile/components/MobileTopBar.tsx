import { useAuthStore } from '../../../store/auth';

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

/**
 * iOS-style mobile top bar. The `large` mode mirrors UIKit's
 * `prefersLargeTitles` collapsed-at-rest variant: a 52pt compact bar with
 * back/avatar slots, followed by a 32px Fraunces title and an 11px mono
 * sub-line. Sectional screens (Notes/Routines/Goals/Sprints/Analysis) use
 * this. Detail screens drop to `compact` so the bar takes 52pt instead of
 * ~108pt.
 */
export function MobileTopBar({
  title, subtitle, leftSlot, rightSlot, onAvatarClick, mode = 'large',
}: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = (user?.username?.[0] ?? user?.email?.[0] ?? 'A').toUpperCase();

  const right = rightSlot ?? (
    <button
      type="button"
      className="tb-avatar"
      onClick={onAvatarClick}
      aria-label="Open profile"
    >{initial}</button>
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
    return (
      <header className="top-bar">
        <div className="top-bar__compact">
          <div className="tb-side">{leftSlot ?? <div className="tb-spacer" />}</div>
          <div className="tb-center">
            <div className="tb-title">{title}</div>
            {subtitle && <div className="tb-sub">{subtitle}</div>}
          </div>
          <div className="tb-side tb-side-right">{right}</div>
        </div>
      </header>
    );
  }

  // large mode — empty compact row + large title block below
  return (
    <header className="top-bar">
      <div className="top-bar__compact">
        <div className="tb-side">{leftSlot ?? <div className="tb-spacer" />}</div>
        <div className="tb-center"></div>
        <div className="tb-side tb-side-right">{right}</div>
      </div>
      <div className="top-bar__large">
        <div className="top-bar__large-title">{title}</div>
        {subtitle && <div className="top-bar__large-sub">{subtitle}</div>}
      </div>
    </header>
  );
}
