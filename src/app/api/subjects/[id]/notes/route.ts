// =====================================================
// /api/subjects/[id]/notes — List, Create, Update, Delete Notes
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, validateRequest, sanitizeString, safeErrorResponse } from '@/lib/api-security';
import { supabaseServer } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/subjects/[id]/notes — List notes for a subject */
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

    // Verify access
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

    if (!isTeacher) {
      const { data: enrollment } = await supabaseServer
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

    // Fetch notes with view counts using server client
    const { data: notes, error } = await supabaseServer
      .from('subject_notes')
      .select(`
        id,
        subject_id,
        teacher_id,
        title,
        content,
        created_at,
        updated_at,
        note_views(count)
      `)
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Notes fetch error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في تحميل الملاحظات' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    const result = (notes || []).map((note) => ({
      id: note.id,
      subject_id: note.subject_id,
      teacher_id: note.teacher_id,
      title: note.title,
      content: note.content,
      created_at: note.created_at,
      updated_at: note.updated_at,
      view_count: (note.note_views as unknown as { count: number }[])?.[0]?.count ?? 0,
    }));

    return NextResponse.json(
      { success: true, data: result },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Notes list error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحميل الملاحظات');
  }
}

/** POST /api/subjects/[id]/notes — Create a note */
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

    if (profile.role !== 'teacher') {
      return NextResponse.json(
        { success: false, error: 'فقط المعلمون يمكنهم إنشاء الملاحظات' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Verify ownership
    const { data: subject } = await supabase
      .from('subjects')
      .select('teacher_id')
      .eq('id', subjectId)
      .single();

    if (!subject || subject.teacher_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح بإنشاء ملاحظات في هذه المادة' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    const body = await request.json();
    const title = sanitizeString(body.title, 300);
    const content = sanitizeString(body.content, 100000);

    if (!title || title.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'عنوان الملاحظة مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'محتوى الملاحظة مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const { data, error } = await supabase
      .from('subject_notes')
      .insert({
        subject_id: subjectId,
        teacher_id: user.id,
        title: title.trim(),
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error('Note creation error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في إنشاء الملاحظة' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: { ...data, view_count: 0 } },
      { status: 201, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Note create error:', error);
    return safeErrorResponse('حدث خطأ أثناء إنشاء الملاحظة');
  }
}

/** PATCH /api/subjects/[id]/notes — Update a note */
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
    const { id: subjectId } = await context.params;
    const profile = await getUserProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    if (profile.role !== 'teacher') {
      return NextResponse.json(
        { success: false, error: 'فقط المعلمون يمكنهم تعديل الملاحظات' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    const body = await request.json();
    const noteId = body.note_id;

    if (!noteId) {
      return NextResponse.json(
        { success: false, error: 'معرف الملاحظة مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Verify the note belongs to this subject and the teacher owns it
    const { data: existingNote } = await supabase
      .from('subject_notes')
      .select('id, teacher_id, subject_id')
      .eq('id', noteId)
      .eq('subject_id', subjectId)
      .single();

    if (!existingNote) {
      return NextResponse.json(
        { success: false, error: 'الملاحظة غير موجودة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    if (existingNote.teacher_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح بتعديل هذه الملاحظة' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = sanitizeString(body.title, 300);
      if (!title || title.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: 'عنوان الملاحظة لا يمكن أن يكون فارغاً' },
          { status: 400, headers: rateLimitHeaders }
        );
      }
      updates.title = title.trim();
    }

    if (body.content !== undefined) {
      const content = sanitizeString(body.content, 100000);
      if (!content || content.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: 'محتوى الملاحظة لا يمكن أن يكون فارغاً' },
          { status: 400, headers: rateLimitHeaders }
        );
      }
      updates.content = content.trim();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'لا توجد حقول للتحديث' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const { data, error } = await supabase
      .from('subject_notes')
      .update(updates)
      .eq('id', noteId)
      .select()
      .single();

    if (error) {
      console.error('Note update error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في تحديث الملاحظة' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Note update error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحديث الملاحظة');
  }
}

/** DELETE /api/subjects/[id]/notes — Delete a note */
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

    if (profile.role !== 'teacher') {
      return NextResponse.json(
        { success: false, error: 'فقط المعلمون يمكنهم حذف الملاحظات' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get('note_id');

    if (!noteId) {
      return NextResponse.json(
        { success: false, error: 'معرف الملاحظة مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Verify note exists and belongs to this teacher
    const { data: existingNote } = await supabase
      .from('subject_notes')
      .select('id, teacher_id')
      .eq('id', noteId)
      .eq('subject_id', subjectId)
      .single();

    if (!existingNote) {
      return NextResponse.json(
        { success: false, error: 'الملاحظة غير موجودة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    if (existingNote.teacher_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح بحذف هذه الملاحظة' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    const { error } = await supabase
      .from('subject_notes')
      .delete()
      .eq('id', noteId);

    if (error) {
      console.error('Note delete error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في حذف الملاحظة' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: { deleted: noteId } },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Note delete error:', error);
    return safeErrorResponse('حدث خطأ أثناء حذف الملاحظة');
  }
}
