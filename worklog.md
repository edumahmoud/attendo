---
Task ID: 1
Agent: Main Agent
Task: Create consolidated SQL file for Supabase setup including all storage/upload fixes

Work Log:
- Read all existing SQL files (schema.sql, schema_v2.sql, fix_storage_complete.sql, fix_storage_policies.sql, add_gender_and_storage.sql, add_subject_code.sql, fix_notifications_rls.sql, fix_messages_rls.sql, fix_attendance_rls.sql, add_allow_retake.sql, add_lecture_notes.sql, fix_auth_trigger_pending_role.sql)
- Read all upload API routes (upload-avatar, subject files upload, subject files CRUD)
- Read supabase-server.ts, supabase-auth.ts, settings-page.tsx
- Read setup-db route with embedded SQL
- Created /home/z/my-project/supabase/COMPLETE_SETUP.sql - a single comprehensive 1023-line SQL file that includes everything

Stage Summary:
- Created COMPLETE_SETUP.sql that covers ALL database setup in one file
- Includes: tables, columns, RLS policies, storage buckets, storage policies, schema permissions (service_role GRANT), triggers, functions, views, realtime
- Key fix for uploads: GRANT USAGE ON SCHEMA public TO service_role (root cause of avatar upload failure)
- Key fix: Storage buckets (avatars, subject-files) with proper policies
- Key fix: Missing columns (gender, visibility, avatar_url, allow_retake, subject_code)
- The file is idempotent - safe to run multiple times
---
Task ID: 2
Agent: Main Agent
Task: Fix course/subject display issue after database changes + Implement file system overhaul

Work Log:
- Diagnosed admin dashboard RLS issue: all data fetching uses client-side Supabase (anon key) subject to RLS, but no admin-specific RLS policies exist
- Created /api/admin/dashboard/route.ts - server-side API using service role (bypasses RLS) for all admin data fetching
- Created /api/admin/action/route.ts - server-side API for admin write operations (grant/revoke admin, delete user/subject/quiz, view quiz results)
- Updated admin-dashboard.tsx: replaced 4 direct supabase fetch functions with single API call to /api/admin/dashboard
- Updated all admin write handlers to use /api/admin/action instead of direct supabase calls
- Fixed enrolled students not showing in subject view: updated fetchStudents in subject-detail.tsx to use /api/subjects/[id]/students API (service role) for teachers instead of direct client query blocked by RLS
- Added file type classification tabs in subject-detail.tsx: auto-generated tabs (PDF, صور, مستندات, جداول, فيديو, أخرى) based on available file types
- Added file source filter: separate teacher files (ملفات المقرر) from student files (ملفات الطلاب)
- Added file preview dialog: images displayed directly, PDFs in iframe, others show metadata
- Added public/private visibility toggle for teachers with badge display
- Added file sharing dialog: share files with users by email, sends notification
- Created /api/subjects/[id]/files/visibility/route.ts - PATCH endpoint for visibility toggle
- Created /api/subjects/[id]/files/share/route.ts - POST endpoint for file sharing with notification
- All API routes use supabaseServer (service role) to bypass RLS for critical operations

Stage Summary:
- Admin dashboard now works via server-side API with service role (bypasses RLS completely)
- Teacher can now see enrolled students in subject detail view
- Files section now has type-based tabs, source filter, preview, visibility toggle, and sharing
- All new features use existing shadcn/ui components and RTL Arabic labels
- 0 lint errors, dev server running cleanly
---
Task ID: 3
Agent: Main Agent
Task: Implement file management, personal files, and assignments features

Work Log:
- Created SQL migration (supabase/V3_FILES_ASSIGNMENTS.sql) with 5 new tables: user_files, file_shares, assignments, assignment_submissions, plus new columns on subject_files (category, description)
- Updated TypeScript types with UserFile, FileShare, Assignment, AssignmentSubmission interfaces
- Updated SubjectSection type to include 'assignments'
- Updated Notification type to include 'assignment'
- Created 5 new API routes: user-files (CRUD), user-files/share, users/lookup, subjects/[id]/assignments (CRUD), subjects/[id]/assignments/submit
- Updated existing files API routes to accept category and description fields
- Created CourseFilesSection component with: classification tabs by category, upload with progress bar (XHR), preview dialog, share dialog with email lookup, visibility toggle
- Created PersonalFilesSection component with: private/public sub-tabs, upload with progress, file sharing with email lookup, shared files display, preview dialog
- Created AssignmentsSection component with: teacher create/edit/delete assignments with deadlines, student submit with progress bar, expired assignment auto-hide, submissions view
- Integrated all new components into subject-detail.tsx: added assignments tab, replaced old files tab with CourseFilesSection + PersonalFilesSection

Stage Summary:
- All features compile successfully (0 lint errors)
- User needs to run V3_FILES_ASSIGNMENTS.sql in Supabase SQL Editor
- Key new features: file classification tabs, personal files (private/public), file sharing with email lookup, assignments with deadlines, upload progress bars
