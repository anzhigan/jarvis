import type { TaskPriority } from '../../api/types';

const PRIORITY_STARS: Record<TaskPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export default function PriorityStars({ priority, size = 12 }: { priority: TaskPriority; size?: number }) {
  const n = PRIORITY_STARS[priority];
  return (
    <span title={`${priority} priority`} className="inline-flex items-center gap-px text-muted-foreground/70" style={{ fontSize: size }}>
      {'★'.repeat(n)}
    </span>
  );
}
