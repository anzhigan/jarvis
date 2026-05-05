interface Props {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export function EmptyDesktop({ title, description, icon }: Props) {
  return (
    <div className="dt-empty">
      {icon && <div style={{ color: 'var(--fg-faint)' }}>{icon}</div>}
      <div>
        <div className="dt-empty-title">{title}</div>
        {description && <div className="dt-empty-desc mt-1">{description}</div>}
      </div>
    </div>
  );
}
