-- =====================================================
-- V4: Add subject_id to user_files for optional subject linking
-- إضافة ربط الملفات الشخصية بالمقررات بشكل اختياري
--
-- ⚡ انسخ هذا الملف بالكامل والصقه في:
--    Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- =====================================================

-- ─────────────────────────────────────────────────────
-- STEP 1: Add subject_id column to user_files (nullable = optional)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_files_subject ON public.user_files(subject_id) WHERE subject_id IS NOT NULL;

-- ─────────────────────────────────────────────────────
-- STEP 2: Update RLS to allow reading files linked to enrolled subjects
-- ─────────────────────────────────────────────────────
-- Students can read public user_files that are linked to subjects they're enrolled in
DROP POLICY IF EXISTS "Students can read public files from enrolled subjects" ON public.user_files;
CREATE POLICY "Students can read public files from enrolled subjects" ON public.user_files
  FOR SELECT USING (
    visibility = 'public'
    AND subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────
-- STEP 3: Grant permissions
-- ─────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_files TO authenticated;
GRANT ALL ON public.user_files TO service_role;
