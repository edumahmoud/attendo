import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// -------------------------------------------------------
// Academic titles (shared across the app)
// -------------------------------------------------------
export const ACADEMIC_TITLES = [
  { value: 'teacher', label: 'معلم', femaleLabel: 'معلمة' },
  { value: 'dr', label: 'دكتور', femaleLabel: 'دكتورة' },
  { value: 'prof', label: 'أستاذ', femaleLabel: 'أستاذة' },
  { value: 'assoc_prof', label: 'أستاذ مشارك', femaleLabel: 'أستاذة مشاركة' },
  { value: 'assist_prof', label: 'أستاذ مساعد', femaleLabel: 'أستاذة مساعدة' },
  { value: 'lecturer', label: 'محاضر', femaleLabel: 'محاضرة' },
  { value: 'teaching_assist', label: 'معيد', femaleLabel: 'معيدة' },
] as const;

/**
 * Gender-aware, title-aware role label.
 * Teachers show their chosen academic title (دكتور, أستاذ, …);
 * other roles show gender-aware defaults (طالب/طالبة, مشرف/مشرفة, …).
 */
export function getRoleLabel(
  role?: string | null,
  gender?: string | null,
  titleId?: string | null,
): string {
  if (!role) return '';
  const isFemale = gender === 'female';
  switch (role) {
    case 'student': return isFemale ? 'طالبة' : 'طالب';
    case 'superadmin': return isFemale ? 'مديرة المنصة' : 'مدير المنصة';
    case 'admin': return isFemale ? 'مشرفة' : 'مشرف';
    case 'teacher': {
      const effectiveTitleId = titleId || 'teacher';
      const title = ACADEMIC_TITLES.find(t => t.value === effectiveTitleId);
      if (title) {
        return isFemale ? title.femaleLabel : title.label;
      }
      return isFemale ? 'معلمة' : 'معلم';
    }
    default: return role;
  }
}
