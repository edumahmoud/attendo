// =====================================================
// /api/notifications — List, Mark Read, Delete Notifications
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, validateRequest, sanitizeString, safeErrorResponse } from '@/lib/api-security';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/** GET /api/notifications — List notifications for current user */
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

    // Parse pagination params
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get('page_size') || String(DEFAULT_PAGE_SIZE), 10)));
    const type = searchParams.get('type'); // Filter by type
    const unreadOnly = searchParams.get('unread') === 'true';

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Build query
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (type) {
      query = query.eq('type', type);
    }

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Notifications fetch error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في تحميل الإشعارات' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Get unread count
    const { count: unreadCount, error: unreadError } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (unreadError) {
      console.error('Unread count error:', unreadError);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          notifications: data || [],
          total: count ?? 0,
          page,
          page_size: pageSize,
          unread_count: unreadCount ?? 0,
        },
      },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Notifications list error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحميل الإشعارات');
  }
}

/** PATCH /api/notifications — Mark notification(s) as read */
export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const notificationIds = body.notification_ids as string[] | undefined;
    const markAll = body.mark_all as boolean | undefined;

    if (markAll) {
      // Mark all notifications as read
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) {
        console.error('Mark all read error:', error);
        return NextResponse.json(
          { success: false, error: 'فشل في تحديث الإشعارات' },
          { status: 500, headers: rateLimitHeaders }
        );
      }

      return NextResponse.json(
        { success: true, data: { marked_all: true } },
        { headers: rateLimitHeaders }
      );
    }

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'يجب تحديد الإشعارات أو استخدام mark_all' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Validate IDs
    const validIds = notificationIds
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id) => sanitizeString(id, 100))
      .filter((id) => id.length > 0);

    if (validIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'معرفات الإشعارات غير صالحة' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .in('id', validIds);

    if (error) {
      console.error('Mark read error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في تحديث الإشعارات' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: { marked: validIds.length } },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Mark read error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحديث الإشعارات');
  }
}

/** DELETE /api/notifications — Delete a notification */
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get('id');

    if (!notificationId) {
      return NextResponse.json(
        { success: false, error: 'معرف الإشعار مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const sanitizedId = sanitizeString(notificationId, 100);
    if (!sanitizedId) {
      return NextResponse.json(
        { success: false, error: 'معرف الإشعار غير صالح' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Delete (RLS ensures user can only delete their own)
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', sanitizedId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Notification delete error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في حذف الإشعار' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: { deleted: sanitizedId } },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Notification delete error:', error);
    return safeErrorResponse('حدث خطأ أثناء حذف الإشعار');
  }
}
