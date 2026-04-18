import { create } from 'zustand';
import type { UserProfile } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  initialized: boolean;
  
  // Actions
  setUser: (user: UserProfile | null) => void;
  initialize: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string, name: string, role: 'student' | 'teacher') => Promise<{ error: string | null }>;
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return { error: 'فشل في الحصول على بيانات المستخدم' };
      
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      
      if (profile) {
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
      const { error: authError } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          data: { name, role }
        }
      });
      
      if (authError) return { error: authError.message };
      
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return { error: 'فشل في إنشاء الحساب' };
      
      // Create profile in users table
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authUser.id,
          email,
          name,
          role,
        });
      
      if (profileError) return { error: profileError.message };
      
      // Fetch the created profile (with teacher_code if teacher)
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      
      if (profile) {
        set({ user: profile as UserProfile, loading: false });
        return { error: null };
      }
      
      return { error: null };
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
      
      if (error) return { error: error.message };
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
    
    try {
      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);
      
      if (error) return { error: error.message };
      
      set({ user: { ...user, ...updates } });
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
