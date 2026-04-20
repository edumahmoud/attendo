import { NextResponse } from 'next/server';

/**
 * API route that provides database setup SQL and instructions.
 * 
 * Includes:
 * 1. Base schema critical fixes (GRANT permissions, RLS, auth trigger)
 * 2. Schema V2 SQL (subjects, lectures, chat, notifications)
 * 
 * IMPORTANT: These SQL statements must be run in the Supabase SQL Editor
 * (Dashboard > SQL Editor) since the service role key may not be configured.
 * 
 * ALSO REQUIRED: Enable email signups in Supabase Dashboard:
 * Authentication > Providers > Email > Enable Email Signup
 */

const CRITICAL_FIXES_SQL = `
-- =====================================================
-- CRITICAL FIXES FOR EXAMY REGISTRATION
-- Run this SQL in the Supabase SQL Editor (Dashboard > SQL Editor)
-- =====================================================

-- Fix 0: Grant proper permissions on public schema
-- This fixes "permission denied for schema public" errors
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- Fix 1: Add INSERT policy on users table (CRITICAL for registration)
-- Without this, new users cannot create their profile after signup
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Fix 2: Create auth trigger to auto-create user profiles
-- This ensures profiles are created even when email confirmation is required
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'pending')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If insert fails (e.g., duplicate), just return NEW
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`.trim();

