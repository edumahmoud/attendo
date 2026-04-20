// =====================================================
// /api/subjects — List & Create Subjects
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, validateRequest, sanitizeString, safeErrorResponse } from '@/lib/api-security';

/** GET /api/subjects — List subjects for the current user */
export async function GET(request: NextRequest) {
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
    const profile = await getUserProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    let subjects;

    if (profile.role === 'teacher') {
      // Teachers: return their own subjects with student count
      const { data, error } = await supabase
        .from('subjects')
        .select(`
          id,
          teacher_id,
          name,
          description,
          color,
          icon,
          is_active,
          created_at,
          updated_at,
          subject_students(count)
        `)
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Subjects fetch error:', error);
        return NextResponse.json(
          { success: false, error: 'فشل في تحميل المواد' },
          { status: 500, headers: rateLimitHeaders }
        );
      }

      subjects = (data || []).map((s) => ({
        ...s,
        student_count: (s.subject_students as unknown as { count: number }[])?.[0]?.count ?? 0,
        subject_students: undefined,
      }));
    } else {
      // Students: return subjects they are enrolled in with teacher name
      const { data: enrollments, error: enrollError } = await supabase
        .from('subject_students')
        .select('subject_id')
        .eq('student_id', user.id);

      if (enrollError) {
        console.error('Enrollments fetch error:', enrollError);
        return NextResponse.json(
          { success: false, error: 'فشل في تحميل التسجيلات' },
          { status: 500, headers: rateLimitHeaders }
        );
      }

      if (!enrollments || enrollments.length === 0) {
        return NextResponse.json(
          { success: true, data: [], headers: rateLimitHeaders },
          { headers: rateLimitHeaders }
        );
      }

      const subjectIds = enrollments.map((e) => e.subject_id);

      const { data, error } = await supabase
        .from('subjects')
        .select(`
          id,
          teacher_id,
          name,
          description,
          color,
          icon,
          is_active,
          created_at,
          updated_at,
          subject_students(count),
          users!subjects_teacher_id_fkey(id, name)
        `)
        .in('id', subjectIds)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Subjects fetch error:', error);
        return NextResponse.json(
          { success: false, error: 'فشل في تحميل المواد' },
          { status: 500, headers: rateLimitHeaders }
        );
      }

      subjects = (data || []).map((s) => ({
        id: s.id,
        teacher_id: s.teacher_id,
        name: s.name,
        description: s.description,
        color: s.color,
        icon: s.icon,
        is_active: s.is_active,
        created_at: s.created_at,
        updated_at: s.updated_at,
        student_count: (s.subject_students as unknown as { count: number }[])?.[0]?.count ?? 0,
        teacher_name: (s.users as unknown as { name: string })?.name || null,
      }));
    }

    return NextResponse.json(
      { success: true, data: subjects },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Subjects list error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحميل المواد');
  }
}

/** POST /api/subjects — Create a new subject */
export async function POST(request: NextRequest) {
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
    const profile = await getUserProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    if (profile.role !== 'teacher') {
      return NextResponse.json(
        { success: false, error: 'فقط المعلمون يمكنهم إنشاء المواد' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    const body = await request.json();
    const name = sanitizeString(body.name, 200);
    const description = sanitizeString(body.description, 2000);
    const color = sanitizeString(body.color, 20);
    const icon = sanitizeString(body.icon, 50);

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'اسم المادة مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Validate color format (hex)
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return NextResponse.json(
        { success: false, error: 'لون المادة غير صالح. يجب أن يكون بصيغة #RRGGBB' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Generate a unique 6-char subject code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let subjectCode = '';
    for (let i = 0; i < 6; i++) {
      subjectCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const { data, error } = await supabase
      .from('subjects')
      .insert({
        teacher_id: user.id,
        name: name.trim(),
        description: description || null,
        color: color || '#3B82F6',
        icon: icon || null,
        subject_code: subjectCode,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Subject creation error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في إنشاء المادة' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: { ...data, student_count: 0 } },
      { status: 201, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Subject create error:', error);
    return safeErrorResponse('حدث خطأ أثناء إنشاء المادة');
  }
}
