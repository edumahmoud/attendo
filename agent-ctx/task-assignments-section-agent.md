# Task: AssignmentsSection Component

## Work Completed

### 1. Created `/home/z/my-project/src/components/shared/assignments-section.tsx`
A comprehensive `'use client'` component handling the المهام (Assignments) section with:

**Teacher View:**
- Create Assignment dialog (title, description, datetime-local deadline picker)
- Assignment cards with: title, description preview, deadline badge (expired/approaching/active), submission count, active/inactive status
- Actions per card: View submissions, Toggle active/inactive, Edit, Delete
- Submissions view dialog showing:
  - Students who submitted (name, email, file, notes, time, download button)
  - Students who haven't submitted yet
- Delete confirmation dialog
- Edit dialog with full fields + active toggle

**Student View:**
- Only shows active assignments where deadline hasn't passed (expired filtered client-side)
- Assignment cards with title, description, deadline countdown
- "تم التسليم" badge for submitted assignments
- Submit dialog with:
  - File picker (required, max 20MB)
  - Notes textarea (optional)
  - Upload progress bar using XMLHttpRequest
  - Proper cleanup on cancel/complete

**Deadline System:**
- `< 1 hour`: red text + pulse animation
- `< 24 hours`: amber warning text
- `> 24 hours`: emerald countdown "يتبقى X أيام X ساعات"
- Expired: red "منتهي" badge
- No deadline: "بدون موعد نهائي" slate badge

**Features:**
- Full Arabic RTL layout
- emerald/teal color scheme
- framer-motion animations with specified containerVariants/itemVariants
- Realtime subscription for assignments and submissions changes
- Loading skeletons, empty states
- XHR upload with progress tracking
- All API endpoints as specified

### 2. Updated `/home/z/my-project/src/components/shared/subject-detail.tsx`
- Added `ClipboardCheck` icon import
- Added `AssignmentsSection` import
- Added `assignments` tab (`المهام`) to both teacherTabs and studentTabs
- Added `TabsContent` for assignments rendering the `AssignmentsSection` component

### 3. Lint Check
- 0 errors, only 2 pre-existing warnings in other files
- Dev server compiles successfully