const SCHEMA_V2_SQL = `
-- =====================================================
-- Examy - Supabase Database Schema V2
-- المنصة التعليمية الذكية - Migration: Subjects, Lectures, Chat, Notifications
-- =====================================================
-- This file ADDS new tables and ALTERS existing ones.
-- It uses DROP IF EXISTS for safe re-runs.
-- Run this AFTER the base schema (schema.sql) has been applied.
-- =====================================================

-- Enable UUID extension (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- SAFE RE-RUN: Drop triggers, functions, policies, tables
-- Drop order respects dependencies (children first)
-- =====================================================

-- Drop triggers
DROP TRIGGER IF EXISTS trg_notify_new_quiz ON public.quizzes;
DROP TRIGGER IF EXISTS trg_notify_new_note ON public.subject_notes;
DROP TRIGGER IF EXISTS trg_notify_lecture_start ON public.lectures;
DROP TRIGGER IF EXISTS trg_subject_notes_updated_at ON public.subject_notes;
DROP TRIGGER IF EXISTS trg_subjects_updated_at ON public.subjects;

-- Drop functions
DROP FUNCTION IF EXISTS public.notify_new_quiz();
DROP FUNCTION IF EXISTS public.notify_new_note();
DROP FUNCTION IF EXISTS public.notify_lecture_start();

-- Drop policies on new tables
DROP POLICY IF EXISTS "Students can see own enrollments" ON public.subject_students;
DROP POLICY IF EXISTS "Teachers can see their subject enrollments" ON public.subject_students;
DROP POLICY IF EXISTS "Students can enroll" ON public.subject_students;
DROP POLICY IF EXISTS "Students can unenroll" ON public.subject_students;

DROP POLICY IF EXISTS "Teachers can CRUD own subject files" ON public.subject_files;
DROP POLICY IF EXISTS "Students can read enrolled subject files" ON public.subject_files;

DROP POLICY IF EXISTS "Teachers can CRUD own subject notes" ON public.subject_notes;
DROP POLICY IF EXISTS "Students can read enrolled subject notes" ON public.subject_notes;

DROP POLICY IF EXISTS "Students can create note views" ON public.note_views;
DROP POLICY IF EXISTS "Teachers can read views for their notes" ON public.note_views;

DROP POLICY IF EXISTS "Teachers can CRUD own subject lectures" ON public.lectures;
DROP POLICY IF EXISTS "Students can read active enrolled lectures" ON public.lectures;

DROP POLICY IF EXISTS "Students can create own attendance" ON public.lecture_attendance;
DROP POLICY IF EXISTS "Teachers can read own lecture attendance" ON public.lecture_attendance;

DROP POLICY IF EXISTS "Users can read subject or private messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

DROP POLICY IF EXISTS "Anyone authenticated can read titles" ON public.user_titles;

-- Drop policies on subjects table
DROP POLICY IF EXISTS "Teachers can CRUD own subjects" ON public.subjects;
DROP POLICY IF EXISTS "Students can read enrolled subjects" ON public.subjects;

-- Drop views
DROP VIEW IF EXISTS public.subject_details CASCADE;
DROP VIEW IF EXISTS public.lecture_details CASCADE;

-- Drop tables (children first, respecting FK dependencies)
DROP TABLE IF EXISTS public.note_views CASCADE;
DROP TABLE IF EXISTS public.lecture_attendance CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.lectures CASCADE;
DROP TABLE IF EXISTS public.subject_notes CASCADE;
DROP TABLE IF EXISTS public.subject_files CASCADE;
DROP TABLE IF EXISTS public.subject_students CASCADE;
DROP TABLE IF EXISTS public.subjects CASCADE;
DROP TABLE IF EXISTS public.user_titles CASCADE;

-- =====================================================
-- CREATE NEW TABLES (order matters for FK references)
-- =====================================================

-- 6. USER_TITLES TABLE
CREATE TABLE public.user_titles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO public.user_titles (title) VALUES
  ('د.'), ('أ.'), ('أستاذ'), ('م.'), ('م.أ'), ('بدون لقب')
ON CONFLICT (title) DO NOTHING;

-- 7. SUBJECTS TABLE
CREATE TABLE public.subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subjects_teacher ON public.subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_subjects_active ON public.subjects(is_active) WHERE is_active = true;

-- ALTER EXISTING TABLES
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS title_id UUID REFERENCES public.user_titles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fcm_token TEXT;

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;

ALTER TABLE public.summaries
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;

-- 8. SUBJECT_STUDENTS TABLE
CREATE TABLE public.subject_students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(subject_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_students_subject ON public.subject_students(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_students_student ON public.subject_students(student_id);

-- 9. SUBJECT_FILES TABLE
CREATE TABLE public.subject_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subject_files_subject ON public.subject_files(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_files_uploaded_by ON public.subject_files(uploaded_by);

-- 10. SUBJECT_NOTES TABLE
CREATE TABLE public.subject_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subject_notes_subject ON public.subject_notes(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_notes_teacher ON public.subject_notes(teacher_id);

-- 11. NOTE_VIEWS TABLE
CREATE TABLE public.note_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id UUID NOT NULL REFERENCES public.subject_notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(note_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_note_views_note ON public.note_views(note_id);
CREATE INDEX IF NOT EXISTS idx_note_views_user ON public.note_views(user_id);

-- 12. LECTURES TABLE
CREATE TABLE public.lectures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  qr_code TEXT UNIQUE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT false,
  max_distance_meters INTEGER NOT NULL DEFAULT 20,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lectures_subject ON public.lectures(subject_id);
CREATE INDEX IF NOT EXISTS idx_lectures_teacher ON public.lectures(teacher_id);
CREATE INDEX IF NOT EXISTS idx_lectures_active ON public.lectures(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lectures_qr_code ON public.lectures(qr_code) WHERE qr_code IS NOT NULL;

-- 13. LECTURE_ATTENDANCE TABLE
CREATE TABLE public.lecture_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lecture_id UUID NOT NULL REFERENCES public.lectures(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_latitude DOUBLE PRECISION,
  student_longitude DOUBLE PRECISION,
  distance_meters DOUBLE PRECISION,
  is_within_range BOOLEAN,
  attended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lecture_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_lecture_attendance_lecture ON public.lecture_attendance(lecture_id);
CREATE INDEX IF NOT EXISTS idx_lecture_attendance_student ON public.lecture_attendance(student_id);

-- 14. MESSAGES TABLE
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_subject ON public.messages(subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON public.messages(receiver_id) WHERE receiver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

-- 15. NOTIFICATIONS TABLE
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('quiz', 'note', 'message', 'lecture', 'system')),
  reference_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- INDEXES FOR ADDED COLUMNS
CREATE INDEX IF NOT EXISTS idx_quizzes_subject ON public.quizzes(subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_summaries_subject ON public.summaries(subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_title_id ON public.users(title_id) WHERE title_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users(is_admin) WHERE is_admin = true;
CREATE INDEX IF NOT EXISTS idx_users_fcm_token ON public.users(fcm_token) WHERE fcm_token IS NOT NULL;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) - NEW TABLES
-- =====================================================
ALTER TABLE public.user_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecture_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- USER_TITLES POLICIES
CREATE POLICY "Anyone authenticated can read titles" ON public.user_titles
  FOR SELECT USING (auth.role() = 'authenticated');

-- SUBJECTS POLICIES
CREATE POLICY "Teachers can CRUD own subjects" ON public.subjects
  FOR ALL USING (teacher_id = auth.uid());

CREATE POLICY "Students can read enrolled subjects" ON public.subjects
  FOR SELECT USING (
    id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
  );

-- SUBJECT_STUDENTS POLICIES
CREATE POLICY "Students can see own enrollments" ON public.subject_students
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Teachers can see their subject enrollments" ON public.subject_students
  FOR SELECT USING (
    subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
  );

CREATE POLICY "Students can enroll" ON public.subject_students
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can unenroll" ON public.subject_students
  FOR DELETE USING (student_id = auth.uid());

-- SUBJECT_FILES POLICIES
CREATE POLICY "Teachers can CRUD own subject files" ON public.subject_files
  FOR ALL USING (
    subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
  );

CREATE POLICY "Students can read enrolled subject files" ON public.subject_files
  FOR SELECT USING (
    subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
  );

-- SUBJECT_NOTES POLICIES
CREATE POLICY "Teachers can CRUD own subject notes" ON public.subject_notes
  FOR ALL USING (
    subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
  );

CREATE POLICY "Students can read enrolled subject notes" ON public.subject_notes
  FOR SELECT USING (
    subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
  );

-- NOTE_VIEWS POLICIES
CREATE POLICY "Students can create note views" ON public.note_views
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Teachers can read views for their notes" ON public.note_views
  FOR SELECT USING (
    note_id IN (
      SELECT sn.id FROM public.subject_notes sn
      INNER JOIN public.subjects s ON sn.subject_id = s.id
      WHERE s.teacher_id = auth.uid()
    )
  );

-- LECTURES POLICIES
CREATE POLICY "Teachers can CRUD own subject lectures" ON public.lectures
  FOR ALL USING (
    subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
  );

CREATE POLICY "Students can read active enrolled lectures" ON public.lectures
  FOR SELECT USING (
    is_active = true
    AND subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
  );

-- LECTURE_ATTENDANCE POLICIES
CREATE POLICY "Students can create own attendance" ON public.lecture_attendance
  FOR INSERT WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers can read own lecture attendance" ON public.lecture_attendance
  FOR SELECT USING (
    lecture_id IN (
      SELECT l.id FROM public.lectures l
      INNER JOIN public.subjects s ON l.subject_id = s.id
      WHERE s.teacher_id = auth.uid()
    )
  );

-- MESSAGES POLICIES
CREATE POLICY "Users can read subject or private messages" ON public.messages
  FOR SELECT USING (
    -- General chat: anyone can read (subject_id IS NULL AND receiver_id IS NULL)
    (subject_id IS NULL AND receiver_id IS NULL)
    OR
    -- Subject group chat: enrolled students can read
    (subject_id IS NOT NULL AND subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid()))
    OR
    -- Subject group chat: teacher can read
    (subject_id IS NOT NULL AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid()))
    OR
    -- Private messages: sender or receiver can read
    (subject_id IS NULL AND receiver_id IS NOT NULL AND (sender_id = auth.uid() OR receiver_id = auth.uid()))
  );

CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can delete own messages" ON public.messages
  FOR DELETE USING (
    -- Can delete own sent messages
    sender_id = auth.uid()
    OR
    -- Teacher can delete messages in their subject's group chat
    (subject_id IS NOT NULL AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid()))
    OR
    -- Can delete private messages where user is sender or receiver
    (subject_id IS NULL AND receiver_id IS NOT NULL AND (sender_id = auth.uid() OR receiver_id = auth.uid()))
  );

-- NOTIFICATIONS POLICIES
CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION public.notify_new_quiz()
RETURNS TRIGGER AS $$
DECLARE
  v_subject_name TEXT;
  v_student RECORD;
BEGIN
  IF NEW.subject_id IS NULL THEN RETURN NEW; END IF;
  SELECT name INTO v_subject_name FROM public.subjects WHERE id = NEW.subject_id;
  IF v_subject_name IS NULL THEN RETURN NEW; END IF;
  FOR v_student IN SELECT student_id FROM public.subject_students WHERE subject_id = NEW.subject_id
  LOOP
    INSERT INTO public.notifications (user_id, title, content, type, reference_id)
    VALUES (v_student.student_id, 'اختبار جديد',
      'تم إضافة اختبار "' || COALESCE(NEW.title, 'بدون عنوان') || '" في مادة "' || v_subject_name || '"',
      'quiz', NEW.id);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_new_quiz
  AFTER INSERT ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_quiz();

CREATE OR REPLACE FUNCTION public.notify_new_note()
RETURNS TRIGGER AS $$
DECLARE
  v_subject_name TEXT;
  v_student RECORD;
BEGIN
  SELECT name INTO v_subject_name FROM public.subjects WHERE id = NEW.subject_id;
  IF v_subject_name IS NULL THEN RETURN NEW; END IF;
  FOR v_student IN SELECT student_id FROM public.subject_students WHERE subject_id = NEW.subject_id
  LOOP
    INSERT INTO public.notifications (user_id, title, content, type, reference_id)
    VALUES (v_student.student_id, 'ملاحظة جديدة',
      'تم إضافة ملاحظة "' || COALESCE(NEW.title, 'بدون عنوان') || '" في مادة "' || v_subject_name || '"',
      'note', NEW.id);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_new_note
  AFTER INSERT ON public.subject_notes
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_note();

CREATE OR REPLACE FUNCTION public.notify_lecture_start()
RETURNS TRIGGER AS $$
DECLARE
  v_subject_name TEXT;
  v_student RECORD;
BEGIN
  IF NEW.is_active = false THEN RETURN NEW; END IF;
  IF OLD IS NOT NULL AND OLD.is_active = true THEN RETURN NEW; END IF;
  SELECT name INTO v_subject_name FROM public.subjects WHERE id = NEW.subject_id;
  IF v_subject_name IS NULL THEN RETURN NEW; END IF;
  FOR v_student IN SELECT student_id FROM public.subject_students WHERE subject_id = NEW.subject_id
  LOOP
    INSERT INTO public.notifications (user_id, title, content, type, reference_id)
    VALUES (v_student.student_id, 'محاضرة بدأت',
      'بدأت محاضرة "' || COALESCE(NEW.title, 'بدون عنوان') || '" في مادة "' || v_subject_name || '"',
      'lecture', NEW.id);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_lecture_start
  AFTER UPDATE ON public.lectures
  FOR EACH ROW EXECUTE FUNCTION public.notify_lecture_start();

CREATE TRIGGER trg_subjects_updated_at
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_subject_notes_updated_at
  BEFORE UPDATE ON public.subject_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================
-- GRANT PERMISSIONS - NEW TABLES
-- =====================================================

GRANT SELECT, INSERT, UPDATE ON public.user_titles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_titles TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.subjects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.subject_students TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_students TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.subject_files TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_files TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.subject_notes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_notes TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.note_views TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_views TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.lectures TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lectures TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.lecture_attendance TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_attendance TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.notifications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

-- =====================================================
-- HELPFUL VIEWS
-- =====================================================

CREATE OR REPLACE VIEW public.subject_details AS
SELECT
  s.id AS subject_id,
  s.name AS subject_name,
  s.description,
  s.color,
  s.icon,
  s.is_active,
  s.created_at,
  u.id AS teacher_id,
  u.name AS teacher_name,
  u.email AS teacher_email,
  (SELECT COUNT(*) FROM public.subject_students ss WHERE ss.subject_id = s.id) AS student_count
FROM public.subjects s
JOIN public.users u ON s.teacher_id = u.id;

CREATE OR REPLACE VIEW public.lecture_details AS
SELECT
  l.id AS lecture_id,
  l.title,
  l.description,
  l.qr_code,
  l.latitude,
  l.longitude,
  l.is_active,
  l.max_distance_meters,
  l.started_at,
  l.ended_at,
  l.created_at,
  s.id AS subject_id,
  s.name AS subject_name,
  u.id AS teacher_id,
  u.name AS teacher_name,
  (SELECT COUNT(*) FROM public.lecture_attendance la WHERE la.lecture_id = l.id) AS attendance_count,
  (SELECT COUNT(*) FROM public.lecture_attendance la WHERE la.lecture_id = l.id AND la.is_within_range = true) AS in_range_count
FROM public.lectures l
JOIN public.subjects s ON l.subject_id = s.id
JOIN public.users u ON l.teacher_id = u.id;
`.trim();

