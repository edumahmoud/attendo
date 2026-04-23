# Task 2-c: Update dashboard components to display user titles next to names

## Summary
Updated 4 files to use `formatNameWithTitle` for displaying academic titles next to teacher names throughout the application.

## Changes Made

### 1. teacher-dashboard.tsx
- Added `formatNameWithTitle` to import from `@/components/shared/user-avatar`
- Fixed hardcoded "د." prefix in welcome message: `أهلاً بك، د. {profile.name}` → `أهلاً بك، {formatNameWithTitle(profile.name, profile.role, profile.title_id, profile.gender)}`
- Now dynamically shows correct title based on teacher's title_id and gender

### 2. student-dashboard.tsx
- All teacher names already displayed via `UserLink` component (handles titles internally)
- Fixed missing `gender` and `titleId` props on teacherPreview UserLink
- No `formatNameWithTitle` import needed (UserLink handles it)

### 3. admin-dashboard.tsx
- Added `formatNameWithTitle` to import from `@/components/shared/user-avatar`
- Changed `{student.name}` → `{formatNameWithTitle(student.name, student.role, student.title_id, student.gender)}`

### 4. personal-files-section.tsx
- Import already included `formatNameWithTitle` from prior work
- 2 locations already used it (lines 1783, 2162)
- Added `formatNameWithTitle` to 6 remaining plain name displays:
  - Share search results (line ~2299)
  - Selected share user badge (line ~2322)
  - Shared-with user name in file shares (line ~2364)
  - Bulk share search results (line ~2677)
  - Bulk share selected user badge (line ~2700)
- Also simplified shared-by file display: removed separate title/role label, used formatNameWithTitle directly
- Verified all Supabase queries use `select('*')` (includes title_id, gender, role)
- Verified UserProfile type has required fields

## Lint Status
All lint checks pass (0 errors)
