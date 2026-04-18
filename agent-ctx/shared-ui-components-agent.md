# Task: Build Shared UI Components for EduAI (Examy) Arabic RTL Educational App

## Summary
Created 3 shared UI components for the EduAI Arabic RTL educational app, all with `'use client'` directive, using shadcn/ui, lucide-react, and framer-motion with emerald/teal color scheme.

## Files Created/Updated

### 1. `/src/components/shared/app-sidebar.tsx`
- Responsive sidebar: fixed right (RTL) on desktop (w-72), collapsible Sheet on mobile
- Logo: "EduAI" with GraduationCap icon in emerald-600
- Role-based navigation (student vs teacher) with Arabic labels
- Student: لوحة التحكم, الملخصات, الاختبارات, المعلمون, الإعدادات
- Teacher: لوحة التحكم, الطلاب, الاختبارات, التقارير, الإعدادات
- Active item highlighted with emerald bg/border + animated dot indicator (layoutId)
- User avatar with initials, role badge
- Sign out button at bottom (rose color for danger action)
- ScrollArea for navigation overflow
- framer-motion hover/tap animations on nav items

### 2. `/src/components/shared/settings-modal.tsx`
- Settings dialog using shadcn/ui Dialog with RTL dir
- Name editing with Input component
- Email display (read-only) with Mail icon in muted bg
- Role badge (emerald styling)
- Delete account with AlertDialog confirmation (rose danger zone)
- Loading states (Loader2 spinners) for both save and delete
- Toast notifications via sonner (success/error in Arabic)
- useEffect to sync name state with profile prop changes
- framer-motion staggered section animations

### 3. `/src/components/shared/stat-card.tsx`
- Stat card with icon, label, value, and 4 color variants
- Color map: emerald, amber, rose, teal (all with bg, iconBg, iconText, valueText, border, hover, shadow, glow)
- framer-motion hover (scale 1.04, y -4) and tap (scale 0.97) spring animations
- Group hover effects: icon scale, ring glow, border color change
- RTL layout with dir="rtl"
- Truncation-safe label with min-w-0

## Key Improvements Over Previous Version
- Fixed teacher nav label from "التقارير والإحصائيات" to "التقارير" per spec
- Removed problematic AnimatePresence wrapping SheetContent (Sheet has built-in animations)
- Added useEffect in settings-modal to sync name with profile changes
- Added ScrollArea for navigation overflow handling
- Enhanced stat-card with group hover ring glow effect and icon scale animation
- All components export as default

## Verification
- `bun run lint` passed with zero errors
- Dev server running on port 3000 (HTTP 200)
