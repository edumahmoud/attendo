// =====================================================
// /api/users/lookup — User Lookup by Email/Name
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, safeErrorResponse } from '@/lib/api-security';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

/**
 * GET /api/users/lookup?email=xxx&search=xxx&limit=10
 * Look up users by exact email OR partial email/name search.
 * Returns an array of users with id, name, email, role.
 * Requires authentication.
 */
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

    const email = request.nextUrl.searchParams.get('email');
    const search = request.nextUrl.searchParams.get('search');
    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = Math.min(parseInt(limitParam || '10', 10), 20);

    if (!email?.trim() && !search?.trim()) {
      return NextResponse.json(
        { success: false, error: 'البريد الإلكتروني أو كلمة البحث مطلوبة' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (!isSupabaseServerConfigured) {
      return NextResponse.json(
        { success: false, error: 'الخادم غير مهيأ' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Mode 1: Exact email lookup (backward compatible)
    if (email?.trim()) {
      const { data, error } = await supabaseServer
        .from('users')
        .select('id, name, email, role')
        .eq('email', email.trim().toLowerCase())
        .single();

      if (error || !data) {
        return NextResponse.json(
          { success: false, error: 'المستخدم غير موجود' },
          { status: 404, headers: rateLimitHeaders }
        );
      }

      const user = data as { id: string; name: string; email: string; role: string };

      // Don't return the requesting user
      if (user.id === authResult.user.id) {
        return NextResponse.json(
          { success: false, error: 'لا يمكنك البحث عن نفسك' },
          { status: 400, headers: rateLimitHeaders }
        );
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
        },
        { headers: rateLimitHeaders }
      );
    }

    // Mode 2: Partial search (by email or name)
    const searchTerm = search!.trim();
    const { data, error } = await supabaseServer
      .from('users')
      .select('id, name, email, role')
      .or(`email.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%`)
      .neq('id', authResult.user.id)
      .limit(limit);

    if (error) {
      console.error('[USERS LOOKUP] Search error:', error);
      return NextResponse.json(
        { success: false, error: 'حدث خطأ أثناء البحث' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    const users = (data || []) as { id: string; name: string; email: string; role: string }[];

    return NextResponse.json(
      {
        success: true,
        data: users,
        total: users.length,
      },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[USERS LOOKUP] Unexpected error:', error);
    return safeErrorResponse('حدث خطأ أثناء البحث عن المستخدم');
  }
}
