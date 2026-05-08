import { Plus } from 'lucide-react';

interface Props {
  onClick: () => void;
  ariaLabel?: string;
}

/** Floating + button in the bottom-right of the screen. */
export function MobileFab({ onClick, ariaLabel = 'Create' }: Props) {
  return (
    <button type="button" className="fab" onClick={onClick} aria-label={ariaLabel}>
      <Plus size={22} strokeWidth={2.4} />
    </button>
  );
}
