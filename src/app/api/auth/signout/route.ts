import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

/**
 * POST /api/auth/signout
 * Sign out the user by invalidating their session server-side.
 * Header: Authorization: Bearer <access_token>
 */
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseServerConfigured) {
      return NextResponse.json({ success: true });
    }

    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      if (token) {
        // Try to sign out the user on the server side
        try {
          await supabaseServer.auth.admin.signOut(token);
        } catch {
          // Ignore signout errors - the client will clear local state anyway
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}
