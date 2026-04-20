import { NextResponse } from 'next/server';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    if (!isSupabaseServerConfigured) {
      return NextResponse.json(
        { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY غير مضبوط' },
        { status: 400 }
      );
    }

    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'معرف المستخدم مطلوب' }, { status: 400 });
    }

    const { error } = await supabaseServer.auth.admin.deleteUser(userId);
    
    if (error) {
      console.error('[Admin] Error deleting auth user:', error);
      return NextResponse.json({ success: false, error: 'فشل في حذف حساب المصادقة' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Admin] Exception:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}
