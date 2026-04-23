// =====================================================
// AttenDo - Session Tracker Utility
// Tracks user sessions, enforces single-session concurrency
// =====================================================

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const SESSION_STORAGE_KEY = 'examy_session_id';
const SESSION_CHECK_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Generate a device fingerprint from browser properties.
 * Only runs on the client side.
 */
function generateFingerprint(): string {
  if (typeof window === 'undefined') return '';

  const components = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    navigator.language,
    String(new Date().getTimezoneOffset()),
  ];
  const raw = components.join('|');

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Register a new session for the user.
 * Deactivates all other active sessions for this user (single-session enforcement).
 * Stores the new session ID in sessionStorage.
 */
export async function registerSession(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!isSupabaseConfigured) return;

  try {
    const fingerprint = generateFingerprint();
    if (!fingerprint) return;

    // Insert new session record
    const { data, error } = await supabase
      .from('user_sessions')
      .insert({
        user_id: userId,
        device_fingerprint: fingerprint,
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[SessionTracker] Failed to register session:', error.message);
      return;
    }

    const newSessionId = data.id;

    // Store session ID in sessionStorage for later reference
    sessionStorage.setItem(SESSION_STORAGE_KEY, newSessionId);

    // Deactivate all other sessions for this user (except the new one)
    await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .eq('user_id', userId)
      .neq('id', newSessionId);
  } catch (err) {
    // Don't block login if session tracking fails (e.g. table doesn't exist)
    console.warn('[SessionTracker] registerSession error:', err);
  }
}

/**
 * Validate that the current session is still the active one.
 * Returns false if another session has taken over (user logged in from another device).
 */
export async function validateSession(userId: string): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  if (!isSupabaseConfigured) return true;

  try {
    const sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) {
      // No session ID stored — could be a page refresh before registerSession completed
      // Check if there's any active session for this fingerprint
      const fingerprint = generateFingerprint();
      if (!fingerprint) return true;

      const { data: activeSession } = await supabase
        .from('user_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('device_fingerprint', fingerprint)
        .eq('is_active', true)
        .maybeSingle();

      if (activeSession) {
        // Re-store the session ID
        sessionStorage.setItem(SESSION_STORAGE_KEY, activeSession.id);
        return true;
      }

      // No active session for this fingerprint — another session may have deactivated it
      return false;
    }

    // Check if our session is still active
    const { data: session } = await supabase
      .from('user_sessions')
      .select('is_active')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (!session) {
      // Session record not found — could have been deleted
      return false;
    }

    if (!session.is_active) {
      // Session was deactivated by another login
      return false;
    }

    // Update last_activity timestamp
    await supabase
      .from('user_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('id', sessionId);

    return true;
  } catch (err) {
    // Don't force logout on validation errors (e.g. table doesn't exist)
    console.warn('[SessionTracker] validateSession error:', err);
    return true;
  }
}

/**
 * End the current session by marking it as inactive.
 * Called during sign-out.
 */
export async function endSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!isSupabaseConfigured) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  try {
    const sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) return;

    await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .eq('id', sessionId);

    // Clear session ID from sessionStorage
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (err) {
    // Don't block sign-out if session tracking fails
    console.warn('[SessionTracker] endSession error:', err);
    // Still clean up sessionStorage
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

/**
 * Start periodic session validation.
 * Returns a cleanup function that clears the interval.
 */
export function startSessionValidation(
  userId: string,
  onSessionInvalidated: () => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  if (!isSupabaseConfigured) return () => {};

  const intervalId = setInterval(async () => {
    const isValid = await validateSession(userId);
    if (!isValid) {
      clearInterval(intervalId);
      onSessionInvalidated();
    }
  }, SESSION_CHECK_INTERVAL_MS);

  return () => clearInterval(intervalId);
}
