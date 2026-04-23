'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  /** Profile image URL */
  src?: string | null;
  /** Display name – first character used as fallback */
  name?: string | null;
  /** Size preset */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Extra className on the root Avatar */
  className?: string;
  /** Extra className on the fallback bubble */
  fallbackClassName?: string;
}

const sizeMap: Record<string, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
};

const fallbackBgMap: Record<string, string> = {
  xs: 'bg-emerald-100 text-emerald-700',
  sm: 'bg-emerald-100 text-emerald-700',
  md: 'bg-emerald-100 text-emerald-700',
  lg: 'bg-emerald-100 text-emerald-700',
};

/**
 * Displays the user's profile picture when available,
 * falling back to a coloured circle with the first letter of their name.
 */
export function UserAvatar({
  src,
  name,
  size = 'sm',
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const initial = name?.charAt(0) || '?';

  return (
    <Avatar className={cn(sizeMap[size], className)}>
      {src && (
        <AvatarImage
          src={src}
          alt={name || 'مستخدم'}
          className="object-cover"
        />
      )}
      <AvatarFallback
        className={cn(
          fallbackBgMap[size],
          'font-bold',
          fallbackClassName,
        )}
      >
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}
