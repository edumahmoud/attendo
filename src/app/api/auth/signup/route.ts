import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

/**
 * POST /api/auth/signup
 * Server-side auth proxy for sign-up.
 * Body: { email, password, name, role, gender? }
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
    const { email, password, name, role, gender } = body as {
      email: string;
      password: string;
      name: string;
      role: string;
      gender?: string;
    };

    // Validate inputs
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'صيغة البريد الإلكتروني غير صالحة' },
        { status: 400 }
      );
    }
    if (!name || name.trim().length === 0 || name.length > 100) {
      return NextResponse.json(
        { error: 'يرجى إدخال اسم صالح (1-100 حرف)' },
        { status: 400 }
      );
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'يجب أن تكون كلمة المرور 6 أحرف على الأقل' },
        { status: 400 }
      );
    }
    if (!role || !['student', 'teacher'].includes(role)) {
      return NextResponse.json(
        { error: 'يرجى اختيار دور صالح' },
        { status: 400 }
      );
    }

    // Create auth user using admin API
    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true, // Auto-confirm for now
      user_metadata: {
        name: name.trim(),
        role,
        ...(gender ? { gender } : {}),
      },
    });

    if (authError) {
      const msg = (authError.message || '').toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user_already_exists')) {
        return NextResponse.json(
          { error: 'هذا البريد الإلكتروني مسجل بالفعل' },
          { status: 409 }
        );
      }
      if (msg.includes('password') && msg.includes('weak')) {
        return NextResponse.json(
          { error: 'كلمة المرور ضعيفة، يرجى اختيار كلمة مرور أقوى' },
          { status: 400 }
        );
      }
      if (msg.includes('signup is disabled') || msg.includes('email_provider_disabled')) {
        return NextResponse.json(
          { error: 'التسجيل بالبريد الإلكتروني غير مفعّل حالياً' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: `فشل في إنشاء الحساب: ${authError.message}` },
        { status: 500 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'فشل في إنشاء الحساب' },
        { status: 500 }
      );
    }

    // Generate a session for the newly created user (auto-confirmed)
    // We use the anon-key client to sign in and get a proper session
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const { createClient: createAuthClient } = await import('@supabase/supabase-js');
    const anonClient = createAuthClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: signInData } = await anonClient.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    const session = signInData?.session || null;

    // Check if profile was auto-created by auth trigger
    const { data: existingProfile } = await supabaseServer
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (existingProfile) {
      // Update the role if needed (trigger may have set 'pending')
      if (existingProfile.role !== role) {
        await supabaseServer
          .from('users')
          .update({ role, ...(gender ? { gender } : {}), name: name.trim() })
          .eq('id', authData.user.id);
      }

      // Re-fetch with updates
      const { data: updatedProfile } = await supabaseServer
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      return NextResponse.json({
        needsConfirmation: false,
        session,
        profile: updatedProfile || existingProfile,
      });
    }

    // Create profile manually
    const { data: newProfile, error: profileError } = await supabaseServer
      .from('users')
      .insert({
        id: authData.user.id,
        email: email.toLowerCase().trim(),
        name: name.trim(),
        role,
        ...(gender ? { gender } : {}),
      })
      .select()
      .single();

    if (profileError) {
      const err = profileError as { code?: string };
      if (err.code === '23505') {
        // Race condition - profile was created
        const { data: retryProfile } = await supabaseServer
          .from('users')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        return NextResponse.json({
          needsConfirmation: false,
          session,
          profile: retryProfile,
        });
      }
      // Profile creation failed but auth user was created
      return NextResponse.json(
        { error: 'تم إنشاء الحساب لكن حدث خطأ في الملف الشخصي. حاول تسجيل الدخول.' },
        { status: 201 }
      );
    }

    return NextResponse.json({
      needsConfirmation: false,
      session,
      profile: newProfile,
    });
  } catch (error) {
    console.error('[auth/signup] Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع أثناء التسجيل' },
      { status: 500 }
    );
  }
}
