// =====================================================
// Supabase Auth Helper for API Routes
// =====================================================
// Provides authentication utilities for Next.js API routes.
// Creates a per-request Supabase client that uses the user's
// access token from the Authorization header, ensuring RLS
// policies are properly enforced.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

export interface AuthResult {
  user: {
    id: string;
    email?: string;
    role?: string;
  };
  supabase: SupabaseClient;
}

/**
 * Extract and verify the authenticated user from the request.
 * Creates a Supabase client scoped to the user's access token.
 * Returns null if authentication fails.
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthResult | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  if (!token || token.trim().length === 0) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;

  // Create a Supabase client that uses the user's JWT token
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return {
    user: {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role,
    },
    supabase,
  };
}

/**
 * Get the user's profile from the public.users table.
 * Returns null if the profile doesn't exist.
 */
export async function getUserProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; email: string; name: string; role: string; is_admin?: boolean } | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, is_admin')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data;
}
