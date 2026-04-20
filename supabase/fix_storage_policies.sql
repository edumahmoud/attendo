-- =====================================================
-- Fix Storage Policies for subject-files bucket
-- This must be run in Supabase SQL Editor
-- =====================================================

-- Step 1: Create the bucket if it doesn't exist
-- Go to Supabase Dashboard > Storage and create a bucket named "subject-files"
-- Set it to PUBLIC (so files can be accessed via public URL)
-- OR run this SQL (requires service role):

-- INSERT INTO storage.buckets (id, name, public, file_size_limit)
-- VALUES ('subject-files', 'subject-files', true, 10485760)
-- ON CONFLICT (id) DO NOTHING;

-- Step 2: Update bucket to be public (if already exists)
UPDATE storage.buckets SET public = true WHERE id = 'subject-files';

-- Step 3: Remove existing policies (if any) to avoid conflicts
DROP POLICY IF EXISTS "Teachers can upload subject files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can delete subject files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view subject files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view subject files" ON storage.objects;

-- Step 4: Create storage policies

-- Policy 1: Allow authenticated teachers to upload files
CREATE POLICY "Teachers can upload subject files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'subject-files'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

-- Policy 2: Allow teachers to delete their own subject files
CREATE POLICY "Teachers can delete subject files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'subject-files'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

-- Policy 3: Allow anyone (including anonymous) to view/download files
-- Since the bucket is public, this allows reading
CREATE POLICY "Anyone can view subject files" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'subject-files');

-- =====================================================
-- Alternative: If you want more restrictive upload policy
-- that verifies the user is a teacher of the subject:
-- =====================================================
-- This more restrictive version checks the subjects table
-- to ensure the uploader is the teacher of the subject:

-- DROP POLICY IF EXISTS "Teachers can upload subject files" ON storage.objects;
-- CREATE POLICY "Teachers can upload subject files" ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (
--     bucket_id = 'subject-files'
--     AND EXISTS (
--       SELECT 1 FROM public.subjects s
--       WHERE s.teacher_id = auth.uid()
--       AND s.id::text = (storage.foldername(name))[1]
--     )
--   );
