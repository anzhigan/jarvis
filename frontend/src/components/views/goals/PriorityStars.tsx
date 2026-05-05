import { Star } from 'lucide-react';
import type { TaskPriority } from '../../../api/types';

const COUNT: Record<TaskPriority, number> = { low: 1, medium: 2, high: 3 };

interface Props {
  priority: TaskPriority;
  onChange?: (next: TaskPriority) => void;
  size?: number;
  readOnly?: boolean;
}

const ALL: TaskPriority[] = ['low', 'medium', 'high'];

export function PriorityStars({ priority, onChange, size = 12, readOnly }: Props) {
  const filled = COUNT[priority];

  if (readOnly || !onChange) {
    return (
      <span className="pri-stars" aria-label={`Priority: ${priority}`}>
        {[1, 2, 3].map((i) => (
          <Star key={i} className="pri-star" data-on={i <= filled || undefined} size={size} />
        ))}
      </span>
    );
  }

  return (
    <span className="pri-stars" role="radiogroup" aria-label="Priority">
      {ALL.map((p, idx) => {
        const n = idx + 1;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={p === priority}
            onClick={() => onChange(p)}
            className="appearance-none p-0 bg-transparent border-0 cursor-pointer"
            title={p}
          >
            <Star className="pri-star" data-on={n <= filled || undefined} size={size} />
          </button>
        );
      })}
    </span>
  );
}
