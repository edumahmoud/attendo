-- =====================================================
-- COMPLETE STORAGE SETUP FOR EXAMY
-- Run this SQL in the Supabase SQL Editor (Dashboard > SQL Editor)
-- This sets up both storage buckets, policies, and missing columns
-- =====================================================

-- ─── Step 1: Create avatars bucket ───
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('avatars', 'avatars', true, 2097152)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152;

-- ─── Step 2: Create subject-files bucket ───
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('subject-files', 'subject-files', true, 10485760)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

-- ─── Step 3: Add missing columns ───

-- Add avatar_url to users if missing
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add gender to users if missing
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female'));

-- Add visibility to subject_files if missing
ALTER TABLE public.subject_files ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private'));

-- ─── Step 4: Storage policies for avatars ───

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

-- Anyone can read avatars (public bucket)
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Authenticated users can upload their own avatar (path: {userId}/...)
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update their own avatar
CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own avatar
CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── Step 5: Storage policies for subject-files ───

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Teachers can upload subject files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can delete subject files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view subject files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view subject files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload subject files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete subject files" ON storage.objects;

-- Anyone (including anon) can view/download subject files (public bucket)
CREATE POLICY "Anyone can view subject files" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'subject-files');

-- Authenticated users can upload files to subject-files
-- Path: {subjectId}/{userId}/{filename} — verify user is the uploader
CREATE POLICY "Users can upload subject files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'subject-files'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

-- Users can delete files they uploaded
CREATE POLICY "Users can delete subject files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'subject-files'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

-- ─── Step 6: Update subject_files visibility for existing rows ───
UPDATE public.subject_files SET visibility = 'public' WHERE visibility IS NULL;

-- ─── Step 7: Add RLS policy for students to upload files ───
-- Students should be able to INSERT into subject_files if they're enrolled
-- This already exists in schema_v2 but let's ensure it's there
DROP POLICY IF EXISTS "Students can read enrolled subject files" ON public.subject_files;
CREATE POLICY "Students can read enrolled subject files" ON public.subject_files
  FOR SELECT USING (
    visibility = 'public'
    OR visibility IS NULL
    OR uploaded_by = auth.uid()
    OR subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
  );

-- Allow enrolled students to insert files
DROP POLICY IF EXISTS "Students can upload to enrolled subjects" ON public.subject_files;
CREATE POLICY "Students can upload to enrolled subjects" ON public.subject_files
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
      OR subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
    )
  );

-- ─── Done! ───
-- Verify by running GET /api/storage/setup in your app
