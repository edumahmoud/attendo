-- =====================================================
-- Add lecture_notes table for per-lecture notes
-- Teacher can add multiple notes visible to students
-- =====================================================

-- Create the table
CREATE TABLE IF NOT EXISTS public.lecture_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lecture_id UUID NOT NULL REFERENCES public.lectures(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lecture_notes_lecture ON public.lecture_notes(lecture_id);
CREATE INDEX IF NOT EXISTS idx_lecture_notes_teacher ON public.lecture_notes(teacher_id);

-- Enable RLS
ALTER TABLE public.lecture_notes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Teachers can CRUD own lecture notes" ON public.lecture_notes;
DROP POLICY IF EXISTS "Students can read enrolled lecture notes" ON public.lecture_notes;

-- Teachers can CRUD notes for lectures in their subjects
CREATE POLICY "Teachers can CRUD own lecture notes" ON public.lecture_notes
  FOR ALL USING (
    lecture_id IN (
      SELECT l.id FROM public.lectures l
      INNER JOIN public.subjects s ON l.subject_id = s.id
      WHERE s.teacher_id = auth.uid()
    )
  );

-- Students can read notes for lectures in subjects they are enrolled in
CREATE POLICY "Students can read enrolled lecture notes" ON public.lecture_notes
  FOR SELECT USING (
    lecture_id IN (
      SELECT l.id FROM public.lectures l
      WHERE l.subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_notes TO authenticated;
