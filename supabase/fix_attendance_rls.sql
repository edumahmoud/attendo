-- =====================================================
-- Fix RLS Policies for lecture_attendance
-- Allows students to read their own attendance records
-- Run this in Supabase SQL Editor
-- =====================================================

-- Remove old restrictive policy (teachers-only read)
DROP POLICY IF EXISTS "Teachers can read own lecture attendance" ON public.lecture_attendance;

-- Policy 1: Students can create own attendance (already exists, keep it)
-- CREATE POLICY "Students can create own attendance" ON public.lecture_attendance
--   FOR INSERT WITH CHECK (student_id = auth.uid());

-- Policy 2: Authenticated users can read attendance for their subjects
-- Teachers can read attendance for their lectures
-- Students can read their own attendance records
CREATE POLICY "Users can read relevant attendance" ON public.lecture_attendance
  FOR SELECT USING (
    -- Student can see their own attendance
    student_id = auth.uid()
    OR
    -- Teacher can see attendance for lectures in their subjects
    lecture_id IN (
      SELECT l.id FROM public.lectures l
      INNER JOIN public.subjects s ON l.subject_id = s.id
      WHERE s.teacher_id = auth.uid()
    )
  );

-- Policy 3: Students can update their own attendance (for location corrections)
CREATE POLICY IF NOT EXISTS "Students can update own attendance" ON public.lecture_attendance
  FOR UPDATE USING (student_id = auth.uid());
