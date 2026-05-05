import { useMemo } from 'react';
import type { Go } from '../../api/types';

// Last N days as colored squares (green=done, red=missed)
export default function DailyStreak({ go }: { go: Go }) {
  const days = 14;

  const entryMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of go.entries) m.set(e.date, e.value);
    return m;
  }, [go.entries]);

  const createdDate = useMemo(() => {
    const d = new Date(go.created_at);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [go.created_at]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const squares: { date: string; value: number; isToday: boolean; beforeCreation: boolean; weekdayIdx: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    squares.push({
      date: key,
      value: entryMap.get(key) ?? 0,
      isToday: i === 0,
      beforeCreation: d < createdDate,
      weekdayIdx: d.getDay(),
    });
  }

  const doneCount = squares.filter((s) => !s.beforeCreation && s.value > 0).length;
  const eligible = squares.filter((s) => !s.beforeCreation).length;

  // Reverse so today appears on the LEFT (latest first), past on the right
  const ordered = [...squares].reverse();

  const wkLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
        <span>← today &nbsp;·&nbsp; <span className="font-medium text-foreground">{doneCount}</span>/{eligible}</span>
      </div>
      <div className="flex gap-1 items-end">
        {ordered.map((s) => {
          let cellStyle: React.CSSProperties = { background: 'color-mix(in srgb, var(--fg-muted) 20%, transparent)' };
          let inner: React.ReactNode = null;
          let title = s.date;
          if (s.beforeCreation) {
            cellStyle = { background: 'color-mix(in srgb, var(--fg-muted) 10%, transparent)' };
            title = `${s.date} — before start`;
          } else if (s.value > 0) {
            cellStyle = { background: 'var(--success)' };
            inner = <span style={{ color: '#fff', fontSize: 8 }}>✓</span>;
            title = `${s.date} — done`;
          } else if (s.isToday) {
            cellStyle = { background: 'var(--bg-card)', boxShadow: `0 0 0 2px var(--accent-primary)` };
            title = `${s.date} — today (not yet)`;
          } else {
            cellStyle = { background: 'color-mix(in srgb, var(--danger) 30%, transparent)' };
            title = `${s.date} — missed`;
          }
          return (
            <div key={s.date} className="flex flex-col items-center gap-0.5">
              <div
                title={title}
                className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${s.isToday ? 'scale-110' : ''}`}
                style={cellStyle}
              >
                {inner}
              </div>
              <span className={`text-[8px] ${s.isToday ? 'font-semibold' : ''}`} style={{ color: s.isToday ? 'var(--fg-primary)' : 'var(--fg-muted)' }}>
                {wkLabels[s.weekdayIdx]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
