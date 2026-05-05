import { ChevronLeft } from 'lucide-react';
import { resolveUrl } from '../api/client';
import type { User } from '../api/types';

interface Props {
  variant: 'large' | 'compact';
  title: string;
  crumb?: string;         // parent breadcrumb for compact with-crumb
  user: User;
  onBack?: () => void;    // compact only
  onAvatarTap?: () => void;
  rightSlot?: React.ReactNode; // overrides avatar when provided
  children?: React.ReactNode; // for large: segmented control below title
}

export default function MobileNavbar({ variant, title, crumb, user, onBack, onAvatarTap, rightSlot, children }: Props) {
  const Avatar = onAvatarTap ? (
    <button className="profile-btn" onClick={onAvatarTap} title="Profile">
      {user.avatar_url ? (
        <img src={resolveUrl(user.avatar_url)} alt="" className="profile-avatar" />
      ) : (
        <span className="profile-avatar">{user.username.charAt(0).toUpperCase()}</span>
      )}
    </button>
  ) : null;

  const rightContent = rightSlot ?? Avatar;

  if (variant === 'large') {
    return (
      <div className="navbar large app-only-mobile">
        <div className="row">
          <div style={{ flex: 1 }} />
          {rightContent && <div className="right-actions">{rightContent}</div>}
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
      {rightContent && <div className="right-actions">{rightContent}</div>}
    </div>
  );
}
