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

    const { title, content, userIds } = await request.json();
    if (!title || !content) {
      return NextResponse.json({ success: false, error: 'العنوان والمحتوى مطلوبان' }, { status: 400 });
    }

    const notifications = userIds.map((userId: string) => ({
      user_id: userId,
      title,
      content,
      type: 'system',
      is_read: false,
    }));

    const { error } = await supabaseServer.from('notifications').insert(notifications);

    if (error) {
      console.error('[Admin] Error sending announcement:', error);
      return NextResponse.json({ success: false, error: 'فشل في إرسال الإعلان' }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: notifications.length });
  } catch (error) {
    console.error('[Admin] Exception:', error);
    return NextResponse.json({ success: false, error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}
