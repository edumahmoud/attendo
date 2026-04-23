// =====================================================
// /api/user-files/share — Share Personal File with User(s)
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, safeErrorResponse } from '@/lib/api-security';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

/**
 * POST /api/user-files/share
 * Share a personal file with one or more users.
 * Body: { fileId, userIds: string[] }  OR  { fileId, email: string } (backward compat)
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

    let body: { fileId?: string; userIds?: string[]; email?: string; fileType?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'طلب غير صالح' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const { fileId, userIds, email } = body;

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: 'معرف الملف مطلوب' },
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

    // ─── Resolve target user IDs ───
    let targetUserIds: string[] = [];

    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      // New mode: share with multiple users by ID
      targetUserIds = userIds.filter((id) => typeof id === 'string' && id !== user.id);
    } else if (email?.trim()) {
      // Backward compat: share with single user by email
      const { data: targetUser } = await supabaseServer
        .from('users')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .single();

      if (!targetUser) {
        return NextResponse.json(
          { success: false, error: 'المستخدم غير موجود' },
          { status: 404, headers: rateLimitHeaders }
        );
      }

      const targetId = (targetUser as { id: string }).id;
      if (targetId === user.id) {
        return NextResponse.json(
          { success: false, error: 'لا يمكنك مشاركة الملف مع نفسك' },
          { status: 400, headers: rateLimitHeaders }
        );
      }
      targetUserIds = [targetId];
    } else {
      return NextResponse.json(
        { success: false, error: 'يرجى تحديد المستخدمين للمشاركة معهم' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (targetUserIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'لم يتم تحديد مستخدمين صالحين' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // ─── Fetch target user profiles ───
    const { data: targetProfiles } = await supabaseServer
      .from('users')
      .select('id, name, email, role')
      .in('id', targetUserIds);

    const profileMap = new Map(
      (targetProfiles || []).map((p) => [(p as { id: string }).id, p as { id: string; name: string; email: string; role: string }])
    );

    // ─── Check existing shares to avoid duplicates ───
    const { data: existingShares } = await supabaseServer
      .from('file_shares')
      .select('shared_with')
      .eq('file_id', fileId)
      .eq('file_type', 'user_file');

    const existingSet = new Set(
      (existingShares || []).map((s) => (s as { shared_with: string }).shared_with)
    );

    // ─── Create share records for new targets ───
    const newTargets = targetUserIds.filter((id) => !existingSet.has(id));

    if (newTargets.length === 0) {
      return NextResponse.json(
        { success: false, error: 'الملف مشارك بالفعل مع جميع المستخدمين المحددين' },
        { status: 409, headers: rateLimitHeaders }
      );
    }

    const shareRecords = newTargets.map((targetId) => ({
        file_id: fileId,
        file_type: 'user_file',
        shared_by: user.id,
        shared_with: targetId,
      }));

    const { error: shareError } = await supabaseServer
      .from('file_shares')
      .insert(shareRecords);

    if (shareError) {
      console.error('[USER-FILES SHARE] Insert error:', shareError);
      return NextResponse.json(
        { success: false, error: 'فشل في مشاركة الملف' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // ─── Send notifications ───
    const fileName = (fileRecord as Record<string, unknown>).file_name as string || 'ملف';
    const notifications = newTargets.map((targetId) => ({
      user_id: targetId,
      title: 'ملف شخصي مشارك',
      content: `شاركك ${profile.name} ملفاً بعنوان "${fileName}"`,
      type: 'message',
      reference_id: fileId,
    }));

    try {
      await supabaseServer.from('notifications').insert(notifications);
    } catch (notifErr) {
      console.error('[USER-FILES SHARE] Notification error:', notifErr);
    }

    const sharedNames = newTargets
      .map((id) => profileMap.get(id)?.name || 'مستخدم')
      .join('، ');

    return NextResponse.json(
      { success: true, sharedWith: sharedNames, count: newTargets.length },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[USER-FILES SHARE] Unexpected error:', error);
    return safeErrorResponse('حدث خطأ أثناء مشاركة الملف');
  }
}
