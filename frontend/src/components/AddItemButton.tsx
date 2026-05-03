import { Plus } from 'lucide-react';

interface Props {
  label: string;
  onClick: () => void;
}

export default function AddItemButton({ label, onClick }: Props) {
  return (
    <button className="add-item-btn" onClick={onClick}>
      <Plus size={14} />
      {label}
    </button>
  );
}
