import type { Tab } from '../../../app/tabs';
import { MobileTabBar } from './MobileTabBar';
import '../../../styles/mobile.css';

interface Props {
  /** Top-bar element. Each screen owns its own (so titles & sub-titles update). */
  topBar: React.ReactNode;
  /** Active bottom tab. */
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  children: React.ReactNode;
}

/**
 * Shared layout for the mobile redesign: topbar / scrollable content /
 * bottom tab bar. The actual screens are rendered as children. Add buttons
 * (formerly a floating "+") now live in the top bar via MobileTopBar's
 * addLabel/onAdd props.
 */
export function MobileShell({ topBar, tab, onTabChange, children }: Props) {
  return (
    <div className="m-shell">
      {topBar}
      <main className="screen-content">{children}</main>
      <MobileTabBar active={tab} onChange={onTabChange} />
    </div>
  );
}
