// =====================================================
// /api/attendance — Check student attendance for lectures
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { supabaseServer } from '@/lib/supabase-server';

/** GET /api/attendance?student_id=xxx — Get lecture IDs where student has attended */
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser(request);
    if (!authResult) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول' },
        { status: 401 }
      );
    }

    const { user } = authResult;
    const studentId = request.nextUrl.searchParams.get('student_id') || user.id;

    // Only allow students to query their own attendance
    if (studentId !== user.id) {
      const profile = await getUserProfile(authResult.supabase, user.id);
      if (!profile || profile.role !== 'teacher') {
        return NextResponse.json(
          { success: false, error: 'غير مصرح' },
          { status: 403 }
        );
      }
    }

    // Use server client (bypasses RLS)
    const { data, error } = await supabaseServer
      .from('lecture_attendance')
      .select('lecture_id, attended_at')
      .eq('student_id', studentId);

    if (error) {
      console.error('Attendance fetch error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في تحميل بيانات الحضور' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [], // [{ lecture_id: string, attended_at: string }]
    });
  } catch (error) {
    console.error('Attendance API error:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء تحميل الحضور' },
      { status: 500 }
    );
  }
}

/** GET /api/attendance/counts?subject_id=xxx — Get attendance counts per lecture for a subject */
export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser(request);
    if (!authResult) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { lecture_ids } = body as { lecture_ids: string[] };

    if (!lecture_ids || !Array.isArray(lecture_ids) || lecture_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'lecture_ids مطلوب' },
        { status: 400 }
      );
    }

    // Use server client (bypasses RLS) to get attendance counts
    const { data, error } = await supabaseServer
      .from('lecture_attendance')
      .select('lecture_id')
      .in('lecture_id', lecture_ids);

    if (error) {
      console.error('Attendance counts error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في تحميل عدد الحضور' },
        { status: 500 }
      );
    }

    // Count per lecture
    const countMap: Record<string, number> = {};
    for (const row of (data || []) as { lecture_id: string }[]) {
      countMap[row.lecture_id] = (countMap[row.lecture_id] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      data: countMap, // { [lecture_id]: count }
    });
  } catch (error) {
    console.error('Attendance counts API error:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ' },
      { status: 500 }
    );
  }
}
