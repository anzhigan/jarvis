import { useEffect, useRef, useState } from 'react';

interface Props {
  initial: string;
  onChange: (newName: string) => void | Promise<void>;
}

/**
 * Editable h1 title for a note. Renders the name as a large heading that
 * the user can click into and edit. Commits on blur or Enter.
 */
export default function NoteTitle({ initial, onChange }: Props) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setValue(initial); }, [initial]);

  // Auto-grow textarea
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== initial) onChange(trimmed);
    else if (!trimmed) setValue(initial);
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLTextAreaElement).blur(); }
      }}
      placeholder="Untitled"
      className="w-full bg-transparent border-0 outline-none resize-none text-3xl md:text-4xl font-bold tracking-tight leading-tight placeholder:text-muted-foreground/40"
      style={{ overflow: 'hidden' }}
    />
  );
}
