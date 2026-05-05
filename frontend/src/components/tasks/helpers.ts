import type { Go, GoRecurrence } from '../../api/types';
import { ENTITY_COLORS } from '../../lib/colors';

export function todayIso(): string {
  // Use local date, not UTC (avoids timezone edge case around midnight)
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function goValueToday(go: Go): number {
  const today = todayIso();
  return go.entries.find((e) => e.date === today)?.value ?? 0;
}

export function adaptiveSteps(target: number | null | undefined): number[] {
  if (!target || target <= 0) return [1, 5];
  if (target <= 10) return [1];
  if (target <= 50) return [1, 5];
  if (target <= 200) return [5, 10, 25];
  if (target <= 1000) return [10, 50, 100];
  return [50, 100, 500];
}

export function formatDate(iso: string | null): string | null {
  return iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
}

export const STRIPE_COLOR: Record<GoRecurrence, string> = {
  weekly: ENTITY_COLORS[4],   // cyan
  daily:  ENTITY_COLORS[1],   // emerald
  none:   ENTITY_COLORS[0],   // indigo
};
