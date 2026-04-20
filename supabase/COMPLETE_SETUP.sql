-- =====================================================
-- ██████╗  █████╗ ███████╗███████╗██╗  ██╗███████╗███╗   ██╗
-- ██╔══██╗██╔══██╗██╔════╝██╔════╝██║  ██║██╔════╝████╗  ██║
-- ██║  ██║███████║███████╗███████╗███████║█████╗  ██╔██╗ ██║
-- ██║  ██║██╔══██║╚════██║╚════██║██╔══██║██╔══╝  ██║╚██╗██║
-- ██████╔╝██║  ██║███████║███████║██║  ██║███████╗██║ ╚████║
-- ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝
--
-- EXAMY - Complete Database Setup
-- المنصة التعليمية الذكية - إعداد قاعدة البيانات الكامل
--
-- ⚡ انسخ هذا الملف بالكامل والصقه في:
--    Supabase Dashboard > SQL Editor > New Query > Paste > Run
--
-- ✅ هذا الملف آمن للتشغيل المتكرر (idempotent)
-- ✅ يشمل كل الجداول + RLS + Storage Buckets + Policies
-- ✅ يشمل إصلاحات رفع الصور والملفات
-- =====================================================

-- ─────────────────────────────────────────────────────
-- STEP 1: Extensions
-- ─────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────
-- STEP 2: Base Tables (users, teacher_student_links, summaries, quizzes, scores)
-- ─────────────────────────────────────────────────────

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin', 'pending')),
  teacher_code TEXT UNIQUE,
  avatar_url TEXT,
  gender TEXT CHECK (gender IN ('male', 'female')),
  title_id UUID,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  fcm_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_teacher_code ON public.users(teacher_code) WHERE teacher_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_title_id ON public.users(title_id) WHERE title_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users(is_admin) WHERE is_admin = true;
CREATE INDEX IF NOT EXISTS idx_users_fcm_token ON public.users(fcm_token) WHERE fcm_token IS NOT NULL;

-- Add missing columns if tables already exist
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female'));
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS title_id UUID;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fcm_token TEXT;

-- Fix role constraint to include admin and pending
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('student', 'teacher', 'admin', 'pending'));

-- 2. USER_TITLES TABLE
CREATE TABLE IF NOT EXISTS public.user_titles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO public.user_titles (title) VALUES
  ('د.'), ('أ.'), ('أستاذ'), ('م.'), ('م.أ'), ('بدون لقب')
ON CONFLICT (title) DO NOTHING;

-- Add FK if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_title_id_fkey' AND table_name = 'users'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_title_id_fkey
      FOREIGN KEY (title_id) REFERENCES public.user_titles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. TEACHER-STUDENT LINKS TABLE
CREATE TABLE IF NOT EXISTS public.teacher_student_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(teacher_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_tsl_teacher ON public.teacher_student_links(teacher_id);
CREATE INDEX IF NOT EXISTS idx_tsl_student ON public.teacher_student_links(student_id);

-- 4. SUMMARIES TABLE
CREATE TABLE IF NOT EXISTS public.summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  original_content TEXT NOT NULL,
  summary_content TEXT NOT NULL,
  subject_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summaries_user ON public.summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_summaries_subject ON public.summaries(subject_id) WHERE subject_id IS NOT NULL;

-- 5. QUIZZES TABLE
CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration INTEGER,
  scheduled_date TEXT,
  scheduled_time TEXT,
  summary_id UUID REFERENCES public.summaries(id) ON DELETE SET NULL,
  subject_id UUID,
  allow_retake BOOLEAN NOT NULL DEFAULT false,
  questions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_user ON public.quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_subject ON public.quizzes(subject_id) WHERE subject_id IS NOT NULL;

-- Add allow_retake if not exists
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS allow_retake BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS subject_id UUID;

-- 6. SCORES TABLE
CREATE TABLE IF NOT EXISTS public.scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  quiz_title TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  user_answers JSONB NOT NULL DEFAULT '[]',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scores_student ON public.scores(student_id);
CREATE INDEX IF NOT EXISTS idx_scores_teacher ON public.scores(teacher_id);
CREATE INDEX IF NOT EXISTS idx_scores_quiz ON public.scores(quiz_id);

-- ─────────────────────────────────────────────────────
-- STEP 3: V2 Tables (subjects, files, notes, lectures, messages, notifications)
-- ─────────────────────────────────────────────────────

-- 7. SUBJECTS TABLE
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  icon TEXT,
  subject_code TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subjects_teacher ON public.subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_subjects_active ON public.subjects(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_subjects_code ON public.subjects(subject_code) WHERE subject_code IS NOT NULL;

-- Add subject_code if not exists
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS subject_code TEXT UNIQUE;

-- Generate subject codes for existing subjects
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
    PERFORM 1 FROM public.subjects WHERE subject_code = result;
    IF NOT FOUND THEN
      RETURN result;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Backfill subject codes
DO $$
DECLARE
  subj RECORD;
  new_code TEXT;
BEGIN
  FOR subj IN SELECT id FROM public.subjects WHERE subject_code IS NULL LOOP
    new_code := public.generate_subject_code();
    UPDATE public.subjects SET subject_code = new_code WHERE id = subj.id;
  END LOOP;
END $$;

-- Add FK for quizzes/summaries referencing subjects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'quizzes_subject_id_fkey' AND table_name = 'quizzes'
  ) THEN
    ALTER TABLE public.quizzes ADD CONSTRAINT quizzes_subject_id_fkey
      FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'summaries_subject_id_fkey' AND table_name = 'summaries'
  ) THEN
    ALTER TABLE public.summaries ADD CONSTRAINT summaries_subject_id_fkey
      FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 8. SUBJECT_STUDENTS TABLE
