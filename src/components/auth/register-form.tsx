'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  GraduationCap,
  User,
  BookOpen,
  UserCheck,
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

interface RegisterFormProps {
  onSwitchToLogin?: () => void;
}

/** Password strength calculator */
function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'ضعيفة', color: 'bg-red-500' };
  if (score <= 2) return { score, label: 'متوسطة', color: 'bg-yellow-500' };
  if (score <= 3) return { score, label: 'جيدة', color: 'bg-blue-500' };
  return { score, label: 'قوية', color: 'bg-emerald-500' };
}

export default function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const { signUpWithEmail, signInWithGoogle } = useAuthStore();
  const { setCurrentPage } = useAppStore();

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('يرجى إدخال الاسم');
      return;
    }
    if (!email.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني');
      return;
    }
    if (!password.trim()) {
      toast.error('يرجى إدخال كلمة المرور');
      return;
    }
    if (password.length < 6) {
      toast.error('يجب أن تكون كلمة المرور 6 أحرف على الأقل');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }
    if (!role) {
      toast.error('يرجى اختيار نوع الحساب');
      return;
    }

    setIsLoading(true);
    try {
      const { error, needsConfirmation } = await signUpWithEmail(email, password, name, role);
      if (error) {
        toast.error(error);
        return;
      }

      if (needsConfirmation) {
        toast.success('تم إرسال رابط التأكيد إلى بريدك الإلكتروني. يرجى التحقق من بريدك والمتابعة.');
      } else {
        toast.success('تم إنشاء الحساب بنجاح');
        if (role === 'teacher') {
          setCurrentPage('teacher-dashboard');
        } else {
          setCurrentPage('student-dashboard');
        }
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        toast.error(error);
      }
      // Google OAuth redirects away - the auth state change listener
      // in the auth store will handle navigation after redirect back
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSwitchToLogin = () => {
    if (onSwitchToLogin) {
      onSwitchToLogin();
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
              <GraduationCap className="h-8 w-8 text-white" />
            </motion.div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              إنشاء حساب جديد
            </CardTitle>
            <CardDescription className="text-gray-500 mt-2">
              انضم إلى إكسامي وابدأ رحلتك التعليمية
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name Field */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 }}
                className="space-y-2"
              >
                <Label htmlFor="reg-name" className="text-gray-700 font-medium">
                  الاسم الكامل
                </Label>
                <div className="relative">
                  <Input
                    id="reg-name"
                    type="text"
                    placeholder="أدخل اسمك الكامل"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pr-10 h-11 bg-gray-50/50 border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20 text-right"
                    disabled={isLoading}
                    maxLength={100}
                  />
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </motion.div>

              {/* Email Field */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-2"
              >
                <Label htmlFor="reg-email" className="text-gray-700 font-medium">
                  البريد الإلكتروني
                </Label>
                <div className="relative">
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="أدخل بريدك الإلكتروني"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pr-10 h-11 bg-gray-50/50 border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20 text-right"
                    disabled={isLoading}
                    dir="ltr"
                    maxLength={254}
                  />
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </motion.div>

              {/* Password Field with Strength Indicator */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 }}
                className="space-y-2"
              >
                <Label htmlFor="reg-password" className="text-gray-700 font-medium">
                  كلمة المرور
                </Label>
                <div className="relative">
                  <Input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="أنشئ كلمة مرور قوية"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10 pl-10 h-11 bg-gray-50/50 border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20 text-right"
                    disabled={isLoading}
                    dir="ltr"
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {/* Password Strength Indicator */}
                {password.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <div
                          key={level}
                          className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                            level <= passwordStrength.score
                              ? passwordStrength.color
                              : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-xs font-medium ${
                      passwordStrength.score <= 1 ? 'text-red-500' :
                      passwordStrength.score <= 2 ? 'text-yellow-600' :
                      passwordStrength.score <= 3 ? 'text-blue-600' :
                      'text-emerald-600'
                    }`}>
                      قوة كلمة المرور: {passwordStrength.label}
                    </p>
                  </div>
                )}
              </motion.div>

              {/* Confirm Password Field */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-2"
              >
                <Label
                  htmlFor="reg-confirm-password"
                  className="text-gray-700 font-medium"
                >
                  تأكيد كلمة المرور
                </Label>
                <div className="relative">
                  <Input
                    id="reg-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="أعد إدخال كلمة المرور"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pr-10 pl-10 h-11 bg-gray-50/50 border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20 text-right"
                    disabled={isLoading}
                    dir="ltr"
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </motion.div>

              {/* Role Selection */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.45 }}
                className="space-y-3"
              >
                <Label className="text-gray-700 font-medium">نوع الحساب</Label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Student Card */}
                  <button
                    type="button"
                    onClick={() => setRole('student')}
                    className={`relative group rounded-xl border-2 p-4 text-center transition-all duration-300 ${
                      role === 'student'
                        ? 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-500/10'
                        : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50'
                    }`}
                  >
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex flex-col items-center gap-2"
                    >
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 ${
                          role === 'student'
                            ? 'bg-emerald-500 text-white shadow-lg'
                            : 'bg-gray-100 text-gray-500 group-hover:bg-emerald-100 group-hover:text-emerald-600'
                        }`}
                      >
                        <BookOpen className="h-6 w-6" />
                      </div>
                      <span
                        className={`text-sm font-semibold transition-colors ${
                          role === 'student'
                            ? 'text-emerald-700'
                            : 'text-gray-600'
                        }`}
                      >
                        طالب
                      </span>
                      {role === 'student' && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-1 -left-1 h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center"
                        >
                          <svg
                            className="h-3 w-3 text-white"
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
                    className={`relative group rounded-xl border-2 p-4 text-center transition-all duration-300 ${
                      role === 'teacher'
                        ? 'border-teal-500 bg-teal-50 shadow-md shadow-teal-500/10'
                        : 'border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/50'
                    }`}
                  >
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex flex-col items-center gap-2"
                    >
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 ${
                          role === 'teacher'
                            ? 'bg-teal-500 text-white shadow-lg'
                            : 'bg-gray-100 text-gray-500 group-hover:bg-teal-100 group-hover:text-teal-600'
                        }`}
                      >
                        <UserCheck className="h-6 w-6" />
                      </div>
                      <span
                        className={`text-sm font-semibold transition-colors ${
                          role === 'teacher'
                            ? 'text-teal-700'
                            : 'text-gray-600'
                        }`}
                      >
                        معلم
                      </span>
                      {role === 'teacher' && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-1 -left-1 h-5 w-5 rounded-full bg-teal-500 flex items-center justify-center"
                        >
                          <svg
                            className="h-3 w-3 text-white"
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
                  disabled={isLoading || isGoogleLoading}
                  className="w-full h-11 text-base font-semibold bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25 transition-all duration-300 hover:shadow-emerald-500/40"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>جارٍ إنشاء الحساب...</span>
                    </>
                  ) : (
                    'إنشاء حساب'
                  )}
                </Button>
              </motion.div>
            </form>

            {/* Divider */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="relative my-6"
            >
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-4 text-gray-400">أو</span>
              </div>
            </motion.div>

            {/* Google Sign In */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
            >
              <Button
                type="button"
                variant="outline"
                disabled={isLoading || isGoogleLoading}
                onClick={handleGoogleSignIn}
                className="w-full h-11 text-base font-medium border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
              >
                {isGoogleLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                ) : (
                  <svg className="h-5 w-5 ml-2" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                )}
                <span>التسجيل بحساب جوجل</span>
              </Button>
            </motion.div>

            {/* Login Link - uses onSwitchToLogin prop */}
            {onSwitchToLogin && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="mt-6 text-center"
              >
                <p className="text-sm text-gray-500">
                  لديك حساب بالفعل؟{' '}
                  <button
                    type="button"
                    onClick={handleSwitchToLogin}
                    className="font-semibold text-emerald-600 hover:text-emerald-700 transition-colors hover:underline"
                  >
                    سجّل دخولك
                  </button>
                </p>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
