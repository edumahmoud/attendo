# Task 2-b: Update shared components to display user titles next to names

## Summary
Updated 6 shared components to use `formatNameWithTitle` from `@/components/shared/user-avatar` to display academic titles (دكتور, أستاذة, etc.) next to teacher names.

## Files Modified

### 1. attendance-section.tsx
- Added `formatNameWithTitle` import
- Updated 2 Supabase user queries: `select('id, name, email')` → `select('id, name, email, title_id, gender, role')`
- Both fetchAttendanceRecords and handleViewPastSession now format student_name with formatNameWithTitle at enrichment time
- Enrolled student list display uses formatNameWithTitle

### 2. assignments-section.tsx
- Added `formatNameWithTitle` import
- Updated fetchSubmissions query: `select('name, email')` → `select('name, email, title_id, gender, role')`
- student_name formatted at enrichment time with formatNameWithTitle

### 3. subjects-section.tsx
- Added `formatNameWithTitle` import
- Updated fetchTeacherNames query: `select('id, name')` → `select('id, name, title_id, gender, role')`
- teacherNames map now stores pre-formatted names (formatNameWithTitle applied at fetch time)
- All teacher name displays (approved, pending, rejected subjects) use the formatted map values

### 4. chat-section.tsx
- Added `formatNameWithTitle` import
- 4 name display locations updated:
  - senderName in renderMessage
  - chatHeaderName for individual chat headers
  - displayName in conversation list
  - user.name in search results

### 5. notification-bell.tsx
- Added `formatNameWithTitle` import
- Teacher name in link request modal formatted with formatNameWithTitle(name, 'teacher', title_id, gender)

### 6. notifications-section.tsx
- Added `formatNameWithTitle` import
- Same as notification-bell - teacher name formatted in link request modal

## Key Notes
- formatNameWithTitle only adds title prefix for role='teacher' (students show plain names)
- All Supabase user queries updated to include title_id, gender, role fields
- Lint passes with 0 errors
