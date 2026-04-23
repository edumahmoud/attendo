'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';

// Academic titles for teachers
export const ACADEMIC_TITLES = [
  { value: 'teacher', label: 'معلم', femaleLabel: 'معلمة' },
  { value: 'dr', label: 'دكتور', femaleLabel: 'دكتورة' },
  { value: 'prof', label: 'أستاذ', femaleLabel: 'أستاذة' },
  { value: 'assoc_prof', label: 'أستاذ مشارك', femaleLabel: 'أستاذة مشاركة' },
  { value: 'assist_prof', label: 'أستاذ مساعد', femaleLabel: 'أستاذة مساعدة' },
  { value: 'lecturer', label: 'محاضر', femaleLabel: 'محاضرة' },
  { value: 'teaching_assist', label: 'معيد', femaleLabel: 'معيدة' },
] as const;

export function getTitleLabel(titleId?: string | null, gender?: string | null): string | null {
  if (!titleId) return null;
  const title = ACADEMIC_TITLES.find(t => t.value === titleId);
  if (!title) return null;
  return gender === 'female' ? title.femaleLabel : title.label;
}

export function getRoleLabel(role: string, gender?: string | null, titleId?: string | null): string {
  const isFemale = gender === 'female';
  if (role === 'student') return isFemale ? 'طالبة' : 'طالب';
  if (role === 'admin' || role === 'superadmin') return isFemale ? 'مشرفة' : 'مشرف';
  // For teachers, show academic title if available
  const title = getTitleLabel(titleId, gender);
  return title || (isFemale ? 'معلمة' : 'معلم');
}

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
};

const iconSizeMap = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-8 w-8',
};

export default function UserAvatar({ name, avatarUrl, size = 'md', className = '' }: UserAvatarProps) {
  const initials = name
    ? name
        .split(' ')
        .map(w => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '';

  return (
    <Avatar className={`${sizeMap[size]} border-2 border-emerald-200 shrink-0 ${className}`}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback className="bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700 font-bold select-none">
        {initials || <User className={iconSizeMap[size]} />}
      </AvatarFallback>
    </Avatar>
  );
}
