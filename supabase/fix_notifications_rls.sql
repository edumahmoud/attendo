-- =====================================================
-- Fix: Add DELETE policy for notifications & Enable Realtime
-- =====================================================
-- Run this SQL in the Supabase SQL Editor to fix:
-- 1. Users can't delete their own notifications (missing DELETE RLS policy)
-- 2. Realtime not enabled for notifications table
-- =====================================================

-- 1. Add DELETE policy for notifications
-- Users should be able to delete their own notifications
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;

CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE USING (user_id = auth.uid());

-- 2. Enable Realtime for the notifications table
-- This allows the Supabase Realtime server to broadcast changes
-- You must also enable this in the Supabase Dashboard:
-- Database > Replication > Enable notifications table

-- Using the Supabase SQL approach to enable Realtime publication:
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 3. Also enable Realtime for other important tables if not already done
-- These are needed for realtime attendance, lectures, etc.
ALTER PUBLICATION supabase_realtime ADD TABLE public.lectures;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lecture_attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subject_students;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subject_files;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subject_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quizzes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subjects;

-- 4. Add INSERT policy for notifications (for service role / API usage)
-- This allows the API route to insert notifications on behalf of users
-- Note: Trigger functions use SECURITY DEFINER, so they bypass RLS already
-- But direct inserts from the client may need this
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;

CREATE POLICY "Users can insert own notifications" ON public.notifications
  FOR INSERT WITH CHECK (user_id = auth.uid());
