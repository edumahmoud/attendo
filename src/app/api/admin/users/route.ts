import { NextRequest, NextResponse } from 'next/server';

// This API route handles admin user management
// It uses the Supabase service role key to bypass RLS

export async function GET(request: NextRequest) {
  // Fetch all users using service role
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: NextRequest) {
  const { userId } = await request.json();
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
