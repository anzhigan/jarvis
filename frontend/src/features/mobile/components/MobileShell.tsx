import type { Tab } from '../../../app/tabs';
import { MobileTabBar } from './MobileTabBar';
import '../../../styles/mobile.css';

interface Props {
  /** Top-bar element. Each screen owns its own (so titles & sub-titles update). */
  topBar: React.ReactNode;
  /** Optional FAB — rendered above the tab bar at fixed position. */
  fab?: React.ReactNode;
  /** Active bottom tab. */
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  children: React.ReactNode;
}

/**
 * Shared layout for the mobile redesign: topbar / scrollable content / FAB
 * (optional) / bottom tab bar. The actual screens are rendered as children.
 *
 * Mirrors the structure inside .iphone-screen from jarvnote-mobile.html.
 */
export function MobileShell({ topBar, fab, tab, onTabChange, children }: Props) {
  return (
    <div className="m-shell">
      {topBar}
      <main className="screen-content">{children}</main>
      {fab}
      <MobileTabBar active={tab} onChange={onTabChange} />
    </div>
  );
}
