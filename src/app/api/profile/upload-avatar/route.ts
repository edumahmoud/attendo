import { NextResponse } from 'next/server';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

export async function POST(request: Request) {
  try {
    if (!isSupabaseServerConfigured) {
      return NextResponse.json({ success: false, error: 'Service key not configured' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('avatar') as File;
    const userId = formData.get('userId') as string;

    if (!file || !userId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'حجم الصورة يجب أن يكون أقل من 2 ميجابايت' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ success: false, error: 'نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WebP' }, { status: 400 });
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabaseServer.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      return NextResponse.json({ success: false, error: 'فشل في رفع الصورة' }, { status: 500 });
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseServer.storage
      .from('avatars')
      .getPublicUrl(fileName);

    // Update user profile
    const { error: updateError } = await supabaseServer
      .from('users')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    if (updateError) {
      return NextResponse.json({ success: false, error: 'فشل في تحديث الملف الشخصي' }, { status: 500 });
    }

    return NextResponse.json({ success: true, avatarUrl: publicUrl });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
