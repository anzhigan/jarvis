import { useAuthStore } from '../../../store/auth';

interface Props {
  title: string;
  subtitle?: string;
  /** Optional left slot (back button, drawer, etc.). When omitted a 36px spacer is rendered. */
  leftSlot?: React.ReactNode;
  /** Optional right slot — overrides the default avatar. */
  rightSlot?: React.ReactNode;
  /** Avatar click handler — defaults to navigating to the profile screen. */
  onAvatarClick?: () => void;
}

/**
 * Mobile top bar. Mirrors the design from frontend/jarvnote-mobile.html:
 * left slot (36px), centered title + subtitle, right slot defaulting to the
 * user's avatar pill that opens the profile screen.
 */
export function MobileTopBar({
  title, subtitle, leftSlot, rightSlot, onAvatarClick,
}: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = (user?.username?.[0] ?? user?.email?.[0] ?? 'A').toUpperCase();

  return (
    <header className="top-bar">
      <div className="tb-side">{leftSlot ?? <div className="tb-spacer" />}</div>
      <div className="tb-center">
        <div className="tb-title">{title}</div>
        {subtitle && <div className="tb-sub">{subtitle}</div>}
      </div>
      <div className="tb-side tb-side-right">
        {rightSlot ?? (
          <button
            type="button"
            className="tb-avatar"
            onClick={onAvatarClick}
            aria-label="Open profile"
          >{initial}</button>
        )}
      </div>
    </header>
  );
}
