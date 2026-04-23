// =====================================================
// PATCH /api/user-files/assign-subject — Assign a user file to a subject
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, safeErrorResponse } from '@/lib/api-security';

/** PATCH — Assign or unassign a user_file to a subject */
export async function PATCH(request: NextRequest) {
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

    const { user } = authResult;
    const body = await request.json();
    const { fileId, subjectId } = body as { fileId?: string; subjectId?: string | null };

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: 'معرف الملف مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Verify the user owns the file
    const { data: fileRecord, error: fileError } = await authResult.supabase
      .from('user_files')
      .select('id, user_id')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single();

    if (fileError || !fileRecord) {
      return NextResponse.json(
        { success: false, error: 'الملف غير موجود أو غير مملوك لك' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // If subjectId is provided (not null), validate it
    if (subjectId) {
      // Check if the subject exists and user has access
      const { data: subjectCheck } = await authResult.supabase
        .from('subjects')
        .select('teacher_id')
        .eq('id', subjectId)
        .single();

      if (!subjectCheck) {
        return NextResponse.json(
          { success: false, error: 'المقرر غير موجود' },
          { status: 404, headers: rateLimitHeaders }
        );
      }

      // User must be teacher of this subject OR enrolled as student
      const isTeacherOfSubject = subjectCheck.teacher_id === user.id;
      if (!isTeacherOfSubject) {
        const { data: enrollment } = await authResult.supabase
          .from('subject_students')
          .select('id')
          .eq('subject_id', subjectId)
          .eq('student_id', user.id)
          .single();

        if (!enrollment) {
          return NextResponse.json(
            { success: false, error: 'ليس لديك صلاحية على هذا المقرر' },
            { status: 403, headers: rateLimitHeaders }
          );
        }
      }
    }

    // Update the file's subject_id
    const { data, error: updateError } = await authResult.supabase
      .from('user_files')
      .update({ subject_id: subjectId || null })
      .eq('id', fileId)
      .select()
      .single();

    if (updateError) {
      console.error('[ASSIGN-SUBJECT] Update error:', updateError);
      return NextResponse.json(
        { success: false, error: 'فشل في تحديث اسناد الملف' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[ASSIGN-SUBJECT] Error:', error);
    return safeErrorResponse('حدث خطأ أثناء اسناد الملف للمقرر');
  }
}
