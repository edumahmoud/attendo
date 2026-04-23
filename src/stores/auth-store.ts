import { create } from 'zustand';
import type { UserProfile } from '@/lib/types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// --- Session Storage Helpers ---

const SESSION_KEY = 'attendo_session';

function storeSession(session: { access_token: string; refresh_token?: string; expires_at?: number } | null) {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function getStoredSession(): { access_token: string; refresh_token?: string; expires_at?: number } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// --- Input Sanitization Helpers ---

/** Strip HTML tags and trim whitespace to prevent XSS */
function sanitizeInput(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

/** Basic email format validation */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/** Validate name: no HTML, reasonable length */
function isValidName(name: string): boolean {
  const sanitized = sanitizeInput(name);
  return sanitized.length > 0 && sanitized.length <= 100;
}

// --- Rate Limiting ---

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_SIGN_IN_ATTEMPTS = 5;

interface RateLimitState {
  attempts: number;
  windowStart: number;
}

const signInRateLimit: RateLimitState = { attempts: 0, windowStart: Date.now() };

function checkRateLimit(): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  if (now - signInRateLimit.windowStart > RATE_LIMIT_WINDOW_MS) {
    signInRateLimit.attempts = 0;
    signInRateLimit.windowStart = now;
  }
  if (signInRateLimit.attempts >= MAX_SIGN_IN_ATTEMPTS) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - signInRateLimit.windowStart);
    return { allowed: false, retryAfterMs };
  }
  signInRateLimit.attempts++;
  return { allowed: true, retryAfterMs: 0 };
}

// --- Safe Error Messages ---

