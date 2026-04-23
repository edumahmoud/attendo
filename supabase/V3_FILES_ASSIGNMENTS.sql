-- =====================================================
-- V3: File Management, Personal Files, Assignments
-- إدارة الملفات، الملفات الشخصية، المهام
--
-- ⚡ انسخ هذا الملف بالكامل والصقه في:
--    Supabase Dashboard > SQL Editor > New Query > Paste > Run
-- =====================================================

-- ─────────────────────────────────────────────────────
-- STEP 1: Add category column to subject_files for classification tabs
-- ─────────────────────────────────────────────────────
ALTER TABLE public.subject_files ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'عام';
ALTER TABLE public.subject_files ADD COLUMN IF NOT EXISTS description TEXT;

-- ─────────────────────────────────────────────────────
-- STEP 2: User Files table (personal files - separate from course files)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_files_user ON public.user_files(user_id);
CREATE INDEX IF NOT EXISTS idx_user_files_visibility ON public.user_files(visibility);

-- ─────────────────────────────────────────────────────
-- STEP 3: File Shares table (sharing files with specific users)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.file_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('subject_file', 'user_file')),
  shared_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shared_with UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(file_id, file_type, shared_with)
);

CREATE INDEX IF NOT EXISTS idx_file_shares_file ON public.file_shares(file_id);
CREATE INDEX IF NOT EXISTS idx_file_shares_shared_by ON public.file_shares(shared_by);
CREATE INDEX IF NOT EXISTS idx_file_shares_shared_with ON public.file_shares(shared_with);

-- ─────────────────────────────────────────────────────
-- STEP 4: Assignments table
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  deadline TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_subject ON public.assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON public.assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_active ON public.assignments(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_assignments_deadline ON public.assignments(deadline) WHERE deadline IS NOT NULL;

-- ─────────────────────────────────────────────────────
-- STEP 5: Assignment Submissions table
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name TEXT,
  file_url TEXT,
  file_type TEXT,
  file_size BIGINT,
  notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment ON public.assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student ON public.assignment_submissions(student_id);

-- ─────────────────────────────────────────────────────
-- STEP 6: Enable RLS on new tables
-- ─────────────────────────────────────────────────────
ALTER TABLE public.user_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────
-- STEP 7: RLS Policies for new tables
-- ─────────────────────────────────────────────────────

-- ===== USER_FILES POLICIES =====
DROP POLICY IF EXISTS "Users can read own files" ON public.user_files;
CREATE POLICY "Users can read own files" ON public.user_files
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read shared files" ON public.user_files;
CREATE POLICY "Users can read shared files" ON public.user_files
  FOR SELECT USING (
    id IN (SELECT file_id FROM public.file_shares WHERE file_type = 'user_file' AND shared_with = auth.uid())
  );

DROP POLICY IF EXISTS "Users can read public user files" ON public.user_files;
CREATE POLICY "Users can read public user files" ON public.user_files
  FOR SELECT USING (visibility = 'public');

DROP POLICY IF EXISTS "Users can create own files" ON public.user_files;
CREATE POLICY "Users can create own files" ON public.user_files
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own files" ON public.user_files;
CREATE POLICY "Users can update own files" ON public.user_files
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own files" ON public.user_files;
CREATE POLICY "Users can delete own files" ON public.user_files
  FOR DELETE USING (user_id = auth.uid());

-- ===== FILE_SHARES POLICIES =====
DROP POLICY IF EXISTS "Users can read shares involving them" ON public.file_shares;
CREATE POLICY "Users can read shares involving them" ON public.file_shares
  FOR SELECT USING (shared_by = auth.uid() OR shared_with = auth.uid());

DROP POLICY IF EXISTS "Users can create shares for own files" ON public.file_shares;
CREATE POLICY "Users can create shares for own files" ON public.file_shares
  FOR INSERT WITH CHECK (shared_by = auth.uid());

DROP POLICY IF EXISTS "Users can delete own shares" ON public.file_shares;
CREATE POLICY "Users can delete own shares" ON public.file_shares
  FOR DELETE USING (shared_by = auth.uid() OR shared_with = auth.uid());

-- ===== ASSIGNMENTS POLICIES =====
DROP POLICY IF EXISTS "Teachers can CRUD own subject assignments" ON public.assignments;
CREATE POLICY "Teachers can CRUD own subject assignments" ON public.assignments
  FOR ALL USING (
    subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students can read enrolled subject assignments" ON public.assignments;
CREATE POLICY "Students can read enrolled subject assignments" ON public.assignments
  FOR SELECT USING (
    subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
  );

-- ===== ASSIGNMENT_SUBMISSIONS POLICIES =====
DROP POLICY IF EXISTS "Students can create own submissions" ON public.assignment_submissions;
CREATE POLICY "Students can create own submissions" ON public.assignment_submissions
  FOR INSERT WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can update own submissions" ON public.assignment_submissions;
CREATE POLICY "Students can update own submissions" ON public.assignment_submissions
  FOR UPDATE USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can read own submissions" ON public.assignment_submissions;
CREATE POLICY "Students can read own submissions" ON public.assignment_submissions
  FOR SELECT USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can read submissions for their assignments" ON public.assignment_submissions;
CREATE POLICY "Teachers can read submissions for their assignments" ON public.assignment_submissions
  FOR SELECT USING (
    assignment_id IN (
      SELECT a.id FROM public.assignments a
      WHERE a.subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────
-- STEP 8: Create user-files storage bucket (for personal files)
-- ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('user-files', 'user-files', true, 10485760)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

-- Storage policies for user-files bucket
DROP POLICY IF EXISTS "Users can view user files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload user files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete user files" ON storage.objects;

CREATE POLICY "Users can view user files" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id = 'user-files');

CREATE POLICY "Users can upload user files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'user-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete user files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'user-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─────────────────────────────────────────────────────
-- STEP 9: Triggers for updated_at
-- ─────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_user_files_updated_at ON public.user_files;
CREATE TRIGGER trg_user_files_updated_at
  BEFORE UPDATE ON public.user_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_assignments_updated_at ON public.assignments;
CREATE TRIGGER trg_assignments_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────
-- STEP 10: Grant permissions on new tables
-- ─────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_files TO authenticated;
GRANT ALL ON public.user_files TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_shares TO authenticated;
GRANT ALL ON public.file_shares TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_submissions TO authenticated;
GRANT ALL ON public.assignment_submissions TO service_role;

-- Also grant on subject_files category column
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_files TO authenticated;
GRANT ALL ON public.subject_files TO service_role;

-- ─────────────────────────────────────────────────────
-- STEP 11: Notification trigger for new assignments
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_new_assignment()
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
    VALUES (v_student.student_id, 'مهمة جديدة',
      'تم إضافة مهمة "' || COALESCE(NEW.title, 'بدون عنوان') || '" في مادة "' || v_subject_name || '"',
      'system', NEW.id);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_new_assignment ON public.assignments;
CREATE TRIGGER trg_notify_new_assignment
  AFTER INSERT ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_assignment();

-- ─────────────────────────────────────────────────────
-- STEP 12: Update notification type constraint to include 'assignment'
-- ─────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('quiz', 'note', 'message', 'lecture', 'system', 'assignment'));
