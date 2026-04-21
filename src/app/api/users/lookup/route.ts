// =====================================================
// /api/users/lookup — User Lookup by Email
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, safeErrorResponse } from '@/lib/api-security';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

/**
 * GET /api/users/lookup?email=xxx
 * Look up a user by email address.
 * Returns the user's id, name, and role if found.
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
    if (!email || !email.trim()) {
      return NextResponse.json(
        { success: false, error: 'البريد الإلكتروني مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (!isSupabaseServerConfigured) {
      return NextResponse.json(
        { success: false, error: 'الخادم غير مهيأ' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Look up user by email using service role (bypasses RLS)
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
  } catch (error) {
    console.error('[USERS LOOKUP] Unexpected error:', error);
    return safeErrorResponse('حدث خطأ أثناء البحث عن المستخدم');
  }
}
