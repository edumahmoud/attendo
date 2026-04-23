import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

/**
 * GET /api/setup
 * Check if the system needs initial setup (no users exist).
 * Returns { needsSetup: boolean }
 */
export async function GET() {
  try {
    // Use the anon key client for checking users (it has SELECT permissions)
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('[Setup] Error checking users:', JSON.stringify(error));
      return NextResponse.json({ needsSetup: false, error: 'db_error' });
    }

    return NextResponse.json({ needsSetup: count === 0 });
  } catch (error) {
    console.error('[Setup] Exception:', error);
    return NextResponse.json({ needsSetup: false, error: 'exception' });
  }
}

/**
 * POST /api/setup
 * Create the first admin user.
 * Only works when no users exist in the system.
 * Body: { name, email, password }
 */
export async function POST(request: Request) {
  try {
    if (!isSupabaseServerConfigured) {
      return NextResponse.json(
        { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY غير مضبوط. يرجى إضافته في ملف .env.local' },
        { status: 400 }
      );
    }

    // Check if setup is still needed (use anon key for reads)
    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (count !== undefined && count > 0) {
      return NextResponse.json(
        { success: false, error: 'النظام به مستخدمين بالفعل. لا يمكن إنشاء أدمن أول.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, email, password } = body;

    // Validate inputs
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'الاسم مطلوب' },
        { status: 400 }
      );
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'البريد الإلكتروني غير صالح' },
        { status: 400 }
      );
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' },
        { status: 400 }
      );
    }

    // Create auth user using admin API (uses GoTrue, not PostgREST)
    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true, // Auto-confirm email for first admin
      user_metadata: {
        name: name.trim(),
        role: 'admin',
      },
    });

    if (authError) {
      console.error('[Setup] Error creating auth user:', authError);

      // Map common errors to Arabic
      if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
        return NextResponse.json(
          { success: false, error: 'هذا البريد الإلكتروني مسجل بالفعل. يرجى استخدام بريد آخر.' },
          { status: 400 }
        );
      }
      if (authError.message.includes('password') && authError.message.includes('weak')) {
        return NextResponse.json(
          { success: false, error: 'كلمة المرور ضعيفة. يرجى اختيار كلمة مرور أقوى.' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { success: false, error: `فشل في إنشاء حساب المشرف: ${authError.message}` },
        { status: 500 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { success: false, error: 'فشل في إنشاء حساب المشرف' },
        { status: 500 }
      );
    }

    // The auth trigger should have created the user profile automatically.
    // Let's check and update it to admin role if needed.
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', authData.user.id)
      .single();

    if (existingProfile) {
      // Profile was created by the auth trigger
      if (existingProfile.role !== 'admin') {
        // The trigger likely created it with a different role (constraint issue)
        // Try to update it using service role
        const { error: updateError } = await supabaseServer
          .from('users')
          .update({
            role: 'admin',
            is_admin: true,
            name: name.trim(),
          })
          .eq('id', authData.user.id);

        if (updateError) {
          // Service role might not have schema permissions
          // Provide SQL instructions for the user
          console.error('[Setup] Error updating profile:', updateError);
          return NextResponse.json({
            success: false,
            error: 'تم إنشاء حساب المصادقة لكن قيد الدور في قاعدة البيانات يمنع تحديث الدور إلى "مشرف". يرجى تنفيذ الاستعلام التالي في Supabase SQL Editor ثم المحاولة مرة أخرى:',
            sql: `ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;\nALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'teacher', 'admin', 'pending'));\n\nUPDATE public.users SET role = 'admin', is_admin = true WHERE id = '${authData.user.id}';`,
            needsSQLFix: true,
          }, { status: 400 });
        }
      }
    } else {
      // Profile doesn't exist yet - create it
      const { error: insertError } = await supabaseServer
        .from('users')
        .insert({
          id: authData.user.id,
          email: email.toLowerCase().trim(),
          name: name.trim(),
          role: 'admin',
          is_admin: true,
        });

      if (insertError) {
        console.error('[Setup] Error creating profile:', insertError);
        if (insertError.message.includes('role_check') || insertError.message.includes('violates check constraint')) {
          return NextResponse.json({
            success: false,
            error: 'قيد الدور في قاعدة البيانات لا يسمح بدور "admin". يرجى تنفيذ الاستعلام التالي في Supabase SQL Editor ثم المحاولة مرة أخرى:',
            sql: `ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;\nALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'teacher', 'admin', 'pending'));\n\nUPDATE public.users SET role = 'admin', is_admin = true WHERE id = '${authData.user.id}';`,
            needsSQLFix: true,
          }, { status: 400 });
        }
        // Try using anon key (trigger might have created it between our check and insert)
        return NextResponse.json(
          { success: false, error: 'تم إنشاء حساب المصادقة لكن فشل إنشاء الملف الشخصي. حاول تسجيل الدخول.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'تم إنشاء حساب المشرف بنجاح! يمكنك الآن تسجيل الدخول.',
    });
  } catch (error) {
    console.error('[Setup] Exception:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ غير متوقع أثناء إعداد النظام' },
      { status: 500 }
    );
  }
}
