// =====================================================
// /api/subjects/[id]/files/visibility — Toggle File Visibility
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-auth';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';
import { checkRateLimit, getRateLimitHeaders, safeErrorResponse } from '@/lib/api-security';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/subjects/[id]/files/visibility
 * Toggle a file's visibility between public and private.
 * Only the teacher of the subject can change visibility.
 */
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

    let body: { fileId?: string; visibility?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'طلب غير صالح' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const { fileId, visibility } = body;

    if (!fileId || !visibility || !['public', 'private'].includes(visibility)) {
      return NextResponse.json(
        { success: false, error: 'معرف الملف والرؤية مطلوبان (public أو private)' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (!isSupabaseServerConfigured) {
      return NextResponse.json(
        { success: false, error: 'الخادم غير مهيأ' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Verify the user is the teacher of this subject (use server client to bypass RLS)
    const { data: subject } = await supabaseServer
      .from('subjects')
      .select('teacher_id')
      .eq('id', subjectId)
      .single();

    if (!subject || subject.teacher_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. فقط معلم المادة يمكنه تغيير رؤية الملفات' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Verify the file belongs to this subject
    const { data: fileRecord } = await supabaseServer
      .from('subject_files')
      .select('id, uploaded_by')
      .eq('id', fileId)
      .eq('subject_id', subjectId)
      .single();

    if (!fileRecord) {
      return NextResponse.json(
        { success: false, error: 'الملف غير موجود في هذه المادة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Update the visibility using server client (bypasses RLS)
    const { error } = await supabaseServer
      .from('subject_files')
      .update({ visibility })
      .eq('id', fileId);

    if (error) {
      console.error('[VISIBILITY] Update error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في تحديث رؤية الملف' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[VISIBILITY] Unexpected error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحديث رؤية الملف');
  }
}
