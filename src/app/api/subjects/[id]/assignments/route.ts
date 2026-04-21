// =====================================================
// /api/subjects/[id]/assignments — Assignments CRUD
// =====================================================
// List, create, update, and delete assignments for a subject.
// Teachers see all assignments with submission counts.
// Students see only active assignments (deadline not passed) with submitted flag.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, sanitizeString, safeErrorResponse } from '@/lib/api-security';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ─── GET — List assignments for a subject ───────────────

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

    const { user } = authResult;
    const { id: subjectId } = await context.params;
    const profile = await getUserProfile(authResult.supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Verify access to the subject
    const { data: subject } = await authResult.supabase
      .from('subjects')
      .select('teacher_id, is_active')
      .eq('id', subjectId)
      .single();

    if (!subject) {
      return NextResponse.json(
        { success: false, error: 'المادة غير موجودة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    const isTeacher = (profile.role === 'teacher' || profile.role === 'admin') && subject.teacher_id === user.id;

    if (!isTeacher) {
      // Check if student is enrolled
      const { data: enrollment } = await authResult.supabase
        .from('subject_students')
        .select('id')
        .eq('subject_id', subjectId)
        .eq('student_id', user.id)
        .single();

      if (!enrollment) {
        return NextResponse.json(
          { success: false, error: 'غير مصرح بالوصول لهذه المادة' },
          { status: 403, headers: rateLimitHeaders }
        );
      }
    }

    // Use service role for reads to bypass RLS and get submission counts
    if (!isSupabaseServerConfigured) {
      return NextResponse.json(
        { success: false, error: 'الخادم غير مهيأ' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    let query = supabaseServer
      .from('assignments')
      .select('id, subject_id, teacher_id, title, description, deadline, is_active, created_at, updated_at')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false });

    // Students should NOT see assignments where deadline has passed
    if (!isTeacher) {
      const now = new Date().toISOString();
      query = query.eq('is_active', true).or(`deadline.is.null,deadline.gt.${now}`);
    }

    const { data: assignments, error: fetchError } = await query;

    if (fetchError) {
      console.error('[ASSIGNMENTS] Fetch error:', fetchError);
      return NextResponse.json(
        { success: false, error: 'فشل في تحميل المهام' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Enrich with submission data
    const enrichedAssignments = await Promise.all(
      (assignments || []).map(async (assignment) => {
        if (isTeacher) {
          // Teachers see submission count
          const { count, error: countError } = await supabaseServer
            .from('assignment_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('assignment_id', assignment.id);

          if (countError) {
            console.error('[ASSIGNMENTS] Submission count error:', countError);
          }

          return {
            ...assignment,
            submission_count: count ?? 0,
          };
        } else {
          // Students see whether they have submitted
          const { data: submission } = await supabaseServer
            .from('assignment_submissions')
            .select('id')
            .eq('assignment_id', assignment.id)
            .eq('student_id', user.id)
            .single();

          return {
            ...assignment,
            student_submitted: !!submission,
          };
        }
      })
    );

    return NextResponse.json(
      { success: true, data: enrichedAssignments },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[ASSIGNMENTS] GET error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحميل المهام');
  }
}

// ─── POST — Create an assignment (teachers only) ────────

export async function POST(request: NextRequest, context: RouteContext) {
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
    const { id: subjectId } = await context.params;
    const profile = await getUserProfile(authResult.supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Only teachers can create assignments
    if (profile.role !== 'teacher' && profile.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'فقط المعلمون يمكنهم إنشاء المهام' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Verify teacher owns the subject
    const { data: subject, error: subjectError } = await authResult.supabase
      .from('subjects')
      .select('teacher_id')
      .eq('id', subjectId)
      .single();

    if (subjectError || !subject) {
      return NextResponse.json(
        { success: false, error: 'المادة غير موجودة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    if (subject.teacher_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح بإنشاء مهام في هذه المادة' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Parse request body
    let body: { title?: string; description?: string; deadline?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'طلب غير صالح' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const { title, description, deadline } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'عنوان المهمة مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const sanitizedTitle = sanitizeString(title, 255);
    const sanitizedDescription = description ? sanitizeString(description, 5000) : '';

    // Validate deadline format if provided
    let deadlineValue: string | null = null;
    if (deadline) {
      const parsed = new Date(deadline);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { success: false, error: 'صيغة الموعد النهائي غير صالحة' },
          { status: 400, headers: rateLimitHeaders }
        );
      }
      deadlineValue = parsed.toISOString();
    }

    // Insert assignment
    const insertPayload = {
      subject_id: subjectId,
      teacher_id: user.id,
      title: sanitizedTitle,
      description: sanitizedDescription,
      deadline: deadlineValue,
    };

    // Use user's JWT client for insert (RLS allows teachers to insert for their subjects)
    const { data, error: insertError } = await authResult.supabase
      .from('assignments')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      console.error('[ASSIGNMENTS] Create error:', insertError);
      return NextResponse.json(
        { success: false, error: `فشل في إنشاء المهمة: ${insertError.message}` },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Note: A DB trigger (trg_notify_new_assignment) should handle notifying students
    console.log('[ASSIGNMENTS] Assignment created:', sanitizedTitle);
    return NextResponse.json(
      { success: true, data },
      { status: 201, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[ASSIGNMENTS] POST error:', error);
    return safeErrorResponse('حدث خطأ أثناء إنشاء المهمة');
  }
}

// ─── PATCH — Update an assignment (teachers only) ───────

export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const { id: subjectId } = await context.params;
    const profile = await getUserProfile(authResult.supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Only teachers can update assignments
    if (profile.role !== 'teacher' && profile.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'فقط المعلمون يمكنهم تعديل المهام' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Verify teacher owns the subject
    const { data: subject } = await authResult.supabase
      .from('subjects')
      .select('teacher_id')
      .eq('id', subjectId)
      .single();

    if (!subject || subject.teacher_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح بتعديل مهام في هذه المادة' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Parse request body
    let body: { assignmentId?: string; title?: string; description?: string; deadline?: string; is_active?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'طلب غير صالح' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const { assignmentId, title, description, deadline, is_active } = body;

    if (!assignmentId) {
      return NextResponse.json(
        { success: false, error: 'معرف المهمة مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Verify the assignment belongs to this subject
    const { data: existingAssignment } = await authResult.supabase
      .from('assignments')
      .select('id, subject_id')
      .eq('id', assignmentId)
      .eq('subject_id', subjectId)
      .single();

    if (!existingAssignment) {
      return NextResponse.json(
        { success: false, error: 'المهمة غير موجودة في هذه المادة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Build update payload (only include fields that were provided)
    const updatePayload: Record<string, unknown> = {};

    if (title !== undefined) {
      updatePayload.title = sanitizeString(title, 255);
    }
    if (description !== undefined) {
      updatePayload.description = sanitizeString(description, 5000);
    }
    if (deadline !== undefined) {
      if (deadline === null || deadline === '') {
        updatePayload.deadline = null;
      } else {
        const parsed = new Date(deadline);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json(
            { success: false, error: 'صيغة الموعد النهائي غير صالحة' },
            { status: 400, headers: rateLimitHeaders }
          );
        }
        updatePayload.deadline = parsed.toISOString();
      }
    }
    if (is_active !== undefined) {
      updatePayload.is_active = Boolean(is_active);
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { success: false, error: 'لا توجد بيانات للتحديث' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Update the assignment using user's JWT client
    const { data, error: updateError } = await authResult.supabase
      .from('assignments')
      .update(updatePayload)
      .eq('id', assignmentId)
      .eq('subject_id', subjectId)
      .select()
      .single();

    if (updateError) {
      console.error('[ASSIGNMENTS] Update error:', updateError);
      return NextResponse.json(
        { success: false, error: `فشل في تحديث المهمة: ${updateError.message}` },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    console.log('[ASSIGNMENTS] Assignment updated:', assignmentId);
    return NextResponse.json(
      { success: true, data },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[ASSIGNMENTS] PATCH error:', error);
    return safeErrorResponse('حدث خطأ أثناء تعديل المهمة');
  }
}

// ─── DELETE — Delete an assignment (teachers only) ──────

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

    const { user } = authResult;
    const { id: subjectId } = await context.params;
    const profile = await getUserProfile(authResult.supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Only teachers can delete assignments
    if (profile.role !== 'teacher' && profile.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'فقط المعلمون يمكنهم حذف المهام' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    const assignmentId = request.nextUrl.searchParams.get('assignmentId');

    if (!assignmentId) {
      return NextResponse.json(
        { success: false, error: 'معرف المهمة مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Verify teacher owns the subject
    const { data: subject } = await authResult.supabase
      .from('subjects')
      .select('teacher_id')
      .eq('id', subjectId)
      .single();

    if (!subject || subject.teacher_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح بحذف مهام في هذه المادة' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Verify the assignment belongs to this subject
    const { data: existingAssignment } = await authResult.supabase
      .from('assignments')
      .select('id')
      .eq('id', assignmentId)
      .eq('subject_id', subjectId)
      .single();

    if (!existingAssignment) {
      return NextResponse.json(
        { success: false, error: 'المهمة غير موجودة في هذه المادة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Delete the assignment (cascades to submissions)
    const { error: deleteError } = await authResult.supabase
      .from('assignments')
      .delete()
      .eq('id', assignmentId)
      .eq('subject_id', subjectId);

    if (deleteError) {
      console.error('[ASSIGNMENTS] Delete error:', deleteError);
      return NextResponse.json(
        { success: false, error: 'فشل في حذف المهمة' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    console.log('[ASSIGNMENTS] Assignment deleted:', assignmentId);
    return NextResponse.json(
      { success: true, message: 'تم حذف المهمة بنجاح' },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[ASSIGNMENTS] DELETE error:', error);
    return safeErrorResponse('حدث خطأ أثناء حذف المهمة');
  }
}