/** Map error messages to user-friendly Arabic messages */
function getSafeErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const err = error as { message?: string; code?: string; error_code?: string; status?: number; msg?: string };
    const msg = (err.message || err.msg || '').toLowerCase();
    const code = err.code || err.error_code || '';

    if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
    }
    if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
      return 'يرجى تأكيد بريدك الإلكتروني أولاً';
    }
    if (msg.includes('user already registered') || msg.includes('user_already_exists')) {
      return 'هذا البريد الإلكتروني مسجل بالفعل';
    }
    if (msg.includes('password') && msg.includes('weak')) {
      return 'كلمة المرور ضعيفة، يرجى اختيار كلمة مرور أقوى';
    }
    if (msg.includes('rate limit') || msg.includes('too many')) {
      return 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً';
    }
    if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('networkerror')) {
      return 'خطأ في الاتصال بالشبكة';
    }
    if (msg.includes('row-level security') || msg.includes('rls') || code === '42501') {
      return 'خطأ في إنشاء الملف الشخصي. يرجى المحاولة مرة أخرى أو التواصل مع الدعم';
    }
    if (msg.includes('duplicate key') || msg.includes('unique constraint') || code === '23505') {
      return 'الحساب موجود بالفعل. يرجى تسجيل الدخول';
    }
    if (msg.includes('signup is disabled') || msg.includes('signups not allowed') ||
        msg.includes('email_provider_disabled') || msg.includes('email signups are disabled') ||
        code === 'email_provider_disabled') {
      return 'التسجيل بالبريد الإلكتروني غير مفعّل حالياً. يرجى التواصل مع المشرف أو تفعيل التسجيل من إعدادات Supabase';
    }
  }
  return 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى';
}

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  initialized: boolean;

  // Actions
  setUser: (user: UserProfile | null) => void;
  initialize: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string, name: string, role: 'student' | 'teacher', gender?: 'male' | 'female') => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  initialized: false,

  setUser: (user) => set({ user, loading: false }),

  initialize: async () => {
    try {
      // Try to get the stored session token
      const storedSession = getStoredSession();

      if (storedSession?.access_token) {
        // Validate the token server-side
        try {
          const res = await fetch('/api/auth/session', {
            headers: {
              Authorization: `Bearer ${storedSession.access_token}`,
            },
          });

          if (res.ok) {
            const data = await res.json();
            if (data.profile) {
              // Also set the session on the Supabase client for RLS queries
              try {
                await supabase.auth.setSession({
                  access_token: storedSession.access_token,
                  refresh_token: storedSession.refresh_token || '',
                });
              } catch {
                // Session set may fail but we can still use the profile
              }
              set({ user: data.profile as UserProfile, loading: false, initialized: true });
              return;
            }
          }
        } catch {
          // API call failed, try Supabase client directly as fallback
        }
      }

      // Fallback: try Supabase client session
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          // Store the session for future API calls
          storeSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
          });

          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile) {
            set({ user: profile as UserProfile, loading: false, initialized: true });
            return;
          }
        }
      } catch {
        // Supabase client not available or not configured
      }

      // No valid session found
      storeSession(null);
      set({ user: null, loading: false, initialized: true });
    } catch {
      set({ user: null, loading: false, initialized: true });
    }
  },

  signInWithEmail: async (email, password) => {
    try {
      // Check if Supabase is configured
      if (!isSupabaseConfigured) {
        return { error: 'Supabase غير مضبوط. يرجى إضافة NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY في ملف .env.local' };
      }

      // Rate limiting check
      const { allowed, retryAfterMs } = checkRateLimit();
      if (!allowed) {
        const minutesLeft = Math.ceil(retryAfterMs / 60000);
        return { error: `طلبات كثيرة جداً. يرجى المحاولة بعد ${minutesLeft} دقيقة` };
      }

      // Input validation & sanitization
      const sanitizedEmail = sanitizeInput(email).toLowerCase();
      if (!isValidEmail(sanitizedEmail)) {
        return { error: 'صيغة البريد الإلكتروني غير صالحة' };
      }
      if (!password || password.length < 1) {
        return { error: 'يرجى إدخال كلمة المرور' };
      }

      // Use server-side auth proxy
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sanitizedEmail, password }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        return { error: data.error || 'البريد الإلكتروني أو كلمة المرور غير صحيحة' };
      }

      // Store the session
      if (data.session) {
        storeSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        });

        // Set the session on the Supabase client for RLS queries
        try {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token || '',
          });
        } catch {
          // Non-critical - profile is already loaded
        }
      }

      if (data.profile) {
        signInRateLimit.attempts = 0;
        set({ user: data.profile as UserProfile, loading: false });
        return { error: null };
      }

      return { error: 'لم يتم العثور على حساب. يرجى التسجيل أولاً.' };
    } catch (err) {
      console.error('[Auth] signInWithEmail error:', err);
      return { error: 'حدث خطأ غير متوقع' };
    }
  },

  signUpWithEmail: async (email, password, name, role, gender) => {
    try {
      // Check if Supabase is configured
      if (!isSupabaseConfigured) {
        return { error: 'Supabase غير مضبوط. يرجى إضافة NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY في ملف .env.local' };
      }

      // Input validation & sanitization
      const sanitizedEmail = sanitizeInput(email).toLowerCase();
      const sanitizedName = sanitizeInput(name);

      if (!isValidEmail(sanitizedEmail)) {
        return { error: 'صيغة البريد الإلكتروني غير صالحة' };
      }
      if (!isValidName(sanitizedName)) {
        return { error: 'يرجى إدخال اسم صالح (1-100 حرف)' };
      }
      if (!password || password.length < 6) {
        return { error: 'يجب أن تكون كلمة المرور 6 أحرف على الأقل' };
      }

      // Use server-side auth proxy
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: sanitizedEmail,
          password,
          name: sanitizedName,
          role,
          gender: gender || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        return { error: data.error || 'حدث خطأ أثناء التسجيل' };
      }

      if (data.profile) {
        // Store session if available
        if (data.session) {
          storeSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          });

          try {
            await supabase.auth.setSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token || '',
            });
          } catch {
            // Non-critical
          }
        }

        set({ user: data.profile as UserProfile, loading: false });
        return { error: null, needsConfirmation: false };
      }

      return { error: null, needsConfirmation: data.needsConfirmation ?? false };
    } catch (err) {
      console.error('[Auth] signUpWithEmail error:', err);
      return { error: 'حدث خطأ غير متوقع أثناء التسجيل' };
    }
  },

  signInWithGoogle: async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}`,
        },
      });

      if (error) return { error: getSafeErrorMessage(error) };
      return { error: null };
    } catch {
      return { error: 'حدث خطأ غير متوقع' };
    }
  },

  signOut: async () => {
    try {
      // Notify server
      const storedSession = getStoredSession();
      if (storedSession?.access_token) {
        try {
          await fetch('/api/auth/signout', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${storedSession.access_token}`,
            },
          });
        } catch {
          // Ignore server signout errors
        }
      }

      // Clean up local session
      storeSession(null);

      // Clean up Supabase channels
      try {
        supabase.removeAllChannels();
        await supabase.auth.signOut();
      } catch {
        // Ignore
      }
    } catch (err) {
      console.error('[Auth] signOut exception:', err);
    }
    // Always clear local state
    set({ user: null, loading: false });
  },

  updateProfile: async (updates) => {
    const { user } = get();
    if (!user) return { error: 'لم يتم تسجيل الدخول' };

    // Sanitize text fields in updates
    const sanitizedUpdates: Partial<UserProfile> = { ...updates };
    if (sanitizedUpdates.name) {
      sanitizedUpdates.name = sanitizeInput(sanitizedUpdates.name);
      if (!isValidName(sanitizedUpdates.name)) {
        return { error: 'يرجى إدخال اسم صالح' };
      }
    }
    if (sanitizedUpdates.email) {
      sanitizedUpdates.email = sanitizeInput(sanitizedUpdates.email).toLowerCase();
      if (!isValidEmail(sanitizedUpdates.email)) {
        return { error: 'صيغة البريد الإلكتروني غير صالحة' };
      }
    }

    try {
      // Use server-side profile update to bypass RLS
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, updates: sanitizedUpdates }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        return { error: data.error || 'حدث خطأ أثناء التحديث' };
      }

      set({ user: { ...user, ...sanitizedUpdates } });
      return { error: null };
    } catch {
      return { error: 'حدث خطأ غير متوقع' };
    }
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;

    try {
      const storedSession = getStoredSession();
      const headers: Record<string, string> = {};
      if (storedSession?.access_token) {
        headers['Authorization'] = `Bearer ${storedSession.access_token}`;
      }

      const res = await fetch('/api/auth/session', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          set({ user: data.profile as UserProfile });
          return;
        }
      }
    } catch {
      // Fallback
    }

    // Fallback: try Supabase client directly
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile) {
        set({ user: profile as UserProfile });
      }
    } catch {
      // Ignore
    }
  },
}));
