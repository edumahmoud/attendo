import { NextResponse } from 'next/server';

/**
 * GET /api/db-check — Diagnostic endpoint to check database table existence
 * Tests whether the required V2 tables exist in Supabase and detects RLS recursion issues.
 */

const REQUIRED_TABLES = [
  'users',
  'teacher_student_links',
  'summaries',
  'quizzes',
  'scores',
  'user_titles',
  'subjects',
  'subject_students',
  'subject_files',
  'subject_notes',
  'note_views',
  'lectures',
  'lecture_attendance',
  'messages',
  'notifications',
];

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({
      configured: false,
      error: 'Supabase credentials not configured',
    });
  }

  const results: Record<string, { exists: boolean; error?: string; isRecursion?: boolean }> = {};

  // Check each table by trying a simple select
  for (const table of REQUIRED_TABLES) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id&limit=1`, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      });

      if (res.ok) {
        results[table] = { exists: true };
      } else if (res.status === 404) {
        results[table] = { exists: false, error: 'Table not found' };
      } else {
        const body = await res.text();
        const isRecursion = body.includes('42P17') || body.includes('infinite recursion');
        results[table] = { exists: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}`, isRecursion };
      }
    } catch (err) {
      results[table] = { exists: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  const missingTables = REQUIRED_TABLES.filter((t) => !results[t]?.exists);
  const hasRecursion = Object.values(results).some((r) => r.isRecursion);
  const allExist = missingTables.length === 0;

  // Check if subject_code column exists in subjects table
  let subjectCodeExists = false;
  try {
    const colCheck = await fetch(`${supabaseUrl}/rest/v1/subjects?select=subject_code&limit=1`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    subjectCodeExists = colCheck.ok;
  } catch {
    subjectCodeExists = false;
  }

  return NextResponse.json({
    configured: true,
    allTablesExist: allExist,
    hasRecursion,
    subjectCodeColumnExists: subjectCodeExists,
    missingTables,
    results,
    fixRequired: !allExist || hasRecursion || !subjectCodeExists,
    fixInstructions: hasRecursion
      ? 'RLS policies have infinite recursion. Run the RLS fix script in Supabase SQL Editor.'
      : !allExist
        ? 'Some tables are missing. Run the full schema setup in Supabase SQL Editor.'
        : !subjectCodeExists
          ? 'subject_code column is missing from subjects table. Run the add_subject_code.sql migration in Supabase SQL Editor.'
          : null,
  });
}
