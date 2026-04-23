import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

/**
 * POST /api/auth/signin
 * Server-side auth proxy for sign-in.
 * Body: { email, password }
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseServerConfigured) {
      return NextResponse.json(
        { error: 'Supabase غير مضبوط. يرجى إضافة المتغيرات المطلوبة في .env.local' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { email, password } = body as { email: string; password: string };

    if (!email || !password) {
      return NextResponse.json(
        { error: 'البريد الإلكتروني وكلمة المرور مطلوبان' },
        { status: 400 }
      );
    }

    // Use Supabase admin auth to verify credentials
    // We can't use signInWithPassword server-side with service role,
    // so we use the anon-key client approach via a temporary client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // Create a temporary client for sign-in (not service role)
    const { createClient } = await import('@supabase/supabase-js');
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await authClient.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
        return NextResponse.json(
          { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
          { status: 401 }
        );
      }
      if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
        return NextResponse.json(
          { error: 'يرجى تأكيد بريدك الإلكتروني أولاً' },
          { status: 401 }
        );
      }
      if (msg.includes('too many')) {
        return NextResponse.json(
          { error: 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
        { status: 401 }
      );
    }

    if (!data.user) {
      return NextResponse.json(
        { error: 'فشل في تسجيل الدخول' },
        { status: 401 }
      );
    }

    // Get user profile
    const { data: profile } = await supabaseServer
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (!profile) {
      // Try to create profile (may have been created by auth trigger)
      const userName = data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'مستخدم';
      const userRole = data.user.user_metadata?.role || 'pending';

      const { data: newProfile, error: createError } = await supabaseServer
        .from('users')
        .insert({
          id: data.user.id,
          email: data.user.email || email,
          name: userName,
          role: userRole,
        })
        .select()
        .single();

      if (createError) {
        // Duplicate key = already exists
        const err = createError as { code?: string };
        if (err.code === '23505') {
          const { data: retryProfile } = await supabaseServer
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single();

          if (retryProfile) {
            return NextResponse.json({
              session: data.session,
              profile: retryProfile,
            });
          }
        }
        return NextResponse.json(
          { error: 'لم يتم العثور على حساب. يرجى التسجيل أولاً.' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        session: data.session,
        profile: newProfile,
      });
    }

    return NextResponse.json({
      session: data.session,
      profile,
    });
  } catch (error) {
    console.error('[auth/signin] Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
