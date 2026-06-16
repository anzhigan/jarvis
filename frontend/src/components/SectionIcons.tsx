import type { SVGProps } from 'react';

/**
 * Hand-drawn "still-life" illustrations for the left rail (desktop) and
 * bottom tab bar (mobile). Each icon is a small two/three-colour SVG that
 * uses design-system tokens (var(--indigo), var(--moss), …) so colours
 * follow theme changes automatically. Sized via the `illu-icon` class on
 * the consumer side (see desktop.css / mobile.css overrides).
 *
 * The Pomodoro tomato in PomodoroPanel.tsx remains the reference for this
 * visual language — these icons are deliberately a touch smaller and a
 * touch less ornate so the tomato stays the rail's distinct accent when
 * the timer is running.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children'>;

function withClass(extra: string | undefined): string {
  return extra ? `illu-icon ${extra}` : 'illu-icon';
}

export function NotesIcon({ className, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={withClass(className)} {...rest}>
      <rect x="6.5" y="4" width="19" height="24" rx="1.8" fill="var(--indigo)" />
      <rect x="6.5" y="4" width="3" height="24" fill="var(--indigo-2)" />
      <rect x="11.5" y="9" width="11" height="2.4" rx="0.4" fill="var(--cream)" />
      <line x1="12" y1="15" x2="22" y2="15" stroke="var(--cream)" strokeOpacity="0.55" strokeWidth="0.9" />
      <line x1="12" y1="17.5" x2="19" y2="17.5" stroke="var(--cream)" strokeOpacity="0.55" strokeWidth="0.9" />
      <line x1="12" y1="20" x2="21" y2="20" stroke="var(--cream)" strokeOpacity="0.55" strokeWidth="0.9" />
      <path d="M19.5 4 L19.5 11.2 L21 9.8 L22.5 11.2 L22.5 4 Z" fill="var(--rust)" />
      <ellipse cx="10.5" cy="7" rx="1" ry="1.6" fill="rgba(255,255,255,0.25)" />
    </svg>
  );
}

export function GoalsIcon({ className, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={withClass(className)} {...rest}>
      <circle cx="16" cy="16" r="11" fill="var(--moss)" />
      <circle cx="16" cy="16" r="7.5" fill="var(--paper)" />
      <circle cx="16" cy="16" r="4.5" fill="var(--moss)" />
      <circle cx="16" cy="16" r="1.8" fill="var(--rust)" />
      <ellipse cx="12.5" cy="13" rx="1.3" ry="1.7" fill="rgba(255,255,255,0.3)" />
    </svg>
  );
}

export function RoutinesIcon({ className, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={withClass(className)} {...rest}>
      <rect x="5" y="6" width="22" height="22" rx="2" fill="var(--cream)" stroke="var(--hairline-strong)" strokeWidth="0.6" />
      <rect x="5" y="6" width="22" height="5" rx="2" fill="var(--ochre)" />
      <rect x="10" y="3.5" width="1.6" height="5" rx="0.6" fill="var(--walnut)" />
      <rect x="20.4" y="3.5" width="1.6" height="5" rx="0.6" fill="var(--walnut)" />
      <path d="M11 19 L15 23 L22 14" stroke="var(--moss)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function SprintsIcon({ className, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={withClass(className)} {...rest}>
      <path d="M16 28 C 22 28, 26 24, 26 19 C 26 15, 23 13, 22 10 C 21 7, 19 5, 17 3 C 17 8, 15 11, 14 14 C 12 16, 10 16, 9 14 C 7 17, 5 22, 8 26 C 11 29, 14 28, 16 28 Z" fill="var(--rust)" />
      <path d="M16 25 C 20 25, 22 22, 22 19 C 22 16, 20 14, 19 12 C 18 10, 17 10, 17 8 C 16 11, 15 13, 14 15 C 13 16, 12 15, 11.5 14 C 11 16, 10 19, 11 22 C 12 25, 14 25, 16 25 Z" fill="var(--ochre)" />
      <ellipse cx="13" cy="20" rx="0.9" ry="1.5" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
}

export function AnalysisIcon({ className, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={withClass(className)} {...rest}>
      <rect x="4.5" y="5" width="23" height="22" rx="1.6" fill="var(--cream)" stroke="var(--hairline-strong)" strokeWidth="0.6" />
      <path d="M22 5 L27.5 5 L27.5 10.5 Z" fill="var(--soft)" />
      <path d="M22 5 L22 10.5 L27.5 10.5" fill="none" stroke="var(--hairline-strong)" strokeWidth="0.6" />
      <rect x="8" y="20" width="3" height="4" fill="var(--indigo)" />
      <rect x="12.5" y="17" width="3" height="7" fill="var(--moss)" />
      <rect x="17" y="14" width="3" height="10" fill="var(--ochre)" />
      <rect x="21.5" y="11" width="3" height="13" fill="var(--rust)" />
      <line x1="6.5" y1="24.5" x2="25.5" y2="24.5" stroke="var(--ink-3)" strokeWidth="0.7" />
    </svg>
  );
}

export function MoonIcon({ className, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={withClass(className)} {...rest}>
      <path d="M23 7 A 11 11 0 1 0 23 25 A 8.5 8.5 0 1 1 23 7 Z" fill="var(--walnut)" />
      <ellipse cx="12" cy="12" rx="1" ry="1.5" fill="rgba(255,255,255,0.28)" />
      <path d="M25 7 L26 9 L28 10 L26 11 L25 13 L24 11 L22 10 L24 9 Z" fill="var(--ochre)" />
    </svg>
  );
}

export function SunIcon({ className, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={withClass(className)} {...rest}>
      <circle cx="16" cy="16" r="6" fill="var(--ochre)" />
      <ellipse cx="13.5" cy="13.5" rx="1.1" ry="1.5" fill="rgba(255,255,255,0.32)" />
      <g stroke="var(--ochre)" strokeWidth="1.7" strokeLinecap="round">
        <line x1="16" y1="3" x2="16" y2="7" />
        <line x1="16" y1="25" x2="16" y2="29" />
        <line x1="3" y1="16" x2="7" y2="16" />
        <line x1="25" y1="16" x2="29" y2="16" />
        <line x1="6.7" y1="6.7" x2="9.5" y2="9.5" />
        <line x1="22.5" y1="22.5" x2="25.3" y2="25.3" />
        <line x1="25.3" y1="6.7" x2="22.5" y2="9.5" />
        <line x1="9.5" y1="22.5" x2="6.7" y2="25.3" />
      </g>
    </svg>
  );
}
