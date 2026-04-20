// =====================================================
// /api/subjects/[id]/students — List Enrolled Students
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, safeErrorResponse } from '@/lib/api-security';
import { supabaseServer } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/subjects/[id]/students — List enrolled students */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = checkRateLimit(request);
    const rateLimitHeaders = getRateLimitHeaders(rateLimit.remaining, rateLimit.retryAfterMs);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'طلبات كثيرة جداً. يرجى المحاولة لاحقاً' },
        { status: 429, headers: rateLimitHeaders }
      );
    }

    const authResult = await getAuthenticatedUser(request);
    if (!authResult) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول' },
        { status: 401, headers: rateLimitHeaders }
      );
    }

    const { user, supabase } = authResult;
    const { id: subjectId } = await context.params;
    const profile = await getUserProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Check subject exists
    const { data: subject } = await supabaseServer
      .from('subjects')
      .select('teacher_id')
      .eq('id', subjectId)
      .single();

    if (!subject) {
      return NextResponse.json(
        { success: false, error: 'المادة غير موجودة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    const isTeacher = profile.role === 'teacher' && subject.teacher_id === user.id;

    if (isTeacher) {
      // Teacher: full list with student details
      const { data, error } = await supabaseServer
        .from('subject_students')
        .select(`
          id,
          subject_id,
          student_id,
          enrolled_at,
          users!subject_students_student_id_fkey(id, name, email, avatar_url)
        `)
        .eq('subject_id', subjectId)
        .order('enrolled_at', { ascending: true });

      if (error) {
        console.error('Students fetch error:', error);
        return NextResponse.json(
          { success: false, error: 'فشل في تحميل الطلاب' },
          { status: 500, headers: rateLimitHeaders }
        );
      }

      const students = (data || []).map((s) => ({
        id: s.id,
        subject_id: s.subject_id,
        student_id: s.student_id,
        enrolled_at: s.enrolled_at,
        student_name: (s.users as unknown as { name: string })?.name || null,
        student_email: (s.users as unknown as { email: string })?.email || null,
        student_avatar: (s.users as unknown as { avatar_url: string })?.avatar_url || null,
      }));

      return NextResponse.json(
        { success: true, data: students },
        { headers: rateLimitHeaders }
      );
    } else {
      // Student: only count
      const { count, error } = await supabaseServer
        .from('subject_students')
        .select('id', { count: 'exact', head: true })
        .eq('subject_id', subjectId);

      if (error) {
        console.error('Students count error:', error);
        return NextResponse.json(
          { success: false, error: 'فشل في تحميل عدد الطلاب' },
          { status: 500, headers: rateLimitHeaders }
        );
      }

      return NextResponse.json(
        { success: true, data: { count: count ?? 0 } },
        { headers: rateLimitHeaders }
      );
    }
  } catch (error) {
    console.error('Students list error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحميل الطلاب');
  }
}
