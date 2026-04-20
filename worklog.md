---
Task ID: 1
Agent: Main Agent
Task: Fix notification loading issue - notifications not loading and not appearing

Work Log:
- Read and analyzed notification-bell.tsx, notifications-panel.tsx, supabase.ts, auth-store.ts, API route, and schema SQL
- Identified root causes:
  1. fetchNotifications silently catches errors, making debugging impossible
  2. Direct Supabase client query may fail if session not properly loaded
  3. No fallback mechanism when direct query fails
  4. Realtime subscription may not work if Realtime not enabled for notifications table
  5. No DELETE RLS policy on notifications table (users can't delete their own notifications)
- Fixed notification-bell.tsx:
  - Added getAuthToken() helper to get user's JWT from supabase.auth.getSession()
  - Changed fetchNotifications to try API endpoint first (/api/notifications) with auth token, then fall back to direct Supabase query
  - Added proper error logging throughout (console.error, console.warn)
  - Reduced polling interval from 15s to 10s for better reliability
  - Changed markAsRead, markAllAsRead, deleteNotification to use API endpoint with auth token
  - Added better realtime subscription status logging
- Fixed notifications-panel.tsx with same changes:
  - API-first fetch with fallback to direct query
  - getAuthToken() helper for authenticated API calls
  - Better error handling and logging
  - 10s polling fallback
  - markAsRead, markAllAsRead, deleteNotification, clearAllNotifications all use API endpoint
- Created supabase/fix_notifications_rls.sql:
  - Added DELETE RLS policy for notifications (users can delete own notifications)
  - Added INSERT RLS policy for notifications (users can insert own notifications)
  - Enabled Realtime publication for notifications table and other important tables (lectures, lecture_attendance, messages, subjects, etc.)

Stage Summary:
- notification-bell.tsx: Now uses API endpoint with auth token for reliable notification fetching
- notifications-panel.tsx: Same API-first approach with auth token
- SQL migration created for DELETE/INSERT RLS policies and Realtime enable
- User needs to run supabase/fix_notifications_rls.sql in Supabase SQL Editor
- No lint errors, dev server running successfully

---
Task ID: 2
Agent: Main Agent
Task: Quiz system improvements - subject name, teacher controls, answer feedback, scheduled time

Work Log:
- Analyzed quiz-related files: quiz-view.tsx, teacher-dashboard.tsx, student-dashboard.tsx, subject-detail.tsx, types.ts
- Updated quiz-view.tsx:
  - Removed correct/incorrect feedback during quiz taking (green/red indicators)
  - Added neutral "تم حفظ إجابتك" (Answer saved) message instead
  - Updated MCQQuestion, BooleanQuestion, MatchingQuestion components to show teal "selected" state instead of green/red during quiz
  - Added showCorrectAnswer prop logic: only shows correct/incorrect in review mode
  - Added quiz start screen with quiz info (title, subject name, question count, duration, scheduled time)
  - Added scheduled time check: if quiz is scheduled for future, shows "لم يحين موعد الاختبار بعد" with the actual scheduled time
  - Added subject name display in quiz taking header and results screen
  - Added quizSubjectName state and subject name fetching from Supabase
  - Added ClipboardList, BookOpen, Clock, Calendar imports
- Updated student-dashboard.tsx:
  - Cleaned up (quiz as any) casts to use proper quiz.subject_name, quiz.subject_id
  - Added formatted scheduled date/time display in Arabic locale
  - Added isScheduledFuture check for quiz cards
  - Added "لم يبدأ بعد" (Not started yet) badge for future-scheduled quizzes
  - Added "سيبدأ في الموعد المحدد" (Will start at scheduled time) action for future quizzes
- Updated teacher-dashboard.tsx:
  - Cleaned up (quiz as any) casts to use proper quiz.subject_name, quiz.subject_id, quiz.allow_retake
  - Added formatted scheduled date/time display in Arabic locale
  - Added completed student count on quiz cards
  - Added inline retake toggle button on quiz cards (allow_retake on/off)
  - Updated handleOpenEditQuiz to use proper typing
  - Updated handleCreateQuiz to always include allow_retake in quizData
- Updated subject-detail.tsx:
  - Added formatted scheduled date/time display in Arabic locale
  - Added isScheduledFuture check for quiz cards
  - Added "لم يبدأ بعد" badge and "سيبدأ في الموعد المحدد" action for future quizzes

Stage Summary:
- Subject name now properly displayed on quiz cards (student & teacher) and quiz view
- Teacher can toggle allow_retake directly from quiz card without opening edit form
- Correct/incorrect answers only shown after quiz completion (review), not during solving
- Scheduled time properly formatted in Arabic and displayed on quiz cards
- Students prevented from starting quizzes scheduled for the future
- Quiz start screen shows comprehensive quiz info before starting
- No lint errors, dev server running successfully

---

## Task 3: Add Full-Page Lecture Detail Dialog for Teachers

### Changes Made to `/home/z/my-project/src/components/shared/subject-detail.tsx`:

1. **New State Variables** (after line 266):
   - `lectureDetailOpen` - controls dialog visibility
   - `lectureDetailData` - stores the lecture being viewed
   - `lectureNote` - tracks note text input
   - `savingLectureNote` - loading state for note saving
   - `lectureDetailSearch` - search filter for student list in dialog

2. **New Handler Functions** (after `handleRemoveStudent`):
   - `handleSaveLectureNote` - saves lecture description/notes to Supabase `lectures` table
   - `handleExportAttendanceExcel` - generates Excel file with attendance data using `xlsx` package, includes student name, email, attendance status, registration time, date, range status, and distance
   - `openLectureDetail` - opens the detail dialog for a lecture, fetches its attendance data

3. **Lecture Card Clickable for Teachers**:
   - Added `onClick={() => isTeacher && openLectureDetail(lecture)}` to the Card component
   - Added `cursor-pointer` class to Card
   - Added `e.stopPropagation()` to all teacher action buttons (Start/Stop, QR, Attendance) to prevent card click from triggering when clicking buttons

4. **Lecture Detail Dialog**:
   - Full-page dialog with `sm:max-w-4xl` width and `max-h-[90vh]` height
   - **Header**: Shows lecture title, subject name, active/ended status with animated indicator
   - **Stats Row**: Present count, absent count, total students, attendance percentage
   - **Lecture Info**: Start/end timestamps formatted in Arabic
   - **Notes Section**: Textarea for adding/editing lecture notes with save button
   - **Attendance List**: Searchable student list with attendance status badges, email, and registration time
   - **Excel Export**: Button to download attendance data as .xlsx file

### Technical Notes:
- Used `require('xlsx')` with eslint-disable comment since this is a client component
- Used IIFE pattern inside DialogContent to compute derived values (presentCount, absentCount, etc.)
- All text in Arabic as per project convention
- No lint errors, dev server compiles successfully
---
Task ID: 1-4
Agent: Main
Task: Build full-page lecture detail dialog for teacher with student attendance, notes, and Excel export

Work Log:
- Explored current lecture/attendance system code structure
- Updated LectureAttendance type to include student_email field
- Updated fetchLectureAttendance to also fetch student email
- Added 5 new state variables: lectureDetailOpen, lectureDetailData, lectureNote, savingLectureNote, lectureDetailSearch
- Added handleSaveLectureNote handler for saving lecture notes to description field
- Added handleExportAttendanceExcel handler for generating Excel file using xlsx package
- Added openLectureDetail function to open dialog and fetch attendance
- Made lecture cards clickable for teachers with onClick handler
- Added e.stopPropagation() to all teacher action buttons (start/stop, QR, attendance)
- Built full lecture detail Dialog with: stats row (present/absent/total/percentage), lecture timestamps, notes textarea, searchable attendance table, Excel export button

Stage Summary:
- Teacher can now click on any lecture card to open a full detail view
- Detail view shows attendance stats, enrolled students with present/absent status
- Teacher can add/edit notes directly in the detail view
- Excel download includes all student data with attendance status
- All changes compile and lint passes with 0 errors

---
Task ID: 1
Agent: Fix Subjects Loading

Work Log:
- Read and analyzed subjects-section.tsx (1388 lines)
- Identified performance issues:
  1. `showLoading` parameter approach still allowed skeleton flashing on realtime refetches
  2. Teacher path: subjects query and student counts query were sequential, blocking render
  3. `subject_code` column check ran on every mount, making unnecessary API call
- Changes made to /home/z/my-project/src/components/shared/subjects-section.tsx:
  1. Added `useRef` to imports (line 3)
  2. Added `isInitialMount` ref to track first load vs subsequent refreshes (line 175)
  3. Replaced `fetchSubjects(showLoading = false)` parameter with `isInitialMount.current` ref pattern:
     - `setLoading(true)` only runs when `isInitialMount.current` is true
     - `setLoading(false)` and `isInitialMount.current = false` only run in finally block on first load
     - Subsequent fetches (realtime, manual) no longer trigger loading skeleton
  4. Optimized teacher path (lines 212-238):
     - Subjects are now rendered immediately with `student_count: 0` after the subjects query completes
     - Student count query runs asynchronously in the background using `.then()` instead of `await`
     - When counts arrive, `setSubjects` updates with `prev => prev.map(...)` to avoid race conditions
     - This means subjects appear instantly; counts populate a moment later
  5. Removed `showLoading` parameter from fetchSubjects entirely
  6. Updated initial fetch call from `fetchSubjects(true)` to `fetchSubjects()`
  7. Cached `subject_code` column check in localStorage (lines 349-384):
     - First checks `localStorage.getItem('subject_code_missing')` before making API call
     - On API check, saves result to localStorage with `localStorage.setItem('subject_code_missing', 'true'|'false')`
     - Subsequent mounts read from cache, avoiding the API call entirely
  8. Updated "verify script ran" button (line 1264) to also update localStorage cache when re-checking column

Stage Summary:
- Loading skeleton now only appears on the very first mount (isInitialMount ref pattern)
- Realtime subscription refetches no longer cause skeleton flashing
- Teacher subjects render immediately; student counts load in background
- subject_code column check cached in localStorage, eliminating redundant API call on every mount
- All existing functionality preserved (error handling, dialogs, handlers, etc.)
- Lint passes with 0 errors (2 pre-existing warnings unrelated to this file)

---
Task ID: 2-7
Agent: Main
Task: Fix notifications delay, notification click navigation, add note viewers button, live realtime updates, fix file upload, add student performance column

Work Log:
- Fixed notifications-panel.tsx: Added isInitialMount ref pattern to prevent skeleton flashing on re-fetches, removed unnecessary API endpoint fallback (now uses direct Supabase query only), reduced polling to 15s
- Fixed notification-bell.tsx: Added isInitialMount ref pattern, removed showLoading parameter, fixed handleNotificationClick to properly close popover and navigate with setTimeout for state updates after popover closes, ensured setOpen(false) is called in all code paths including when no reference_id
- Added note viewers feature to subject-detail.tsx:
  - Added noteViewersOpen and noteViewers state variables
  - Added fetchNoteViewers function that queries note_views + users tables
  - Added handleToggleNoteViewers function
  - Changed static "شاهد هذا X طالب" text to clickable button showing "X مشاهد"
  - Added note viewers list section in expanded note content showing viewer name + date/time
- Added student performance column to subject-detail.tsx:
  - Added studentPerfOpen and studentPerfData state variables
  - Added fetchStudentPerformance function querying lecture_attendance, lectures, and scores
  - Added handleViewStudentPerf function
  - Added "الأداء" column header with "عرض" button per student
  - Added expandable row showing 4 stat cards: attendance count, quizzes completed, avg score %, attendance percentage
  - Made email and date columns responsive (hidden on small screens)
  - Added BarChart3 import
- Added realtime subscription for note_views table in subject-detail.tsx
  - Added noteViewsChannel with postgres_changes subscription
  - Added cleanup in return function
  - Added fetchNoteViews to dependency array
- Fixed file upload: Added bucket public check and auto-update to ensure storage bucket is public in /api/subjects/[id]/files/route.ts

Stage Summary:
- Notifications load faster with isInitialMount ref pattern (no skeleton on re-fetches)
- Notification click in bell properly navigates to source (subject detail with correct tab)
- Teachers can click "X مشاهد" button on notes to see who viewed each note with timestamps
- Students table now has "الأداء" column with expandable performance stats
- Note view counts update in realtime
- File upload bucket is ensured to be public
- All changes compile with 0 lint errors

---
Task ID: 1
Agent: Bug Fix Agent
Task: Fix 7 critical bugs in Examy educational platform

Work Log:
- Bug 1: Fixed sign out redirect in page.tsx - When user becomes null, always redirect to auth page. Changed useEffect so that `else` branch (no user) always calls `setCurrentPage('auth')`, and the `if (user)` branch only redirects from auth/role-selection pages (not when already on a dashboard).
- Bug 2: Fixed deleted users recreated on login in auth-store.ts - In BOTH the `initialize` function and the `onAuthStateChange` SIGNED_IN handler, replaced the auto-create profile blocks with sign-out-and-return logic. When profile doesn't exist (deleted user), the code now signs out and sets user to null instead of recreating the profile.
- Bug 3: Added forgot password link in login-form.tsx - Added `supabase` import, `handleForgotPassword` async handler that sends password reset email, and a "نسيت كلمة المرور؟" button between the password field and submit button.
- Bug 4: Created `src/app/api/admin/delete-user/route.ts` - New API route that uses supabaseServer with service role key to delete auth users via `supabaseServer.auth.admin.deleteUser()`.
- Bug 5: Created `src/app/api/admin/send-announcement/route.ts` - New API route that uses supabaseServer with service role key to insert notification records into the notifications table.
- Bug 6: Updated `handleDeleteUser` in admin-dashboard.tsx - Added fetch call to `/api/admin/delete-user` before deleting the user row from the users table, ensuring the auth account is also deleted.
- Bug 7: Updated `handleSendAnnouncement` in admin-dashboard.tsx - Replaced direct Supabase client insert with fetch call to `/api/admin/send-announcement` API route, which uses the service role key to bypass RLS.

Stage Summary:
- Sign out now properly redirects to auth page regardless of current dashboard
- Deleted users are no longer auto-recreated on login
- Forgot password link sends reset email via Supabase
- Admin delete user also removes auth account (preventing re-creation)
- Admin announcements use server-side API with service role key
- Lint passes with 0 errors (2 pre-existing warnings unrelated to changes)

---
Task ID: 2
Agent: Feature Implementation Agent
Task: Implement note viewers modal, note edit, lecture delete, remove quick actions, fix text wrapping

Work Log:
- Task A: Note Views Modal
  - Replaced `noteViewersOpen` (string | null) and `noteViewers` (Record) with new states: `noteViewersOpen` (boolean), `viewingNoteId`, `noteViewerList` (array of user_id/user_name/user_email/viewed_at), `loadingViewers`
  - Replaced `fetchNoteViewers` and `handleToggleNoteViewers` with `fetchNoteViewersList` (uses Supabase join: `note_views.select('viewed_at, users(name, email)')`) and `handleOpenNoteViewers`
  - Added Note Viewers Dialog with avatar, name, email, and viewed_at timestamp per viewer
  - Shows "لم يشاهد أحد هذه الملاحظة بعد" when no viewers
  - Fixed note_views duplicate insert bug: Changed `supabase.from('note_views').insert(...)` to `supabase.from('note_views').upsert({ note_id, user_id }, { onConflict: 'note_id,user_id' })`
- Task B: Note Edit Functionality
  - Added states: `editingNoteId`, `editingNoteTitle`, `editingNoteContent`
  - Added `handleSaveEditNote` function that updates title, content, and updated_at in Supabase
  - Added pencil icon edit button next to each note (teacher only)
  - Added Edit Note Dialog with title input, content textarea, cancel and save buttons
  - Added `Pencil` icon import from lucide-react
- Task C: Lecture Delete Functionality
  - Added states: `deleteLectureId`, `deleteLectureDialogOpen`
  - Added `handleDeleteLecture` function that deletes attendance records first, then the lecture
  - Added trash icon delete button next to each lecture (teacher only), with e.stopPropagation()
  - Added Delete Lecture Confirmation Dialog with warning message and destructive action button
- Task D: Remove Quick Actions Section
  - Removed the entire "إجراءات سريعة" section from the overview tab (Card with 4 buttons: upload, note, quiz, lecture)
- Task E: Cards Text Wrapping
  - Changed note title from `truncate` to `break-words` for proper wrapping
  - Added `break-words` to note content in collapsed state (line-clamp-2)
  - Added `whitespace-pre-wrap break-words` to note expanded content
  - Added `break-words` to lecture description (line-clamp-1)
  - Added `break-words` to viewer name and email in Note Viewers Dialog

Stage Summary:
- Note viewers now shown in a proper Dialog instead of inline, with user name, email, and viewed timestamp
- Note view tracking fixed to use upsert (no more duplicate entries)
- Teachers can edit notes via pencil icon button + edit Dialog
- Teachers can delete lectures via trash icon button + confirmation Dialog
- Quick actions section removed from overview tab (simplified design)
- All card text properly wraps with break-words class
- Lint passes with 0 errors (2 pre-existing warnings unrelated to changes)

---
Task ID: 3
Agent: Main Agent
Task: Quiz logic fixes, teacher quiz controls, profile update with avatar and password validation

Work Log:
- A1: Fixed allow_retake typing in quiz-view.tsx - replaced `(quiz as any).allow_retake` with `quiz.allow_retake` (proper typing already existed in types.ts)
- A2: Added `results_visible?: boolean` field to Quiz type in types.ts
- A2: Added `resultsBlocked` state in quiz-view.tsx
- A2: Modified handleNext to check `quiz.results_visible === false` after saveScore - if true, shows blocked results view instead of score
- A2: Added new "blocked results" screen showing "تم إرسال إجاباتك. ستظهر النتيجة بعد قيام المعلم بإظهارها." with a checkmark icon and return button
- A3: Verified current logic already stores answers locally in state and only submits to DB on final submit. Changed "تم حفظ إجابتك" text to "تم تسجيل إجابتك" to clarify local-only storage
- B1: Created `/api/quizzes/update/route.ts` - PATCH endpoint using supabaseServer to update quiz fields including results_visible
- B1: Added `handleToggleResults` function in teacher-dashboard.tsx that calls the API and shows appropriate toast
- B1: Added "إظهار النتائج للطلاب" toggle switch next to each quiz card (below the retake toggle) in teacher dashboard
- B2: Made subject selection required in quiz creation form:
  - Changed label from "المقرر (اختياري)" to "المقرر *"
  - Changed default option from "بدون مقرر" to "اختر المقرر"
  - Added validation check `if (!quizSubjectId)` in handleCreateQuiz
  - Updated submit button disabled condition to include `!quizSubjectId`
- C1: Created `/api/profile/upload-avatar/route.ts` - POST endpoint with file validation (size < 2MB, type check), Supabase Storage upload, and user profile update
- C1: Implemented avatar upload in settings-page.tsx:
  - Added `useRef` import and `fileInputRef` for hidden file input
  - Added `uploadingAvatar` state and `handleAvatarUpload` function
  - Replaced placeholder toast with actual file upload flow
  - Avatar click triggers hidden file input, on file select calls API, refreshes profile on success
  - Shows spinner while uploading
- C2: Fixed password change validation in settings-page.tsx:
  - Added `supabase.auth.signInWithPassword` call before `updateUser` to verify current password
  - Shows specific error "كلمة المرور الحالية غير صحيحة" if current password is wrong
  - Added `profile.email` to useCallback dependencies

Stage Summary:
- Quiz allow_retake now uses proper typing (no more `as any` cast)
- Teachers can toggle results_visible per quiz - students see blocked message when results hidden
- Quiz creation requires subject selection (no more "بدون مقرر" option)
- Avatar upload implemented with file validation and Supabase Storage
- Password change now validates current password before updating
- Created 2 new API routes: /api/quizzes/update (PATCH) and /api/profile/upload-avatar (POST)
- Lint passes with 0 errors (2 pre-existing warnings unrelated to changes)

---
Task ID: 4
Agent: Feature Agent
Task: Student file upload, admin interface improvement, student performance in teacher dashboard

Work Log:

### Task A: Student File Upload System
- Updated `src/lib/types.ts`:
  - Added `visibility` field ('public' | 'private') and `uploader_name` to SubjectFile interface
  - Added 'files' to StudentSection type
  - Added 'disabled' to UserRole type
- Created `src/app/api/subjects/[id]/files/upload/route.ts`:
  - New upload route supporting both students and teachers
  - Students can upload PDF, Images, Video only (validated)
  - Accepts `visibility` field in form data (default: 'private' for students, 'public' for teachers)
  - Validates enrollment before allowing student upload
  - Gracefully handles missing `visibility` column (retry without it)
- Updated `src/app/api/subjects/[id]/files/route.ts`:
  - GET now filters files for students: shows public files + own private files
  - Added visibility to select query
- Updated `src/components/student/student-dashboard.tsx`:
  - Added state variables: studentFiles, enrolledSubjects, uploadingFile, uploadSubjectId, uploadVisibility, fileDragOver, studentFileInputRef
  - Added fetchStudentFiles function fetching all files across enrolled subjects
  - Added handleFileUpload, handleFileDrop, handleDeleteFile handlers
  - Added renderFiles section with: subject selector, visibility toggle (public/private), drag-and-drop upload zone
  - Files displayed grouped by type: Documents, Images, Videos, Other
  - Each file shows: name, visibility badge, subject name, file size, date, view/delete actions
- Updated `src/components/shared/app-sidebar.tsx`:
  - Added FolderOpen import
  - Added 'الملفات' nav item to studentNavItems

### Task B: Admin Interface Improvement
- Updated `src/components/admin/admin-dashboard.tsx`:
  - Added debounced search (300ms) with handleUserSearchChange function
  - Added pagination (20 users per page) with prev/next buttons
  - Replaced filteredUsers with paginatedUsers in table rendering
  - Removed redundant "مشرف" column from users table
  - Added responsive email display (shown below name on mobile)
  - Added 'disabled' to role filter dropdown and role labels/colors
  - Fixed handleDisableUser to set role to 'disabled' (not just is_admin: false)
  - Added enable/disable toggle: disabled users show green "تفعيل" button
  - Disabled users shown with reduced opacity in table
  - Enhanced grant admin confirmation dialog with detailed warning list (4 bullet points)
  - Updated disable confirmation dialog with clearer message

### Task C: Student Performance in Teacher Dashboard
- Updated `src/components/teacher/teacher-dashboard.tsx`:
  - Added fetchAttendanceData function querying lectures + lecture_attendance tables
  - Added getStudentPerformance function calculating: avgScore, attendanceRate, totalQuizzes
  - Replaced simple student cards with enhanced cards showing 3 metric boxes
  - Added "عرض الأداء" (View Performance) button per student
  - Added Performance Detail Dialog with 4 stat cards, visual performance bar, quiz scores list
  - All null cases handled with "لا توجد بيانات" instead of 0%

Stage Summary:
- Students can now upload files to enrolled subjects with public/private visibility
- Admin users table has debounced search, pagination, and proper disable/enable flow
- Teacher dashboard shows actual student performance metrics with detailed dialog
- Lint passes with 0 errors (2 pre-existing warnings)

---
Task ID: 5
Agent: Feature Agent
Task: Real-time notification badge count + Reports section with charts and export

Work Log:

### Task A: Real-time Notification Badge Count
- Updated `src/components/shared/notification-bell.tsx`:
  - Added `unreadCount` state variable (previously computed from `notifications.filter()` on every render)
  - Added `notificationsRef` ref to track notifications for comparison in realtime handlers without stale closure issues
  - Modified `fetchNotifications` to also update `unreadCount` and `notificationsRef` when data arrives
  - Replaced 15-second polling interval with realtime-only updates (removed `setInterval`)
  - INSERT handler: adds notification to local state, increments `unreadCount` if not read, shows toast
  - UPDATE handler: updates notification in local state, compares old vs new `is_read` to adjust `unreadCount` up or down
  - DELETE handler: removes notification from local state, decrements `unreadCount` if deleted notification was unread
  - Fixed `markAsRead`: now also decrements `unreadCount` and updates `notificationsRef` immediately
  - Fixed `markAllAsRead`: now sets `unreadCount` to 0 and updates `notificationsRef`
  - Fixed `deleteNotification`: now decrements `unreadCount` if deleted notification was unread
  - Fixed bug: `fetchNotifications(false)` calls replaced with `fetchNotifications()` (function takes no arguments)

### Task B: Reports Section with Charts and Export
- Updated `src/components/teacher/teacher-dashboard.tsx`:

#### B1: Visual Charts
  - Added CSS-based Score Distribution bar chart showing 5 ranges (0-20%, 20-40%, 40-60%, 60-80%, 80-100%) with animated colored bars
  - Added CSS-based Student Performance Comparison chart with horizontal bars per student (color-coded by performance level)
  - Both bar/pie Recharts now respect subject filter (use `filteredReportScores` and `filteredReportQuizzes`)

#### B2: Student Performance Table with Sort and Export
  - Added sortable student performance table with columns: name, avg score, attendance rate, quizzes completed
  - Column headers are clickable to sort ascending/descending with arrow indicators
  - Added `exportToCSV` function with proper escaping (commas, quotes, BOM for Arabic)
  - Added `handleExportPerformanceExcel` using XLSX package with 2 sheets (student performance + score distribution)
  - Added `handleExportPerformanceCSV` for CSV export
  - Export buttons available both in header and table header

#### B3: Subject-Specific Reports
  - Added subject filter dropdown (`reportSubjectFilter` state) with "all subjects" option + teacher's subjects
  - Added `filteredReportScores` and `filteredReportQuizzes` computed from filter
  - Score distribution and student performance data respect the subject filter
  - Quiz details table also respects the filter and shows subject name column
  - Export filenames include the subject name

Stage Summary:
- Notification badge updates instantly via realtime (no polling), unread count decrements immediately on mark-as-read
- Reports section now has score distribution chart, student performance comparison chart, sortable student table
- CSV and Excel export for student performance data with Arabic support
- Subject filter allows viewing reports for specific subjects
- Lint passes with 0 errors (2 pre-existing warnings)
