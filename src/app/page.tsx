'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, Loader2, BookOpen, BrainCircuit, Users, Shield } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import LoginForm from '@/components/auth/login-form';
import RegisterForm from '@/components/auth/register-form';
import RoleSelection from '@/components/auth/role-selection';
import StudentDashboard from '@/components/student/student-dashboard';
import TeacherDashboard from '@/components/teacher/teacher-dashboard';
import AdminDashboard from '@/components/admin/admin-dashboard';
import QuizView from '@/components/shared/quiz-view';
import SummaryView from '@/components/shared/summary-view';

type AuthMode = 'login' | 'register';

export default function Home() {
  const { user, loading, initialized, initialize, signOut } = useAuthStore();
  const { currentPage, viewingQuizId, viewingSummaryId, setCurrentPage, reviewScoreId } = useAppStore();
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Set correct page when user state changes
  useEffect(() => {
    if (!initialized) return;
    
    if (user) {
      if (user.role === 'pending') {
        // User hasn't selected a role yet - show role selection
        setCurrentPage('role-selection');
      } else if (currentPage === 'auth' || currentPage === 'role-selection') {
        const targetPage = user.role === 'admin' ? 'admin-dashboard' : user.role === 'teacher' ? 'teacher-dashboard' : 'student-dashboard';
        setCurrentPage(targetPage);
      }
    } else {
      // No user = always go to auth
      setCurrentPage('auth');
    }
  }, [user, initialized, setCurrentPage]);

  // Loading state
  if (loading || !initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50" dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <GraduationCap className="w-9 h-9 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 animate-ping" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">جاري التحميل...</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // Auth pages (login / register)
  if (!user || currentPage === 'auth') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-600 to-teal-700" dir="rtl">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute top-1/4 left-1/4 w-60 h-60 bg-emerald-400/10 rounded-full blur-2xl" />
        </div>

        {/* Feature badges at top */}
        <div className="absolute top-8 left-0 right-0 flex justify-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex items-center gap-6 text-white/70"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>ذكاء اصطناعي</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <BookOpen className="w-3.5 h-3.5" />
              <span>تلخيص ذكي</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Users className="w-3.5 h-3.5" />
              <span>متابعة الطلاب</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Shield className="w-3.5 h-3.5" />
              <span>آمن وموثوق</span>
            </div>
          </motion.div>
        </div>

        {/* Auth form with mode toggle */}
        <div className="relative z-10 w-full max-w-md">
          <AnimatePresence mode="wait">
            {authMode === 'login' ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.3 }}
              >
                <LoginForm onSwitchToRegister={() => setAuthMode('register')} />
              </motion.div>
            ) : (
              <motion.div
                key="register"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <RegisterForm onSwitchToLogin={() => setAuthMode('login')} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // Role selection (for Google OAuth users without profile)
  if (currentPage === 'role-selection') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-600 to-teal-700" dir="rtl">
        <RoleSelection />
      </div>
    );
  }

  // Helper: get dashboard page for current user role
  const getDashboardPage = () => {
    if (user.role === 'admin') return 'admin-dashboard';
    if (user.role === 'teacher') return 'teacher-dashboard';
    return 'student-dashboard';
  };

  // Quiz view
  if (currentPage === 'quiz' && viewingQuizId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-teal-50" dir="rtl">
        <QuizView
          quizId={viewingQuizId}
          onBack={() => setCurrentPage(getDashboardPage())}
          profile={user}
          reviewScoreId={reviewScoreId || undefined}
        />
      </div>
    );
  }

  // Summary view
  if (currentPage === 'summary' && viewingSummaryId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-teal-50" dir="rtl">
        <SummaryView
          summaryId={viewingSummaryId}
          onBack={() => setCurrentPage(getDashboardPage())}
        />
      </div>
    );
  }

  // Admin dashboard
  if (user.role === 'admin' || currentPage === 'admin-dashboard') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100" dir="rtl">
        <AdminDashboard
          profile={user}
          onSignOut={async () => {
            await signOut();
            setCurrentPage('auth');
          }}
        />
      </div>
    );
  }

  // Teacher dashboard
  if (user.role === 'teacher' || currentPage === 'teacher-dashboard') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-emerald-50/30" dir="rtl">
        <TeacherDashboard
          profile={user}
          onSignOut={async () => {
            await signOut();
            setCurrentPage('auth');
          }}
        />
      </div>
    );
  }

  // Student dashboard (default)
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-emerald-50/30" dir="rtl">
      <StudentDashboard
        profile={user}
        onSignOut={async () => {
          await signOut();
          setCurrentPage('auth');
        }}
      />
    </div>
  );
}
