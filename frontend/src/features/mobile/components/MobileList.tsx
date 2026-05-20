import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/** Inset-grouped list group — iOS Settings-style. Wraps a stack of
 *  `<MobileListCell>` rows with optional uppercase label above. Groups have
 *  no visible separator from the page background; the body has rounded
 *  corners only on the first/last row. */
export function MobileListGroup({
  label, children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <section className="m-list-group">
      {label && <div className="m-list-group__label">{label}</div>}
      <div className="m-list-group__body">{children}</div>
    </section>
  );
}

type IconColor = 'indigo' | 'moss' | 'ochre' | 'rust' | 'slate';

interface CellProps {
  /** Lucide-style icon node — `<Calendar size={15} />`. Optional. */
  icon?: ReactNode;
  /** Background tone for the icon slot. Defaults to indigo. */
  iconColor?: IconColor;
  title: string;
  /** Sub-line under the title (smaller, ink-4). */
  subtitle?: string;
  /** Trailing slot — usually a value, badge, switch, or chevron. */
  trailing?: ReactNode;
  /** Render a chevron at the very right (after `trailing`) — implies
   *  navigation. */
  chevron?: boolean;
  /** Whole-row tap handler. Renders as `<button>` when provided. */
  onClick?: () => void;
  /** Title turns rust — for "Sign out", "Delete account" rows. */
  destructive?: boolean;
}

/** Single cell inside a MobileListGroup. Renders as `<button>` when
 *  `onClick` is set, otherwise `<div>` so the row stays inert (e.g. when
 *  the trailing slot is a switch and the rest of the row isn't tappable). */
export function MobileListCell({
  icon, iconColor = 'indigo', title, subtitle, trailing,
  chevron, onClick, destructive,
}: CellProps) {
  const cls = `m-list-cell${destructive ? ' m-list-cell--destructive' : ''}`;
  const body = (
    <>
      {icon && (
        <span className="m-list-cell__ico" data-color={iconColor}>
          {icon}
        </span>
      )}
      <div className="m-list-cell__main">
        <span className="m-list-cell__title">{title}</span>
        {subtitle && <span className="m-list-cell__sub">{subtitle}</span>}
      </div>
      {(trailing || chevron) && (
        <span className="m-list-cell__trail">
          {trailing}
          {chevron && (
            <span className="m-list-cell__chev">
              <ChevronRight size={14} />
            </span>
          )}
        </span>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>{body}</button>
    );
  }
  return <div className={cls}>{body}</div>;
}
