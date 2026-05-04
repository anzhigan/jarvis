import { ChevronLeft } from 'lucide-react';
import { resolveUrl } from '../api/client';
import type { User } from '../api/types';

interface Props {
  variant: 'large' | 'compact';
  title: string;
  crumb?: string;         // parent breadcrumb for compact with-crumb
  user: User;
  onBack?: () => void;    // compact only
  onAvatarTap: () => void;
  children?: React.ReactNode; // for large: segmented control below title
}

export default function MobileNavbar({ variant, title, crumb, user, onBack, onAvatarTap, children }: Props) {
  const Avatar = (
    <button className="avatar-btn" onClick={onAvatarTap}>
      {user.avatar_url
        ? <img src={resolveUrl(user.avatar_url)} alt="" />
        : user.username.charAt(0).toUpperCase()}
    </button>
  );

  if (variant === 'large') {
    return (
      <div className="navbar large app-only-mobile">
        <div className="row">
          <div style={{ flex: 1 }} />
          <div className="right-actions">{Avatar}</div>
        </div>
        <p className="big-title">{title}</p>
        {children}
      </div>
    );
  }

  return (
    <div className="navbar app-only-mobile">
      {onBack && (
        <button className="back-btn" onClick={onBack}>
          <ChevronLeft />
        </button>
      )}
      {crumb ? (
        <div className="nav-title with-crumb" style={{ flex: 1 }}>
          <span className="crumb">{crumb} /</span>
          <span>{title}</span>
        </div>
      ) : (
        <div className="nav-title" style={{ flex: 1, textAlign: 'center' }}>{title}</div>
      )}
      <div className="right-actions">{Avatar}</div>
    </div>
  );
}
