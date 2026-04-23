-- =====================================================
-- Add visibility column to lecture_notes table
-- 'private' = teacher-only notes, 'public' = visible to students
-- =====================================================

-- Add visibility column with default 'public'
ALTER TABLE public.lecture_notes
ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
CHECK (visibility IN ('public', 'private'));

-- Update existing notes to be public by default
UPDATE public.lecture_notes SET visibility = 'public' WHERE visibility IS NULL;

-- Update RLS policies to respect visibility
-- Students can only read PUBLIC notes for lectures in subjects they are enrolled in
DROP POLICY IF EXISTS "Students can read enrolled lecture notes" ON public.lecture_notes;
CREATE POLICY "Students can read enrolled lecture notes" ON public.lecture_notes
  FOR SELECT USING (
    visibility = 'public'
    AND lecture_id IN (
      SELECT l.id FROM public.lectures l
      WHERE l.subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
    )
  );
