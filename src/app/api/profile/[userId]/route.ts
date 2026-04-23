import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    // Fetch user profile - try with username first, fallback without
    let profile = null;
    const { data: profileWithUsername, error: profileError } = await supabaseServer
      .from('users')
      .select('id, name, username, role, avatar_url, title_id, gender, created_at')
      .eq('id', userId)
      .single();

    if (profileError) {
      // If username column doesn't exist, try without it
      if (profileError.message?.includes('username') || profileError.code === 'PGRST204') {
        const { data: profileNoUsername, error: fallbackError } = await supabaseServer
          .from('users')
          .select('id, name, role, avatar_url, title_id, gender, created_at')
          .eq('id', userId)
          .single();

        if (fallbackError || !profileNoUsername) {
          return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
        }
        profile = { ...profileNoUsername, username: null };
      } else {
        return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 });
      }
    } else {
      profile = profileWithUsername;
    }

    // Fetch public files
    const { data: publicFiles, error: filesError } = await supabaseServer
      .from('user_files')
      .select('id, file_name, file_type, file_size, created_at')
      .eq('user_id', userId)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false });

    if (filesError) {
      console.error('[profile] Error fetching files:', filesError);
    }

    return NextResponse.json({
      profile,
      publicFiles: publicFiles || [],
    });
  } catch (err) {
    console.error('[profile] Unexpected error:', err);
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}
