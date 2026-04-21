// =====================================================
// /api/user-files/share — Share Personal File with User
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, safeErrorResponse } from '@/lib/api-security';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

/**
 * POST /api/user-files/share
 * Share a personal file with another user by email.
 * Only the file owner can share a file.
 */
export async function POST(request: NextRequest) {
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
    const profile = await getUserProfile(authResult.supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    let body: { fileId?: string; fileType?: string; email?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'طلب غير صالح' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const { fileId, fileType, email } = body;

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

    // Get the file record (verify ownership)
    const { data: fileRecord } = await supabaseServer
      .from('user_files')
      .select('id, file_name, file_url, user_id')
      .eq('id', fileId)
      .single();

    if (!fileRecord) {
      return NextResponse.json(
        { success: false, error: 'الملف غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Only the owner can share
    if ((fileRecord as Record<string, unknown>).user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح بمشاركة هذا الملف' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Find the target user by email
    const { data: targetUser } = await supabaseServer
      .from('users')
      .select('id, name, email, role')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'المستخدم غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Don't share with yourself
    if ((targetUser as Record<string, unknown>).id === user.id) {
      return NextResponse.json(
        { success: false, error: 'لا يمكنك مشاركة الملف مع نفسك' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const target = targetUser as { id: string; name: string; email: string; role: string };

    // Check if already shared
    const { data: existingShare } = await supabaseServer
      .from('file_shares')
      .select('id')
      .eq('file_id', fileId)
      .eq('file_type', 'user_file')
      .eq('shared_with', target.id)
      .single();

    if (existingShare) {
      return NextResponse.json(
        { success: false, error: 'الملف مشارك بالفعل مع هذا المستخدم' },
        { status: 409, headers: rateLimitHeaders }
      );
    }

    // Create share record
    const { error: shareError } = await supabaseServer
      .from('file_shares')
      .insert({
        file_id: fileId,
        file_type: 'user_file',
        shared_by: user.id,
        shared_with: target.id,
        shared_with_name: target.name,
        shared_with_email: target.email,
        shared_with_role: target.role,
        shared_by_name: profile.name,
        file_name: (fileRecord as Record<string, unknown>).file_name as string,
        file_url: (fileRecord as Record<string, unknown>).file_url as string,
      });

    if (shareError) {
      console.error('[USER-FILES SHARE] Insert error:', shareError);
      return NextResponse.json(
        { success: false, error: 'فشل في مشاركة الملف' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Send notification about shared file
    try {
      await supabaseServer
        .from('notifications')
        .insert({
          user_id: target.id,
          title: 'ملف شخصي مشارك',
          content: `شاركك ${profile.name} ملفاً بعنوان "${(fileRecord as Record<string, unknown>).file_name || 'ملف'}"`,
          type: 'message',
          reference_id: fileId,
        });
    } catch (notifErr) {
      console.error('[USER-FILES SHARE] Notification error:', notifErr);
      // Don't fail the whole request if notification fails
    }

    return NextResponse.json(
      { success: true, sharedWith: target.name },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[USER-FILES SHARE] Unexpected error:', error);
    return safeErrorResponse('حدث خطأ أثناء مشاركة الملف');
  }
}
