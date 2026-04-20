// =====================================================
// /api/subjects/[id] — Get, Update, Delete Subject
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, validateRequest, sanitizeString, safeErrorResponse } from '@/lib/api-security';
import { supabaseServer } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/subjects/[id] — Get subject details */
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
    const { id } = await context.params;
    const profile = await getUserProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Fetch subject using the server client to ensure we can access it regardless of RLS
    // Then verify the user has access
    const { data: subject, error } = await supabaseServer
      .from('subjects')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !subject) {
      return NextResponse.json(
        { success: false, error: 'المادة غير موجودة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Check access: teacher owns it or student is enrolled
    const isTeacher = profile.role === 'teacher' && subject.teacher_id === user.id;
    let isEnrolled = false;

    if (!isTeacher) {
      const { data: enrollment } = await supabaseServer
        .from('subject_students')
        .select('id')
        .eq('subject_id', id)
        .eq('student_id', user.id)
        .single();
      isEnrolled = !!enrollment;
    }

    if (!isTeacher && !isEnrolled) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح بالوصول لهذه المادة' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Get counts using server client
    const [studentsResult, filesResult, notesResult] = await Promise.all([
      supabaseServer.from('subject_students').select('id', { count: 'exact', head: true }).eq('subject_id', id),
      supabaseServer.from('subject_files').select('id', { count: 'exact', head: true }).eq('subject_id', id),
      supabaseServer.from('subject_notes').select('id', { count: 'exact', head: true }).eq('subject_id', id),
    ]);

    const result: Record<string, unknown> = {
      ...subject,
      student_count: studentsResult.count ?? 0,
      file_count: filesResult.count ?? 0,
      note_count: notesResult.count ?? 0,
    };

    // For students, include teacher info
    if (!isTeacher) {
      const { data: teacher } = await supabaseServer
        .from('users')
        .select('id, name, email')
        .eq('id', subject.teacher_id)
        .single();
      result.teacher_name = teacher?.name || null;
      result.teacher_email = teacher?.email || null;
    }

    return NextResponse.json(
      { success: true, data: result },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Subject get error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحميل المادة');
  }
}

/** PATCH /api/subjects/[id] — Update subject */
export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const { id } = await context.params;
    const profile = await getUserProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Verify ownership
    const { data: subject, error: fetchError } = await supabase
      .from('subjects')
      .select('teacher_id')
      .eq('id', id)
      .single();

    if (fetchError || !subject) {
      return NextResponse.json(
        { success: false, error: 'المادة غير موجودة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    if (subject.teacher_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح بتعديل هذه المادة' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = sanitizeString(body.name, 200);
      if (!name || name.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: 'اسم المادة لا يمكن أن يكون فارغاً' },
          { status: 400, headers: rateLimitHeaders }
        );
      }
      updates.name = name.trim();
    }

    if (body.description !== undefined) {
      updates.description = sanitizeString(body.description, 2000) || null;
    }

    if (body.color !== undefined) {
      const color = sanitizeString(body.color, 20);
      if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return NextResponse.json(
          { success: false, error: 'لون المادة غير صالح. يجب أن يكون بصيغة #RRGGBB' },
          { status: 400, headers: rateLimitHeaders }
        );
      }
      updates.color = color || '#3B82F6';
    }

    if (body.icon !== undefined) {
      updates.icon = sanitizeString(body.icon, 50) || null;
    }

    if (body.is_active !== undefined) {
      updates.is_active = Boolean(body.is_active);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'لا توجد حقول للتحديث' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const { data, error } = await supabase
      .from('subjects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Subject update error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في تحديث المادة' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Subject update error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحديث المادة');
  }
}

/** DELETE /api/subjects/[id] — Delete subject (cascade) */
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
    const { id } = await context.params;
    const profile = await getUserProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Verify ownership
    const { data: subject, error: fetchError } = await supabase
      .from('subjects')
      .select('teacher_id, name')
      .eq('id', id)
      .single();

    if (fetchError || !subject) {
      return NextResponse.json(
        { success: false, error: 'المادة غير موجودة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    if (subject.teacher_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح بحذف هذه المادة' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Delete — cascades to files, notes, students, lectures, etc.
    const { error } = await supabase
      .from('subjects')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Subject delete error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في حذف المادة' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: { deleted: id } },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Subject delete error:', error);
    return safeErrorResponse('حدث خطأ أثناء حذف المادة');
  }
}
