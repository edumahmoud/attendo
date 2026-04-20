import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';
import { getAuthenticatedUser } from '@/lib/supabase-auth';

async function verifyAdmin(request: NextRequest) {
  if (!isSupabaseServerConfigured) return null;
  const authResult = await getAuthenticatedUser(request);
  if (!authResult?.user) return null;

  const { data: userProfile } = await supabaseServer
    .from('users')
    .select('id, role')
    .eq('id', authResult.user.id)
    .single();

  if (!userProfile || userProfile.role !== 'admin') return null;
  return userProfile;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ─── User Management ───
      case 'grant_admin': {
        const { userId } = body;
        if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
        const { error } = await supabaseServer
          .from('users')
          .update({ is_admin: true, role: 'admin' })
          .eq('id', userId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      case 'revoke_admin': {
        const { userId } = body;
        if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
        if (userId === admin.id) {
          return NextResponse.json({ error: 'Cannot revoke own admin' }, { status: 400 });
        }
        const { error } = await supabaseServer
          .from('users')
          .update({ is_admin: false, role: 'teacher' })
          .eq('id', userId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      case 'disable_user': {
        const { userId } = body;
        if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
        if (userId === admin.id) {
          return NextResponse.json({ error: 'Cannot disable own account' }, { status: 400 });
        }
        const { error } = await supabaseServer
          .from('users')
          .update({ role: 'disabled', is_admin: false })
          .eq('id', userId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      case 'delete_user': {
        const { userId } = body;
        if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
        if (userId === admin.id) {
          return NextResponse.json({ error: 'Cannot delete own account' }, { status: 400 });
        }
        // Delete related data
        await supabaseServer.from('scores').delete().eq('student_id', userId);
        await supabaseServer.from('scores').delete().eq('teacher_id', userId);
        await supabaseServer.from('teacher_student_links').delete().eq('student_id', userId);
        await supabaseServer.from('teacher_student_links').delete().eq('teacher_id', userId);
        await supabaseServer.from('subject_students').delete().eq('student_id', userId);
        await supabaseServer.from('notifications').delete().eq('user_id', userId);
        await supabaseServer.from('quizzes').delete().eq('user_id', userId);
        await supabaseServer.from('summaries').delete().eq('user_id', userId);

        // Delete auth user via admin API
        const deleteResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`,
          {
            method: 'DELETE',
            headers: {
              apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
            },
          }
        );
        if (!deleteResponse.ok) {
          console.error('Failed to delete auth user:', deleteResponse.status);
        }

        const { error } = await supabaseServer.from('users').delete().eq('id', userId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      // ─── Subject Management ───
      case 'delete_subject': {
        const { subjectId } = body;
        if (!subjectId) return NextResponse.json({ error: 'subjectId required' }, { status: 400 });
        await supabaseServer.from('subject_students').delete().eq('subject_id', subjectId);
        await supabaseServer.from('subject_files').delete().eq('subject_id', subjectId);
        await supabaseServer.from('subject_notes').delete().eq('subject_id', subjectId);
        const { error } = await supabaseServer.from('subjects').delete().eq('id', subjectId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      // ─── Quiz Management ───
      case 'delete_quiz': {
        const { quizId } = body;
        if (!quizId) return NextResponse.json({ error: 'quizId required' }, { status: 400 });
        await supabaseServer.from('scores').delete().eq('quiz_id', quizId);
        const { error } = await supabaseServer.from('quizzes').delete().eq('id', quizId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      // ─── Quiz Results ───
      case 'view_quiz_results': {
        const { quizId } = body;
        if (!quizId) return NextResponse.json({ error: 'quizId required' }, { status: 400 });

        const { data: quizScores, error: scoresError } = await supabaseServer
          .from('scores')
          .select('*')
          .eq('quiz_id', quizId)
          .order('completed_at', { ascending: false });

        if (scoresError) {
          return NextResponse.json({ error: scoresError.message }, { status: 500 });
        }

        const studentIds = [...new Set((quizScores || []).map((s: { student_id: string }) => s.student_id))];
        let studentProfiles: Record<string, unknown>[] = [];
        if (studentIds.length > 0) {
          const { data: profiles } = await supabaseServer
            .from('users')
            .select('*')
            .in('id', studentIds);
          studentProfiles = profiles || [];
        }

        return NextResponse.json({ scores: quizScores || [], students: studentProfiles });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Admin action API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
