-- Add allow_retake column to quizzes table
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS allow_retake BOOLEAN NOT NULL DEFAULT false;

-- Add subject_code column to subjects table (if not exists)
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS subject_code TEXT;
