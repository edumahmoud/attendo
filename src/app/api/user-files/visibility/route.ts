// =====================================================
// /api/user-files/visibility — Toggle User File Visibility
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, safeErrorResponse } from '@/lib/api-security';

/**
 * PATCH /api/user-files/visibility
 * Toggle a personal file's visibility (private ↔ public).
 * Body: { fileId, visibility: 'private' | 'public' }
 * Only the file owner can change visibility.
 */
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

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: 'معرف الملف مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (visibility !== 'private' && visibility !== 'public') {
      return NextResponse.json(
        { success: false, error: 'قيمة الظهور غير صالحة (يجب أن تكون private أو public)' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Verify ownership
    const { data: fileRecord, error: fetchError } = await authResult.supabase
      .from('user_files')
      .select('id, user_id, visibility')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !fileRecord) {
      return NextResponse.json(
        { success: false, error: 'الملف غير موجود أو غير مملوك لك' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // No-op if already the same
    if ((fileRecord as { visibility: string }).visibility === visibility) {
      return NextResponse.json(
        { success: true, message: 'الملف بالفعل بهذا الإعداد', data: fileRecord },
        { headers: rateLimitHeaders }
      );
    }

    // Update visibility
    const { data, error: updateError } = await authResult.supabase
      .from('user_files')
      .update({ visibility })
      .eq('id', fileId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('[USER-FILES VISIBILITY] Update error:', updateError);
      return NextResponse.json(
        { success: false, error: 'فشل في تحديث إعدادات الظهور' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[USER-FILES VISIBILITY] Unexpected error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحديث إعدادات الظهور');
  }
}
