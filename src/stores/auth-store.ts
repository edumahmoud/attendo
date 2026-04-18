import { create } from 'zustand';
import type { UserProfile } from '@/lib/types';
import { supabase } from '@/lib/supabase';

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

/** Map Supabase error messages to user-friendly Arabic messages */
function getSafeErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: string }).message.toLowerCase();
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
    if (msg.includes('network')) {
      return 'خطأ في الاتصال بالشبكة';
    }
  }
  // Generic message - don't leak internal details
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
  signUpWithEmail: (email: string, password: string, name: string, role: 'student' | 'teacher') => Promise<{ error: string | null; needsConfirmation?: boolean }>;
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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          set({ user: profile as UserProfile, loading: false, initialized: true });
        } else {
          set({ loading: false, initialized: true });
        }
      } else {
        set({ user: null, loading: false, initialized: true });
      }
    } catch {
      set({ user: null, loading: false, initialized: true });
    }
    
    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          set({ user: profile as UserProfile, loading: false });
        }
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, loading: false });
      }
    });
  },
  
  signInWithEmail: async (email, password) => {
    try {
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

      const { error } = await supabase.auth.signInWithPassword({ email: sanitizedEmail, password });
      if (error) return { error: getSafeErrorMessage(error) };
      
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return { error: 'فشل في الحصول على بيانات المستخدم' };
      
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      
      if (profile) {
        // Reset rate limit on successful login
        signInRateLimit.attempts = 0;
        set({ user: profile as UserProfile, loading: false });
        return { error: null };
      } else {
        return { error: 'لم يتم العثور على حساب. يرجى التسجيل أولاً.' };
      }
    } catch {
      return { error: 'حدث خطأ غير متوقع' };
    }
  },
  
  signUpWithEmail: async (email, password, name, role) => {
    try {
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

      const { data: signUpData, error: authError } = await supabase.auth.signUp({ 
        email: sanitizedEmail, 
        password,
        options: {
          data: { name: sanitizedName, role }
        }
      });
      
      if (authError) return { error: getSafeErrorMessage(authError) };

      // Check if email confirmation is required
      // If signUpData.user exists but session is null, user needs to confirm email
      const needsConfirmation = !!signUpData.user && !signUpData.session;
      
      if (needsConfirmation) {
        return { error: null, needsConfirmation: true };
      }

      // Auto-confirmed: session is available immediately
      const authUser = signUpData.user;
      if (!authUser) return { error: 'فشل في إنشاء الحساب' };
      
      // Create profile in users table
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authUser.id,
          email: sanitizedEmail,
          name: sanitizedName,
          role,
        });
      
      if (profileError) return { error: getSafeErrorMessage(profileError) };
      
      // Fetch the created profile (with teacher_code if teacher)
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      
      if (profile) {
        set({ user: profile as UserProfile, loading: false });
        return { error: null, needsConfirmation: false };
      }
      
      return { error: null, needsConfirmation: false };
    } catch {
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
    await supabase.auth.signOut();
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
      const { error } = await supabase
        .from('users')
        .update(sanitizedUpdates)
        .eq('id', user.id);
      
      if (error) return { error: getSafeErrorMessage(error) };
      
      set({ user: { ...user, ...sanitizedUpdates } });
      return { error: null };
    } catch {
      return { error: 'حدث خطأ غير متوقع' };
    }
  },
  
  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (profile) {
      set({ user: profile as UserProfile });
    }
  },
}));
