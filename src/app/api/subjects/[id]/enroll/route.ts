// =====================================================
// /api/subjects/[id]/enroll — Enroll / Unenroll Student
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, validateRequest, safeErrorResponse } from '@/lib/api-security';
import { supabaseServer } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** POST /api/subjects/[id]/enroll — Enroll current student in subject */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const validationError = validateRequest(request);
    if (validationError) return validationError;

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

    if (profile.role !== 'student') {
      return NextResponse.json(
        { success: false, error: 'فقط الطلاب يمكنهم التسجيل في المواد' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Check subject exists and is active
    const { data: subject, error: subjectError } = await supabaseServer
      .from('subjects')
      .select('id, name, is_active')
      .eq('id', subjectId)
      .single();

    if (subjectError || !subject) {
      return NextResponse.json(
        { success: false, error: 'المادة غير موجودة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    if (!subject.is_active) {
      return NextResponse.json(
        { success: false, error: 'المادة غير متاحة للتسجيل حالياً' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Check not already enrolled
    const { data: existing } = await supabase
      .from('subject_students')
      .select('id')
      .eq('subject_id', subjectId)
      .eq('student_id', user.id)
      .single();

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'أنت مسجل بالفعل في هذه المادة' },
        { status: 409, headers: rateLimitHeaders }
      );
    }

    // Enroll
    const { data, error } = await supabase
      .from('subject_students')
      .insert({
        subject_id: subjectId,
        student_id: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Enrollment error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في التسجيل في المادة' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data },
      { status: 201, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Enrollment error:', error);
    return safeErrorResponse('حدث خطأ أثناء التسجيل في المادة');
  }
}

/** DELETE /api/subjects/[id]/enroll — Unenroll current student from subject */
export async function DELETE(request: NextRequest, context: RouteContext) {
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

    if (profile.role !== 'student') {
      return NextResponse.json(
        { success: false, error: 'فقط الطلاب يمكنهم إلغاء التسجيل' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    const { error } = await supabase
      .from('subject_students')
      .delete()
      .eq('subject_id', subjectId)
      .eq('student_id', user.id);

    if (error) {
      console.error('Unenrollment error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في إلغاء التسجيل' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: { unenrolled: subjectId } },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Unenrollment error:', error);
    return safeErrorResponse('حدث خطأ أثناء إلغاء التسجيل');
  }
}
