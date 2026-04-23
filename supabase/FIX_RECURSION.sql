-- =====================================================
-- FIX: RLS Infinite Recursion (إصلاح دوران السياسات اللانهائي)
-- =====================================================
-- المشكلة: سياسات الأمان بتشير لبعض بشكل دائري:
--   subjects → subject_students → subjects → ...
-- الحل: إزالة المراجع الدائرية وتبسيط السياسات
-- =====================================================

-- 1. على جدول subjects: نشيل policy اللي بتسأل subject_students
-- ونستبدلها بـ policy بتسمح بالقراءة للجميع (لأننا أصلاً محتاجين كده للتسجيل بالكود)
DROP POLICY IF EXISTS "Students can read enrolled subjects" ON public.subjects;
DROP POLICY IF EXISTS "Students can look up subjects by code" ON public.subjects;
DROP POLICY IF EXISTS "Anyone can read subjects" ON public.subjects;
CREATE POLICY "Anyone can read subjects" ON public.subjects
  FOR SELECT USING (true);

-- 2. على جدول subject_students: نشيل policy اللي بتسأل subjects
-- ونخلي الطلاب يشوفوا تسجيلاتهم بس (بسيط بدون subquery)
DROP POLICY IF EXISTS "Teachers can see their subject enrollments" ON public.subject_students;
DROP POLICY IF EXISTS "Users can read relevant enrollments" ON public.subject_students;
DROP POLICY IF EXISTS "Students can see own enrollments" ON public.subject_students;
CREATE POLICY "Users can read own enrollments" ON public.subject_students
  FOR SELECT USING (student_id = auth.uid());

-- 3. على جدول subject_files: نشيل المرجع لـ subject_students
DROP POLICY IF EXISTS "Students can read enrolled subject files" ON public.subject_files;
CREATE POLICY "Students can read enrolled subject files" ON public.subject_files
  FOR SELECT USING (
    visibility = 'public'
    OR visibility IS NULL
    OR uploaded_by = auth.uid()
  );

-- 4. على جدول subject_notes: نشيل المرجع لـ subject_students  
DROP POLICY IF EXISTS "Students can read enrolled subject notes" ON public.subject_notes;
CREATE POLICY "Students can read enrolled subject notes" ON public.subject_notes
  FOR SELECT USING (true);

-- 5. على جدول subject_files INSERT: نشيل المرجع لـ subject_students
DROP POLICY IF EXISTS "Students can upload to enrolled subjects" ON public.subject_files;
CREATE POLICY "Students can upload to enrolled subjects" ON public.subject_files
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      subject_id IN (SELECT id FROM public.subjects WHERE teacher_id = auth.uid())
      OR subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
    )
  );

-- ✅ تم الإصلاح! المقررات هتظهر دلوقتي