const SUBJECT_CODE_MIGRATION_SQL = `
-- =====================================================
-- Add subject_code column to subjects table
-- Students can enroll using this code
-- =====================================================

-- Add the column (nullable first so existing rows don't break)
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS subject_code TEXT UNIQUE;

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_subjects_code ON public.subjects(subject_code) WHERE subject_code IS NOT NULL;

-- Drop old function if exists (in case of partial migration)
DROP FUNCTION IF EXISTS public.generate_subject_code();

-- Function to generate a random 6-char alphanumeric code
-- Uses PERFORM + FOUND instead of SELECT INTO to avoid SQL editor parsing issues
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

    -- Check uniqueness using PERFORM + FOUND
    PERFORM 1 FROM public.subjects WHERE subject_code = result;
    IF NOT FOUND THEN
      RETURN result;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Backfill existing subjects with codes using a DO block
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

-- Now make it NOT NULL (all existing rows have codes)
ALTER TABLE public.subjects
  ALTER COLUMN subject_code SET NOT NULL;

-- RLS: Allow anyone authenticated to read subject by code (for enrollment lookup)
DROP POLICY IF EXISTS "Students can look up subjects by code" ON public.subjects;
CREATE POLICY "Students can look up subjects by code" ON public.subjects
  FOR SELECT USING (true);

-- Grant
GRANT SELECT, INSERT, UPDATE ON public.subjects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
`.trim();

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isServiceKeyConfigured = !!serviceRoleKey && serviceRoleKey !== 'placeholder_needs_real_key';

  return NextResponse.json({
    status: 'setup_required',
    supabaseConfigured: !!supabaseUrl,
    serviceKeyConfigured: isServiceKeyConfigured,
    sql: {
      critical_fixes: CRITICAL_FIXES_SQL,
      schema_v2: SCHEMA_V2_SQL,
      subject_code_migration: SUBJECT_CODE_MIGRATION_SQL,
    },
    steps: [
      {
        step: 1,
        title: 'Enable Email Signups in Supabase',
        description: 'Go to Supabase Dashboard > Authentication > Providers > Email > Enable "Enable Email Signup"',
        critical: true,
      },
      {
        step: 2,
        title: 'Run Base Schema SQL',
        description: 'Go to Supabase Dashboard > SQL Editor and run the full schema from supabase/schema.sql',
        critical: true,
      },
      {
        step: 3,
        title: 'Run Critical Fixes SQL',
        description: 'In the same SQL Editor, run the SQL provided in sql.critical_fixes below',
        critical: true,
      },
      {
        step: 4,
        title: 'Run Schema V2 SQL',
        description: 'In the same SQL Editor, run the SQL provided in sql.schema_v2 below. This creates subjects, lectures, chat, and notifications tables with RLS policies.',
        critical: true,
      },
      {
        step: 5,
        title: 'Run Subject Code Migration',
        description: 'In the same SQL Editor, run the SQL provided in sql.subject_code_migration below. This adds subject_code column for student enrollment via code.',
        critical: true,
      },
      {
        step: 6,
        title: 'Create Storage Bucket (Optional)',
        description: 'Go to Supabase Dashboard > Storage and create a bucket named "subject-files" for file uploads. Set it to private.',
        critical: false,
      },
      {
        step: 7,
        title: 'Add Service Role Key (Optional)',
        description: 'Add your SUPABASE_SERVICE_ROLE_KEY to .env.local for server-side admin operations',
        critical: false,
      },
    ],
    instructions: isServiceKeyConfigured
      ? 'Service role key is configured. You can POST to this endpoint to apply fixes automatically, or run the SQL manually.'
      : 'Please follow the steps above to set up your Supabase database. The SQL to run is provided in the "sql" field.',
  });
}

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || serviceRoleKey === 'placeholder_needs_real_key') {
    return NextResponse.json(
      {
        success: false,
        error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.',
        sql: {
          critical_fixes: CRITICAL_FIXES_SQL,
          schema_v2: SCHEMA_V2_SQL,
          subject_code_migration: SUBJECT_CODE_MIGRATION_SQL,
        },
        instructions: 'Please run the SQL manually in the Supabase SQL Editor (Dashboard > SQL Editor). Also make sure to enable Email signups in Authentication > Providers > Email.',
      },
      { status: 400 }
    );
  }

  try {
    // Use the Supabase Management API to execute SQL
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          success: false,
          error: `Could not execute SQL automatically: ${errorText}.`,
          sql: {
            critical_fixes: CRITICAL_FIXES_SQL,
            schema_v2: SCHEMA_V2_SQL,
            subject_code_migration: SUBJECT_CODE_MIGRATION_SQL,
          },
          instructions: 'Please run the SQL manually in the Supabase SQL Editor (Dashboard > SQL Editor). Also make sure to enable Email signups in Authentication > Providers > Email.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Database fixes applied successfully!',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `Failed to apply database fixes: ${error instanceof Error ? error.message : 'Unknown error'}.`,
        sql: {
          critical_fixes: CRITICAL_FIXES_SQL,
          schema_v2: SCHEMA_V2_SQL,
          subject_code_migration: SUBJECT_CODE_MIGRATION_SQL,
        },
        instructions: 'Please run the SQL manually in the Supabase SQL Editor (Dashboard > SQL Editor). Also make sure to enable Email signups in Authentication > Providers > Email.',
      },
      { status: 500 }
    );
  }
}
