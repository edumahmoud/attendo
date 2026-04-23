-- =====================================================
-- V5: Fix file_shares table - add missing enrichment columns
-- إصلاح جدول مشاركة الملفات - إضافة الأعمدة المفقودة
--
-- ⚡ انسخ هذا الملف بالكامل والصقه في:
--    Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- =====================================================

-- ─────────────────────────────────────────────────────
-- STEP 1: Add enrichment columns to file_shares
-- ─────────────────────────────────────────────────────
ALTER TABLE public.file_shares ADD COLUMN IF NOT EXISTS shared_with_name TEXT;
ALTER TABLE public.file_shares ADD COLUMN IF NOT EXISTS shared_with_email TEXT;
ALTER TABLE public.file_shares ADD COLUMN IF NOT EXISTS shared_with_role TEXT;
ALTER TABLE public.file_shares ADD COLUMN IF NOT EXISTS shared_by_name TEXT;
ALTER TABLE public.file_shares ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.file_shares ADD COLUMN IF NOT EXISTS file_url TEXT;

-- ─────────────────────────────────────────────────────
-- STEP 2: Add visibility toggle support to user_files
-- (already exists but ensure index for fast filtering)
-- ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_files_visibility ON public.user_files(visibility);

-- ─────────────────────────────────────────────────────
-- STEP 3: Grant permissions
-- ─────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_shares TO authenticated;
GRANT ALL ON public.file_shares TO service_role;
