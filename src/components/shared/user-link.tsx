'use client';

import UserAvatar, { getRoleLabel, getTitleLabel } from '@/components/shared/user-avatar';
import { useAppStore } from '@/stores/app-store';

interface UserLinkProps {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  role?: string;
  gender?: string | null;
  titleId?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showAvatar?: boolean;
  showRole?: boolean;
  className?: string;
}

export default function UserLink({
  userId,
  name,
  avatarUrl,
  role,
  gender,
  titleId,
  size = 'sm',
  showAvatar = true,
  showRole = false,
  className = '',
}: UserLinkProps) {
  const { openProfile } = useAppStore();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openProfile(userId);
  };

  const roleLabel = role ? getRoleLabel(role, gender, titleId) : null;
  const titleLabel = role === 'teacher' ? getTitleLabel(titleId, gender) : null;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 hover:bg-muted/50 rounded-md px-1 py-0.5 -mx-1 -my-0.5 transition-colors cursor-pointer group ${className}`}
      title={`عرض ملف ${name}`}
    >
      {showAvatar && (
        <UserAvatar name={name} avatarUrl={avatarUrl} size={size} />
      )}
      <span className="flex flex-col items-start min-w-0">
        <span className="text-sm font-medium text-foreground group-hover:text-emerald-600 transition-colors truncate max-w-[150px]">
          {titleLabel && <span className="text-emerald-600 ml-1 text-xs font-normal">{titleLabel}</span>}
          {name}
        </span>
        {showRole && roleLabel && (
          <span className="text-[10px] text-muted-foreground font-medium">
            {roleLabel}
          </span>
        )}
      </span>
    </button>
  );
}
