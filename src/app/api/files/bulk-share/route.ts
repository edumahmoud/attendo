// =====================================================
// /api/files/bulk-share — Bulk Share Files with User(s)
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, safeErrorResponse } from '@/lib/api-security';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';
import { getRoleLabel } from '@/lib/utils';

/**
 * POST /api/files/bulk-share
 * Share one or more files with one or more users in a single request.
 * Body: { fileIds: string[], userIds: string[], fileType?: 'user_file' | 'subject_file' }
 * Only the file owner (or subject teacher for subject files) can share.
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

    let body: { fileIds?: string[]; userIds?: string[]; fileType?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'طلب غير صالح' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const { fileIds, userIds, fileType = 'user_file' } = body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'يرجى تحديد ملف واحد على الأقل' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'يرجى تحديد مستخدم واحد على الأقل' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (!isSupabaseServerConfigured) {
      return NextResponse.json(
        { success: false, error: 'الخادم غير مهيأ' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Filter out the sharer's own ID
    const targetUserIds = userIds.filter((id) => typeof id === 'string' && id !== user.id);

    if (targetUserIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'لا يمكنك مشاركة الملفات مع نفسك' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // ─── Fetch the sharer's full profile (with gender & title_id) for notification label ───
    const { data: sharerProfile } = await supabaseServer
      .from('users')
      .select('name, role, gender, title_id')
      .eq('id', user.id)
      .single();

    const sharerName = sharerProfile?.name || profile.name || 'مستخدم';
    const sharerGender = sharerProfile?.gender as string | null | undefined;
    const sharerTitleId = sharerProfile?.title_id as string | null | undefined;
    const roleLabel = getRoleLabel(sharerProfile?.role as string | undefined, sharerGender, sharerTitleId);
    const sharerLabel = roleLabel ? `${roleLabel} : ${sharerName}` : sharerName;

    // ─── Fetch target user profiles ───
    const { data: targetProfiles } = await supabaseServer
      .from('users')
      .select('id, name')
      .in('id', targetUserIds);

    const profileMap = new Map(
      (targetProfiles || []).map((p) => [(p as { id: string }).id, (p as { id: string; name: string }).name])
    );

    // ─── Fetch file records ───
    const tableName = fileType === 'subject_file' ? 'subject_files' : 'user_files';
    const { data: fileRecords } = await supabaseServer
      .from(tableName)
      .select('id, file_name')
      .in('id', fileIds);

    const fileMap = new Map(
      (fileRecords || []).map((f) => [(f as { id: string }).id, (f as { id: string; file_name: string }).file_name || 'ملف'])
    );

    // ─── Check existing shares to avoid duplicates ───
    const { data: existingShares } = await supabaseServer
      .from('file_shares')
      .select('file_id, shared_with')
      .in('file_id', fileIds)
      .eq('file_type', fileType);

    const existingSet = new Set(
      (existingShares || []).map((s) => {
        const share = s as { file_id: string; shared_with: string };
        return `${share.file_id}::${share.shared_with}`;
      })
    );

    // ─── Create share records for new combinations ───
    const shareRecords: { file_id: string; file_type: string; shared_by: string; shared_with: string }[] = [];

    for (const fileId of fileIds) {
      // Verify file exists in our fetched records
      if (!fileMap.has(fileId)) continue;

      for (const targetId of targetUserIds) {
        const key = `${fileId}::${targetId}`;
        if (!existingSet.has(key)) {
          shareRecords.push({
            file_id: fileId,
            file_type: fileType,
            shared_by: user.id,
            shared_with: targetId,
          });
        }
      }
    }

    if (shareRecords.length === 0) {
      return NextResponse.json(
        { success: false, error: 'جميع الملفات مشاركة بالفعل مع المستخدمين المحددين' },
        { status: 409, headers: rateLimitHeaders }
      );
    }

    const { error: shareError } = await supabaseServer
      .from('file_shares')
      .insert(shareRecords);

    if (shareError) {
      console.error('[BULK-SHARE] Insert error:', shareError);
      return NextResponse.json(
        { success: false, error: 'فشل في مشاركة الملفات' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // ─── Send notifications ───
    // Build unique notifications per target user per file
    const notifications: { user_id: string; title: string; content: string; type: string; reference_id: string }[] = [];

    for (const record of shareRecords) {
      const fileName = fileMap.get(record.file_id) || 'ملف';
      const targetName = profileMap.get(record.shared_with) || 'مستخدم';

      notifications.push({
        user_id: record.shared_with,
        title: 'ملف مشترك',
        content: `شاركك ${sharerLabel} ملفاً بعنوان "${fileName}"`,
        type: 'message',
        reference_id: record.file_id,
      });
    }

    try {
      await supabaseServer.from('notifications').insert(notifications);
    } catch (notifErr) {
      console.error('[BULK-SHARE] Notification error:', notifErr);
    }

    const sharedNames = targetUserIds
      .map((id) => profileMap.get(id) || 'مستخدم')
      .join('، ');

    return NextResponse.json(
      {
        success: true,
        sharedWith: sharedNames,
        sharedCount: shareRecords.length,
        fileCount: fileIds.length,
        userCount: targetUserIds.length,
      },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[BULK-SHARE] Unexpected error:', error);
    return safeErrorResponse('حدث خطأ أثناء مشاركة الملفات');
  }
}
