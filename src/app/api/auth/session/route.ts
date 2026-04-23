import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

/**
 * GET /api/auth/session
 * Get the current session and profile using the access token from the Authorization header.
 * Header: Authorization: Bearer <access_token>
 */
export async function GET(request: NextRequest) {
  try {
    if (!isSupabaseServerConfigured) {
      return NextResponse.json({ session: null, profile: null });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ session: null, profile: null });
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token || token.trim().length === 0) {
      return NextResponse.json({ session: null, profile: null });
    }

    // Verify the token and get user info
    const { data: { user }, error } = await supabaseServer.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json({ session: null, profile: null });
    }

    // Get profile
    const { data: profile } = await supabaseServer
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      session: {
        access_token: token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          user_metadata: user.user_metadata,
        },
      },
      profile: profile || null,
    });
  } catch {
    return NextResponse.json({ session: null, profile: null });
  }
}
