import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'filled' | 'tinted' | 'plain' | 'destructive' | 'destructive-tinted';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style:
   *    - filled (default): solid indigo · the screen's primary action.
   *      Only one filled button should be visible at a time.
   *    - tinted: indigo on light indigo-soft · secondary action.
   *    - plain: transparent with indigo text · inline / dismissal.
   *    - destructive: solid rust · used only after a confirm sheet, never
   *      as a screen-level primary.
   *    - destructive-tinted: rust on rust-soft · less-aggressive destructive
   *      (e.g. "Clear entries" — recoverable). */
  variant?: Variant;
  /** Stretch to fill the parent's width — canonical for sheets and screen
   *  CTAs. */
  block?: boolean;
  /** 36pt height + tighter padding · used inside dense rows or popovers. */
  compact?: boolean;
  /** Optional leading icon — `<Icon size={16} />`. */
  icon?: ReactNode;
}

/**
 * Canonical mobile button — implements the Indigo Editorial mobile design
 * system's Filled / Tinted / Plain / Destructive variants in one place.
 *
 * Replaces ad-hoc `.m-add-btn`, inline `style={{ background, color }}`
 * buttons, and DIY confirm-buttons across MobileGoalsScreen,
 * MobileRoutinesScreen, etc.
 */
export const MobileButton = forwardRef<HTMLButtonElement, Props>(
  function MobileButton({
    variant = 'filled', block, compact, icon, className, children, type, ...rest
  }, ref) {
    const cls = [
      'm-btn',
      `m-btn--${variant}`,
      block ? 'm-btn--block' : '',
      compact ? 'm-btn--compact' : '',
      className ?? '',
    ].filter(Boolean).join(' ');
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cls}
        {...rest}
      >
        {icon}
        {children}
      </button>
    );
  },
);
