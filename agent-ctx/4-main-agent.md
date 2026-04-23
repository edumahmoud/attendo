# Task 4 - Update bulk-share API and settings with shared getRoleLabel

## Summary
Updated the bulk-share API route and settings components to use the shared `getRoleLabel` utility from `@/lib/utils` instead of local inline role label logic.

## Changes Made

### 1. Created `/src/app/api/files/bulk-share/route.ts`
- New bulk-share endpoint that shares multiple files with multiple users in a single request
- Imports `getRoleLabel` from `@/lib/utils` for gender-aware, title-aware role labels
- Sharer profile query selects `name, role, gender, title_id` for proper label generation
- Notification content uses `sharerLabel` which combines the gender-aware role label with the name
- Supports both `user_file` and `subject_file` file types

### 2. Updated `/src/components/shared/settings-page.tsx`
- Removed local `roleLabels` map (was: student→طالب, teacher→معلم, admin→مشرف)
- Imported `getRoleLabel as getSharedRoleLabel` from `@/lib/utils`
- Replaced `roleLabels[profile.role]` with `getSharedRoleLabel(profile.role, profile.gender, profile.title_id)`
- Added `superadmin` to `roleColors` map

### 3. Updated `/src/components/shared/settings-modal.tsx`
- Replaced inline ternary `profile.role === 'student' ? 'طالب' : 'معلم'` with `getSharedRoleLabel(profile.role, profile.gender, profile.title_id)`
- Imported `getRoleLabel as getSharedRoleLabel` from `@/lib/utils`

## Lint Status
- 0 errors, 2 pre-existing warnings (unrelated)
