-- =====================================================
-- Fix Messages RLS Policies
-- 1. Allow all users to read general chat messages
-- 2. Allow users to delete messages
-- =====================================================

-- Drop old policies
DROP POLICY IF EXISTS "Users can read subject or private messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON public.messages;

-- 1. SELECT: Allow reading messages
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

-- 2. INSERT: Allow sending messages
CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- 3. DELETE: Allow deleting messages
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
