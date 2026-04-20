import { NextResponse } from 'next/server';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

export async function PATCH(request: Request) {
  try {
    if (!isSupabaseServerConfigured) {
      return NextResponse.json({ success: false, error: 'Service key not configured' }, { status: 400 });
    }

    const { quizId, updates } = await request.json();
    if (!quizId || !updates) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from('quizzes')
      .update(updates)
      .eq('id', quizId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
