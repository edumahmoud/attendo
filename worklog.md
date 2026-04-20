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
