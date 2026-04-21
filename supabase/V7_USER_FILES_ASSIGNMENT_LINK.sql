-- =====================================================
-- V7: Add assignment_id to user_files for linking submissions
-- ربط ملفات المستخدم بالتسليمات تلقائياً
--
-- ⚡ انسخ هذا الملف بالكامل والصقه في:
--    Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- =====================================================

-- ─────────────────────────────────────────────────────
-- STEP 1: Add assignment_id column to user_files (nullable = optional)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES public.assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_files_assignment ON public.user_files(assignment_id) WHERE assignment_id IS NOT NULL;

-- ─────────────────────────────────────────────────────
-- STEP 2: Grant permissions
-- ─────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_files TO authenticated;
GRANT ALL ON public.user_files TO service_role;