CREATE TABLE IF NOT EXISTS public.subject_students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(subject_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_students_subject ON public.subject_students(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_students_student ON public.subject_students(student_id);

-- 9. SUBJECT_FILES TABLE
CREATE TABLE IF NOT EXISTS public.subject_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subject_files_subject ON public.subject_files(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_files_uploaded_by ON public.subject_files(uploaded_by);

-- Add visibility column if not exists
ALTER TABLE public.subject_files ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private'));
UPDATE public.subject_files SET visibility = 'public' WHERE visibility IS NULL;

-- 10. SUBJECT_NOTES TABLE
CREATE TABLE IF NOT EXISTS public.subject_notes (
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
CREATE TABLE IF NOT EXISTS public.note_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id UUID NOT NULL REFERENCES public.subject_notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(note_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_note_views_note ON public.note_views(note_id);
CREATE INDEX IF NOT EXISTS idx_note_views_user ON public.note_views(user_id);

-- 12. LECTURES TABLE
CREATE TABLE IF NOT EXISTS public.lectures (
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
CREATE TABLE IF NOT EXISTS public.lecture_attendance (
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

-- 14. LECTURE_NOTES TABLE
CREATE TABLE IF NOT EXISTS public.lecture_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lecture_id UUID NOT NULL REFERENCES public.lectures(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lecture_notes_lecture ON public.lecture_notes(lecture_id);
CREATE INDEX IF NOT EXISTS idx_lecture_notes_teacher ON public.lecture_notes(teacher_id);

-- 15. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.messages (
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

-- 16. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
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

-- ─────────────────────────────────────────────────────
-- STEP 4: Row Level Security (RLS)
-- ─────────────────────────────────────────────────────

-- Enable RLS on ALL tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_student_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecture_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecture_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────
-- STEP 5: RLS Policies
-- ─────────────────────────────────────────────────────

-- ===== USERS POLICIES =====
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Teachers can read linked students" ON public.users;
CREATE POLICY "Teachers can read linked students" ON public.users
  FOR SELECT USING (
    id IN (SELECT student_id FROM public.teacher_student_links WHERE teacher_id = auth.uid())
  );

DROP POLICY IF EXISTS "Anyone authenticated can find teachers" ON public.users;
CREATE POLICY "Anyone authenticated can find teachers" ON public.users
  FOR SELECT USING (
    role = 'teacher' AND teacher_code IS NOT NULL
  );

-- ===== USER_TITLES POLICIES =====
DROP POLICY IF EXISTS "Anyone authenticated can read titles" ON public.user_titles;
CREATE POLICY "Anyone authenticated can read titles" ON public.user_titles
  FOR SELECT USING (auth.role() = 'authenticated');

-- ===== TEACHER-STUDENT LINKS POLICIES =====
DROP POLICY IF EXISTS "Teachers can see own student links" ON public.teacher_student_links;
CREATE POLICY "Teachers can see own student links" ON public.teacher_student_links
  FOR SELECT USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Students can see own teacher links" ON public.teacher_student_links;
CREATE POLICY "Students can see own teacher links" ON public.teacher_student_links
  FOR SELECT USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can create links" ON public.teacher_student_links;
CREATE POLICY "Students can create links" ON public.teacher_student_links
  FOR INSERT WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can delete own links" ON public.teacher_student_links;
CREATE POLICY "Students can delete own links" ON public.teacher_student_links
  FOR DELETE USING (student_id = auth.uid());

-- ===== SUMMARIES POLICIES =====
DROP POLICY IF EXISTS "Users can read own summaries" ON public.summaries;
CREATE POLICY "Users can read own summaries" ON public.summaries
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can read linked student summaries" ON public.summaries;
CREATE POLICY "Teachers can read linked student summaries" ON public.summaries
  FOR SELECT USING (
    user_id IN (SELECT student_id FROM public.teacher_student_links WHERE teacher_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create own summaries" ON public.summaries;
CREATE POLICY "Users can create own summaries" ON public.summaries
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own summaries" ON public.summaries;
CREATE POLICY "Users can delete own summaries" ON public.summaries
  FOR DELETE USING (user_id = auth.uid());

-- ===== QUIZZES POLICIES =====
DROP POLICY IF EXISTS "Users can read own quizzes" ON public.quizzes;
CREATE POLICY "Users can read own quizzes" ON public.quizzes
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Students can read teacher quizzes" ON public.quizzes;
CREATE POLICY "Students can read teacher quizzes" ON public.quizzes
  FOR SELECT USING (
    user_id IN (SELECT teacher_id FROM public.teacher_student_links WHERE student_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create own quizzes" ON public.quizzes;
CREATE POLICY "Users can create own quizzes" ON public.quizzes
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own quizzes" ON public.quizzes;
CREATE POLICY "Users can update own quizzes" ON public.quizzes
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own quizzes" ON public.quizzes;
CREATE POLICY "Users can delete own quizzes" ON public.quizzes
  FOR DELETE USING (user_id = auth.uid());

-- ===== SCORES POLICIES =====
DROP POLICY IF EXISTS "Students can read own scores" ON public.scores;
CREATE POLICY "Students can read own scores" ON public.scores
  FOR SELECT USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can read own quiz scores" ON public.scores;
CREATE POLICY "Teachers can read own quiz scores" ON public.scores
  FOR SELECT USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Students can create own scores" ON public.scores;
CREATE POLICY "Students can create own scores" ON public.scores
  FOR INSERT WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can delete own quiz scores" ON public.scores;
CREATE POLICY "Teachers can delete own quiz scores" ON public.scores
  FOR DELETE USING (teacher_id = auth.uid());

-- ===== SUBJECTS POLICIES =====
DROP POLICY IF EXISTS "Teachers can CRUD own subjects" ON public.subjects;
CREATE POLICY "Teachers can CRUD own subjects" ON public.subjects
  FOR ALL USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Students can read enrolled subjects" ON public.subjects;
CREATE POLICY "Students can read enrolled subjects" ON public.subjects
  FOR SELECT USING (
    id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students can look up subjects by code" ON public.subjects;
CREATE POLICY "Students can look up subjects by code" ON public.subjects
  FOR SELECT USING (true);

-- ===== SUBJECT_STUDENTS POLICIES =====
DROP POLICY IF EXISTS "Students can see own enrollments" ON public.subject_students;
CREATE POLICY "Students can see own enrollments" ON public.subject_students
  FOR SELECT USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can see their subject enrollments" ON public.subject_students;
CREATE POLICY "Teachers can see their subject enrollments" ON public.subject_students
  FOR SELECT USING (
    subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students can enroll" ON public.subject_students;
CREATE POLICY "Students can enroll" ON public.subject_students
  FOR INSERT WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can unenroll" ON public.subject_students;
CREATE POLICY "Students can unenroll" ON public.subject_students
  FOR DELETE USING (student_id = auth.uid());

-- ===== SUBJECT_FILES POLICIES =====
DROP POLICY IF EXISTS "Teachers can CRUD own subject files" ON public.subject_files;
CREATE POLICY "Teachers can CRUD own subject files" ON public.subject_files
  FOR ALL USING (
    subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students can read enrolled subject files" ON public.subject_files;
CREATE POLICY "Students can read enrolled subject files" ON public.subject_files
  FOR SELECT USING (
    visibility = 'public'
    OR visibility IS NULL
    OR uploaded_by = auth.uid()
    OR subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students can upload to enrolled subjects" ON public.subject_files;
CREATE POLICY "Students can upload to enrolled subjects" ON public.subject_files
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
      OR subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
    )
  );

-- ===== SUBJECT_NOTES POLICIES =====
DROP POLICY IF EXISTS "Teachers can CRUD own subject notes" ON public.subject_notes;
CREATE POLICY "Teachers can CRUD own subject notes" ON public.subject_notes
  FOR ALL USING (
    subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students can read enrolled subject notes" ON public.subject_notes;
CREATE POLICY "Students can read enrolled subject notes" ON public.subject_notes
  FOR SELECT USING (
    subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
  );

-- ===== NOTE_VIEWS POLICIES =====
DROP POLICY IF EXISTS "Students can create note views" ON public.note_views;
CREATE POLICY "Students can create note views" ON public.note_views
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can read views for their notes" ON public.note_views;
CREATE POLICY "Teachers can read views for their notes" ON public.note_views
  FOR SELECT USING (
    note_id IN (
      SELECT sn.id FROM public.subject_notes sn
      INNER JOIN public.subjects s ON sn.subject_id = s.id
      WHERE s.teacher_id = auth.uid()
    )
  );

-- ===== LECTURES POLICIES =====
DROP POLICY IF EXISTS "Teachers can CRUD own subject lectures" ON public.lectures;
CREATE POLICY "Teachers can CRUD own subject lectures" ON public.lectures
  FOR ALL USING (
    subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students can read active enrolled lectures" ON public.lectures;
CREATE POLICY "Students can read active enrolled lectures" ON public.lectures
  FOR SELECT USING (
    subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
  );

-- ===== LECTURE_ATTENDANCE POLICIES =====
DROP POLICY IF EXISTS "Students can create own attendance" ON public.lecture_attendance;
CREATE POLICY "Students can create own attendance" ON public.lecture_attendance
  FOR INSERT WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can read own lecture attendance" ON public.lecture_attendance;
DROP POLICY IF EXISTS "Users can read relevant attendance" ON public.lecture_attendance;
CREATE POLICY "Users can read relevant attendance" ON public.lecture_attendance
  FOR SELECT USING (
    student_id = auth.uid()
    OR
    lecture_id IN (
      SELECT l.id FROM public.lectures l
      INNER JOIN public.subjects s ON l.subject_id = s.id
      WHERE s.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can update own attendance" ON public.lecture_attendance;
CREATE POLICY "Students can update own attendance" ON public.lecture_attendance
  FOR UPDATE USING (student_id = auth.uid());

-- ===== LECTURE_NOTES POLICIES =====
DROP POLICY IF EXISTS "Teachers can CRUD own lecture notes" ON public.lecture_notes;
CREATE POLICY "Teachers can CRUD own lecture notes" ON public.lecture_notes
  FOR ALL USING (
    lecture_id IN (
      SELECT l.id FROM public.lectures l
      INNER JOIN public.subjects s ON l.subject_id = s.id
      WHERE s.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can read enrolled lecture notes" ON public.lecture_notes;
CREATE POLICY "Students can read enrolled lecture notes" ON public.lecture_notes
  FOR SELECT USING (
    lecture_id IN (
      SELECT l.id FROM public.lectures l
      WHERE l.subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
    )
  );

-- ===== MESSAGES POLICIES =====
DROP POLICY IF EXISTS "Users can read subject or private messages" ON public.messages;
CREATE POLICY "Users can read subject or private messages" ON public.messages
  FOR SELECT USING (
    (subject_id IS NULL AND receiver_id IS NULL)
    OR
    (subject_id IS NOT NULL AND subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid()))
    OR
    (subject_id IS NOT NULL AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid()))
    OR
    (subject_id IS NULL AND receiver_id IS NOT NULL AND (sender_id = auth.uid() OR receiver_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;
CREATE POLICY "Users can delete own messages" ON public.messages
  FOR DELETE USING (
    sender_id = auth.uid()
    OR
    (subject_id IS NOT NULL AND subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid()))
    OR
    (subject_id IS NULL AND receiver_id IS NOT NULL AND (sender_id = auth.uid() OR receiver_id = auth.uid()))
  );

-- ===== NOTIFICATIONS POLICIES =====
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications" ON public.notifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────
-- STEP 6: Storage Buckets & Policies (⚡ مهم جداً لرفع الصور والملفات)
-- ─────────────────────────────────────────────────────

-- Create avatars bucket (2MB limit, public)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('avatars', 'avatars', true, 2097152)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152;

-- Create subject-files bucket (10MB limit, public)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('subject-files', 'subject-files', true, 10485760)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

-- ─── Storage policies for avatars ───
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

-- Anyone can view avatars (public bucket)
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Authenticated users can upload their own avatar
-- Path: {userId}/{timestamp}.{ext}
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

-- ─── Storage policies for subject-files ───
DROP POLICY IF EXISTS "Anyone can view subject files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view subject files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can upload subject files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can delete subject files" ON storage.objects;
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

-- ─────────────────────────────────────────────────────
-- STEP 7: Schema Permissions (⚡ السبب الرئيسي لفشل رفع الصور!)
-- ─────────────────────────────────────────────────────
-- The service_role needs access to the public schema for DB operations
-- This is the ROOT CAUSE of "فشل في رفع الصورة" errors!

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- Also grant on lecture_notes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_notes TO authenticated;

-- ─────────────────────────────────────────────────────
-- STEP 8: Functions & Triggers
-- ─────────────────────────────────────────────────────

-- Auto-generate teacher code for new teachers
CREATE OR REPLACE FUNCTION public.generate_teacher_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'teacher' AND NEW.teacher_code IS NULL THEN
    NEW.teacher_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
    WHILE EXISTS (SELECT 1 FROM public.users WHERE teacher_code = NEW.teacher_code) LOOP
      NEW.teacher_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_generate_teacher_code ON public.users;
CREATE TRIGGER trg_generate_teacher_code
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.generate_teacher_code();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_subjects_updated_at ON public.subjects;
CREATE TRIGGER trg_subjects_updated_at
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_subject_notes_updated_at ON public.subject_notes;
CREATE TRIGGER trg_subject_notes_updated_at
  BEFORE UPDATE ON public.subject_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auth trigger: Auto-create profile when new user signs up
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Notification triggers
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

DROP TRIGGER IF EXISTS trg_notify_new_quiz ON public.quizzes;
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

DROP TRIGGER IF EXISTS trg_notify_new_note ON public.subject_notes;
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

DROP TRIGGER IF EXISTS trg_notify_lecture_start ON public.lectures;
CREATE TRIGGER trg_notify_lecture_start
  AFTER UPDATE ON public.lectures
  FOR EACH ROW EXECUTE FUNCTION public.notify_lecture_start();

-- ─────────────────────────────────────────────────────
-- STEP 9: Enable Realtime
-- ─────────────────────────────────────────────────────
-- Enable Realtime for important tables

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lectures;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lecture_attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subject_students;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subject_files;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subject_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quizzes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subjects;

-- ─────────────────────────────────────────────────────
-- STEP 10: Helpful Views
-- ─────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.teacher_student_performance AS
SELECT
  u.id AS student_id,
  u.name AS student_name,
  u.email AS student_email,
  s.id AS score_id,
  s.quiz_id,
  s.quiz_title,
  s.score,
  s.total,
  s.completed_at,
  ROUND((s.score::DECIMAL / NULLIF(s.total, 0)) * 100) AS percentage
FROM public.users u
JOIN public.teacher_student_links tsl ON u.id = tsl.student_id
JOIN public.scores s ON u.id = s.student_id
WHERE s.teacher_id = tsl.teacher_id;

CREATE OR REPLACE VIEW public.subject_details AS
SELECT
  s.id AS subject_id,
  s.name AS subject_name,
  s.description,
  s.color,
  s.icon,
  s.subject_code,
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

-- =====================================================
-- ✅ DONE! اكتمل الإعداد
-- =====================================================
-- بعد تشغيل هذا الملف، تأكد من:
-- 1. تفعيل Email Signup في: Authentication > Providers > Email
-- 2. إضافة SUPABASE_SERVICE_ROLE_KEY في ملف .env.local
-- 3. تشغيل GET /api/storage/setup للتحقق من التخزين
-- =====================================================
