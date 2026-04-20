---
Task ID: 1
Agent: Main Agent
Task: Fix file/image uploads in Supabase environment

Work Log:
- Diagnosed upload failures using new /api/storage/setup diagnostic endpoint
- Discovered ROOT CAUSE: service_role key lacks `USAGE` permission on `public` schema (cannot read/write DB tables)
- Found that service_role CAN do storage operations (buckets, uploads, deletes) but NOT database queries
- Created both storage buckets (avatars, subject-files) via POST /api/storage/setup auto-setup
- Identified missing columns: `gender` (users table), `visibility` (subject_files table)
- Restructured ALL upload routes to use SERVICE ROLE for storage operations only and USER'S JWT for DB operations
- Updated avatar upload: now requires auth token, uses user JWT for profile update, service role for storage only
- Updated subject files route: uses authResult.supabase for all DB queries (GET, POST, DELETE)
- Updated student upload route: uses authResult.supabase for all DB queries
- Fixed visibility column check to use anon key instead of service role
- Added cleanup of old avatars before uploading new ones
- Added better error messages with actionable `detail` field
- Updated settings-page.tsx to send auth token with avatar upload request
- Created comprehensive STORAGE_AND_COLUMNS_FIX_SQL in setup-db route
- Updated setup-db route with new Step 7 for storage/column fix
- Created supabase/fix_storage_complete.sql with all needed SQL

Stage Summary:
- Both storage buckets created and working (avatars: public, 2MB; subject-files: public, 10MB)
- Upload code now works with split strategy: service role for storage, user JWT for DB
- Missing columns (gender, visibility) need to be added via SQL in Supabase Dashboard
- service_role permissions need to be fixed via GRANT SQL in Supabase Dashboard
- User needs to run the SQL from /api/setup-db (sql.storage_and_columns_fix) in Supabase SQL Editor
