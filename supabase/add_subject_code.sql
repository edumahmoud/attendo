-- =====================================================
-- Add subject_code column to subjects table
-- Students can enroll using this code
-- =====================================================
-- IMPORTANT: Run the entire script at once in the Supabase SQL Editor
-- Or run each block separately (each block is clearly marked)
-- =====================================================

-- =====================================================
-- BLOCK 1: Add column if not exists
-- =====================================================
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS subject_code TEXT UNIQUE;

-- =====================================================
-- BLOCK 2: Create index for fast lookup
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_subjects_code ON public.subjects(subject_code) WHERE subject_code IS NOT NULL;

-- =====================================================
-- BLOCK 3: Drop old function if exists (in case of partial migration)
-- Then create the function to generate unique subject codes
-- Uses PERFORM + FOUND instead of SELECT INTO to avoid
-- the "relation exists_flag does not exist" error
-- =====================================================
DROP FUNCTION IF EXISTS public.generate_subject_code();

CREATE OR REPLACE FUNCTION public.generate_subject_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;

    -- Check uniqueness using PERFORM + FOUND (avoids SELECT INTO ambiguity)
    PERFORM 1 FROM public.subjects WHERE subject_code = result;

    IF NOT FOUND THEN
      RETURN result;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- BLOCK 4: Backfill existing subjects with codes
-- Uses a DO block to iterate and update one by one
-- =====================================================
DO $$
DECLARE
  subj RECORD;
  new_code TEXT;
BEGIN
  FOR subj IN SELECT id FROM public.subjects WHERE subject_code IS NULL LOOP
    new_code := public.generate_subject_code();
    UPDATE public.subjects SET subject_code = new_code WHERE id = subj.id;
  END LOOP;
END;
$$;

-- =====================================================
-- BLOCK 5: Make subject_code NOT NULL
-- (all existing rows should now have codes from backfill)
-- =====================================================
ALTER TABLE public.subjects
  ALTER COLUMN subject_code SET NOT NULL;

-- =====================================================
-- BLOCK 6: RLS - Allow authenticated users to look up
-- subjects by code (needed for enrollment)
-- =====================================================
DROP POLICY IF EXISTS "Students can look up subjects by code" ON public.subjects;
CREATE POLICY "Students can look up subjects by code" ON public.subjects
  FOR SELECT USING (true);

-- =====================================================
-- BLOCK 7: Grant permissions
-- =====================================================
GRANT SELECT, INSERT, UPDATE ON public.subjects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
