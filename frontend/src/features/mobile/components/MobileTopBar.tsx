import { Plus } from 'lucide-react';
import { useAuthStore } from '../../../store/auth';

interface Props {
  title: string;
  subtitle?: string;
  /** Optional left slot (back button, drawer, etc.). When omitted a 36px spacer is rendered. */
  leftSlot?: React.ReactNode;
  /** Optional right slot — overrides the default `[+ add] [avatar]` group. */
  rightSlot?: React.ReactNode;
  /** Avatar click handler — defaults to navigating to the profile screen. */
  onAvatarClick?: () => void;
  /** Add-button label (e.g. "New goal", "+ Step"). When set, an indigo pill is
   *  rendered in the right slot before the avatar. Use the same `new-btn` style
   *  as the desktop content-bar. */
  addLabel?: string;
  /** Add-button click handler. Required when addLabel is set. */
  onAdd?: () => void;
}

/**
 * Mobile top bar. Mirrors the design from frontend/jarvnote-mobile.html:
 * left slot, centered title + subtitle, right slot with an optional
 * "+ Label" indigo pill (matches desktop new-btn) and the user's avatar
 * which opens the profile screen.
 */
export function MobileTopBar({
  title, subtitle, leftSlot, rightSlot, onAvatarClick, addLabel, onAdd,
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
      <div className="tb-side tb-side-right" style={{ gap: 8 }}>
        {rightSlot ?? (
          <>
            {addLabel && onAdd && (
              <button
                type="button"
                className="new-btn"
                onClick={onAdd}
                aria-label={addLabel}
              >
                <Plus /> {addLabel}
              </button>
            )}
            <button
              type="button"
              className="tb-avatar"
              onClick={onAvatarClick}
              aria-label="Open profile"
            >{initial}</button>
          </>
        )}
      </div>
    </header>
  );
}
