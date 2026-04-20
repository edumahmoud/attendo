import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';
import { getAuthenticatedUser } from '@/lib/supabase-auth';

export async function GET(request: NextRequest) {
  try {
    if (!isSupabaseServerConfigured) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Verify the user is authenticated
    const authResult = await getAuthenticatedUser(request);
    if (!authResult?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role using service role (bypasses RLS)
    const { data: userProfile, error: profileError } = await supabaseServer
      .from('users')
      .select('id, role')
      .eq('id', authResult.user.id)
      .single();

    if (profileError || !userProfile || userProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Fetch all data in parallel using service role (bypasses RLS)
    const [usersResult, subjectsResult, quizzesResult, scoresResult, subjectStudentsResult] =
      await Promise.all([
        supabaseServer.from('users').select('*').order('created_at', { ascending: false }),
        supabaseServer.from('subjects').select('*').order('created_at', { ascending: false }),
        supabaseServer.from('quizzes').select('*').order('created_at', { ascending: false }),
        supabaseServer.from('scores').select('*').order('completed_at', { ascending: false }),
        supabaseServer.from('subject_students').select('subject_id, student_id'),
      ]);

    if (usersResult.error) {
      console.error('Error fetching users:', usersResult.error);
    }
    if (subjectsResult.error) {
      console.error('Error fetching subjects:', subjectsResult.error);
    }
    if (quizzesResult.error) {
      console.error('Error fetching quizzes:', quizzesResult.error);
    }
    if (scoresResult.error) {
      console.error('Error fetching scores:', scoresResult.error);
    }
    if (subjectStudentsResult.error) {
      console.error('Error fetching subject_students:', subjectStudentsResult.error);
    }

    const users = usersResult.data || [];
    const subjects = subjectsResult.data || [];
    const quizzes = quizzesResult.data || [];
    const scores = scoresResult.data || [];
    const subjectStudents = subjectStudentsResult.data || [];

    // Build teacher name map
    const teacherMap = new Map<string, string>();
    users.forEach((u: { id: string; name: string }) => {
      teacherMap.set(u.id, u.name);
    });

    // Build student count map per subject
    const subjectStudentCount = new Map<string, number>();
    subjectStudents.forEach((link: { subject_id: string }) => {
      subjectStudentCount.set(
        link.subject_id,
        (subjectStudentCount.get(link.subject_id) || 0) + 1
      );
    });

    // Enrich subjects with teacher name and student count
    const enrichedSubjects = subjects.map((s: Record<string, unknown>) => ({
      ...s,
      teacher_name: teacherMap.get(s.teacher_id as string) || 'غير معروف',
      student_count: subjectStudentCount.get(s.id as string) || 0,
    }));

    // Enrich quizzes with teacher name
    const enrichedQuizzes = quizzes.map((q: Record<string, unknown>) => ({
      ...q,
      teacher_name: teacherMap.get(q.user_id as string) || 'غير معروف',
    }));

    return NextResponse.json({
      users,
      subjects: enrichedSubjects,
      quizzes: enrichedQuizzes,
      scores,
    });
  } catch (error) {
    console.error('Admin dashboard API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
