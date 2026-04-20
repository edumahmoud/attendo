// =====================================================
// /api/subjects/[id]/files/share — Share File with User
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-auth';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';
import { checkRateLimit, getRateLimitHeaders, safeErrorResponse } from '@/lib/api-security';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/subjects/[id]/files/share
 * Share a file with another user by email.
 * Sends a notification to the target user about the shared file.
 * Only the subject teacher or the file owner can share a file.
 */
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

    let body: { fileId?: string; email?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'طلب غير صالح' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const { fileId, email } = body;

    if (!fileId || !email) {
      return NextResponse.json(
        { success: false, error: 'معرف الملف والبريد الإلكتروني مطلوبان' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (!isSupabaseServerConfigured) {
      return NextResponse.json(
        { success: false, error: 'الخادم غير مهيأ' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Get the file record (use server client to bypass RLS)
    const { data: fileRecord } = await supabaseServer
      .from('subject_files')
      .select('id, file_name, uploaded_by, subject_id')
      .eq('id', fileId)
      .eq('subject_id', subjectId)
      .single();

    if (!fileRecord) {
      return NextResponse.json(
        { success: false, error: 'الملف غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Verify the sharer is the subject teacher or the file owner (use server client)
    const { data: subject } = await supabaseServer
      .from('subjects')
      .select('teacher_id')
      .eq('id', subjectId)
      .single();

    if (!subject || (subject.teacher_id !== user.id && fileRecord.uploaded_by !== user.id)) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح بمشاركة هذا الملف' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Find the target user by email (use server client to bypass RLS)
    const { data: targetUser } = await supabaseServer
      .from('users')
      .select('id, name')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'المستخدم غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Don't share with yourself
    if (targetUser.id === user.id) {
      return NextResponse.json(
        { success: false, error: 'لا يمكنك مشاركة الملف مع نفسك' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Send notification about shared file (use server client)
    const { error: notifError } = await supabaseServer
      .from('notifications')
      .insert({
        user_id: targetUser.id,
        title: 'ملف مشترك',
        content: `تم مشاركة ملف "${fileRecord.file_name}" معك في المادة`,
        type: 'message',
        reference_id: fileRecord.id,
      });

    if (notifError) {
      console.error('[SHARE] Notification error:', notifError);
      // Don't fail the whole request if notification fails
    }

    return NextResponse.json(
      { success: true, sharedWith: targetUser.name },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[SHARE] Unexpected error:', error);
    return safeErrorResponse('حدث خطأ أثناء مشاركة الملف');
  }
}
