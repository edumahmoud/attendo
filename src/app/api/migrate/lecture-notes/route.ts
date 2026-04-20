import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

const LECTURE_NOTES_SQL = `
-- =====================================================
-- Add lecture_notes table for per-lecture notes
-- Teacher can add multiple notes visible to students
-- =====================================================

-- Create the table
CREATE TABLE IF NOT EXISTS public.lecture_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lecture_id UUID NOT NULL REFERENCES public.lectures(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lecture_notes_lecture ON public.lecture_notes(lecture_id);
CREATE INDEX IF NOT EXISTS idx_lecture_notes_teacher ON public.lecture_notes(teacher_id);

-- Enable RLS
ALTER TABLE public.lecture_notes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Teachers can CRUD own lecture notes" ON public.lecture_notes;
DROP POLICY IF EXISTS "Students can read enrolled lecture notes" ON public.lecture_notes;

-- Teachers can CRUD notes for lectures in their subjects
CREATE POLICY "Teachers can CRUD own lecture notes" ON public.lecture_notes
  FOR ALL USING (
    lecture_id IN (
      SELECT l.id FROM public.lectures l
      INNER JOIN public.subjects s ON l.subject_id = s.id
      WHERE s.teacher_id = auth.uid()
    )
  );

-- Students can read notes for lectures in subjects they are enrolled in
CREATE POLICY "Students can read enrolled lecture notes" ON public.lecture_notes
  FOR SELECT USING (
    lecture_id IN (
      SELECT l.id FROM public.lectures l
      WHERE l.subject_id IN (SELECT subject_id FROM public.subject_students WHERE student_id = auth.uid())
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_notes TO authenticated;
`.trim();

export async function GET() {
  // Check if the table already exists by trying to query it
  const { error } = await supabaseServer
    .from('lecture_notes')
    .select('id')
    .limit(1);

  if (!error) {
    return NextResponse.json({
      success: true,
      message: 'lecture_notes table already exists',
    });
  }

  // Table doesn't exist yet - provide SQL for manual execution
  return NextResponse.json({
    success: false,
    message: 'lecture_notes table does not exist. Run the SQL below in the Supabase SQL Editor.',
    sql: LECTURE_NOTES_SQL,
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
        sql: LECTURE_NOTES_SQL,
        instructions: 'Please run the SQL manually in the Supabase SQL Editor (Dashboard > SQL Editor).',
      },
      { status: 400 }
    );
  }

  // First check if the table already exists
  const { error: checkError } = await supabaseServer
    .from('lecture_notes')
    .select('id')
    .limit(1);

  if (!checkError) {
    return NextResponse.json({
      success: true,
      message: 'lecture_notes table already exists',
    });
  }

  // Try to execute the SQL via the Supabase API
  // Note: The Supabase REST API (PostgREST) does not support raw SQL execution.
  // The SQL must be run manually in the Supabase SQL Editor.
  return NextResponse.json(
    {
      success: false,
      error: 'Could not create lecture_notes table automatically. The Supabase REST API does not support DDL operations.',
      sql: LECTURE_NOTES_SQL,
      instructions: 'Please run the SQL below in the Supabase SQL Editor (Dashboard > SQL Editor). Copy the SQL from the "sql" field and paste it into the editor.',
    },
    { status: 501 }
  );
}
