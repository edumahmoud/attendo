'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2,
  GraduationCap,
  BookOpen,
  UserCheck,
  Sparkles,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { toast } from 'sonner';
import type { UserRole } from '@/lib/types';

export default function RoleSelection() {
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { user, updateProfile } = useAuthStore();
  const { setCurrentPage } = useAppStore();

  // Pre-fill name from Google account if available
  const displayName = name || user?.name || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!displayName.trim()) {
      toast.error('يرجى إدخال اسمك');
      return;
    }
    if (!role) {
      toast.error('يرجى اختيار نوع الحساب');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await updateProfile({
        name: displayName.trim(),
        role,
      });

      if (error) {
        toast.error(error);
        return;
      }

      toast.success('تم إعداد حسابك بنجاح');
      if (role === 'teacher') {
        setCurrentPage('teacher-dashboard');
      } else {
        setCurrentPage('student-dashboard');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div dir="rtl" className="w-full max-w-md mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg"
            >
              <Sparkles className="h-8 w-8 text-white" />
            </motion.div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              مرحباً بك!
            </CardTitle>
            <CardDescription className="text-gray-500 mt-2">
              أكمل إعداد حسابك لتبدأ رحلتك مع أتيندو
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name Field */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-2"
              >
                <Label htmlFor="role-name" className="text-gray-700 font-medium">
                  الاسم الكامل
                </Label>
                <div className="relative">
                  <Input
                    id="role-name"
                    type="text"
                    placeholder="أدخل اسمك الكامل"
                    value={name || user?.name || ''}
                    onChange={(e) => setName(e.target.value)}
                    className="pr-10 h-11 bg-gray-50/50 border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20 text-right"
                    disabled={isLoading}
                  />
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </motion.div>

              {/* Role Selection */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-3"
              >
                <Label className="text-gray-700 font-medium">
                  كيف تريد استخدام أتيندو؟
                </Label>
                <div className="space-y-3">
                  {/* Student Card */}
                  <button
                    type="button"
                    onClick={() => setRole('student')}
                    className={`relative w-full group rounded-xl border-2 p-5 text-right transition-all duration-300 ${
                      role === 'student'
                        ? 'border-emerald-500 bg-gradient-to-l from-emerald-50 to-teal-50 shadow-lg shadow-emerald-500/15'
                        : 'border-gray-200 bg-white hover:border-emerald-300 hover:shadow-md'
                    }`}
                  >
                    <motion.div
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-4"
                    >
                      <div
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ${
                          role === 'student'
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                            : 'bg-gray-100 text-gray-500 group-hover:bg-emerald-100 group-hover:text-emerald-600'
                        }`}
                      >
                        <BookOpen className="h-7 w-7" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3
                          className={`text-lg font-bold transition-colors ${
                            role === 'student'
                              ? 'text-emerald-700'
                              : 'text-gray-800'
                          }`}
                        >
                          طالب
                        </h3>
                        <p className="text-sm text-gray-500 mt-0.5">
                          تلخيص الدروس، حل الاختبارات، وتتبع تقدمك
                        </p>
                      </div>
                      {role === 'student' && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500"
                        >
                          <svg
                            className="h-4 w-4 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </motion.div>
                      )}
                    </motion.div>
                  </button>

                  {/* Teacher Card */}
                  <button
                    type="button"
                    onClick={() => setRole('teacher')}
                    className={`relative w-full group rounded-xl border-2 p-5 text-right transition-all duration-300 ${
                      role === 'teacher'
                        ? 'border-teal-500 bg-gradient-to-l from-teal-50 to-emerald-50 shadow-lg shadow-teal-500/15'
                        : 'border-gray-200 bg-white hover:border-teal-300 hover:shadow-md'
                    }`}
                  >
                    <motion.div
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-4"
                    >
                      <div
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ${
                          role === 'teacher'
                            ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30'
                            : 'bg-gray-100 text-gray-500 group-hover:bg-teal-100 group-hover:text-teal-600'
                        }`}
                      >
                        <UserCheck className="h-7 w-7" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3
                          className={`text-lg font-bold transition-colors ${
                            role === 'teacher'
                              ? 'text-teal-700'
                              : 'text-gray-800'
                          }`}
                        >
                          معلم
                        </h3>
                        <p className="text-sm text-gray-500 mt-0.5">
                          إنشاء الاختبارات، متابعة الطلاب، وتحليل الأداء
                        </p>
                      </div>
                      {role === 'teacher' && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500"
                        >
                          <svg
                            className="h-4 w-4 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </motion.div>
                      )}
                    </motion.div>
                  </button>
                </div>
              </motion.div>

              {/* Submit Button */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Button
                  type="submit"
                  disabled={isLoading || !role}
                  className="w-full h-12 text-base font-semibold bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25 transition-all duration-300 hover:shadow-emerald-500/40 disabled:opacity-60"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>جارٍ إعداد الحساب...</span>
                    </>
                  ) : (
                    <>
                      <GraduationCap className="h-5 w-5" />
                      <span>ابدأ الآن</span>
                    </>
                  )}
                </Button>
              </motion.div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
