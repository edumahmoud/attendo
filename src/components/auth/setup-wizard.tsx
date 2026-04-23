'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  GraduationCap,
  User,
  Shield,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Database,
  Settings,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import { toast } from 'sonner';

/** Password strength calculator */
function getPasswordStrength(password: string) {
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

interface SetupWizardProps {
  onSetupComplete: () => void;
}

export default function SetupWizard({ onSetupComplete }: SetupWizardProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [needsSQLFix, setNeedsSQLFix] = useState(false);
  const [sqlCode, setSqlCode] = useState('');
  const [copiedSQL, setCopiedSQL] = useState(false);

  const { signInWithEmail } = useAuthStore();
  const { setCurrentPage } = useAppStore();
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('يرجى إدخال الاسم');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('يرجى إدخال بريد إلكتروني صالح');
      return;
    }
    if (password.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.toLowerCase().trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.needsSQLFix && data.sql) {
          setNeedsSQLFix(true);
          setSqlCode(data.sql);
        }
        toast.error(data.error || 'حدث خطأ أثناء إعداد النظام');
        return;
      }

      // Setup succeeded - now sign in automatically
      setSetupComplete(true);
      toast.success('تم إنشاء حساب المشرف بنجاح!');

      // Wait a moment then sign in
      setTimeout(async () => {
        const { error: signInError } = await signInWithEmail(email, password);
        if (signInError) {
          toast.error('تم إنشاء الحساب بنجاح. يرجى تسجيل الدخول يدوياً.');
          onSetupComplete();
        } else {
          const user = useAuthStore.getState().user;
          if (user) {
            setCurrentPage('admin-dashboard');
            onSetupComplete();
          }
        }
      }, 1500);
    } catch {
      toast.error('حدث خطأ غير متوقع أثناء إعداد النظام');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySQL = async () => {
    try {
      await navigator.clipboard.writeText(sqlCode);
      setCopiedSQL(true);
      toast.success('تم نسخ الاستعلام');
      setTimeout(() => setCopiedSQL(false), 2000);
    } catch {
      toast.error('فشل في نسخ الاستعلام');
    }
  };

  // If setup is complete, show success
  if (setupComplete) {
    return (
      <div dir="rtl" className="w-full max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
        >
          <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm">
            <CardContent className="pt-10 pb-8 flex flex-col items-center gap-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100"
              >
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </motion.div>
              <h2 className="text-xl font-bold text-gray-900 text-center">
                تم إعداد النظام بنجاح! 🎉
              </h2>
              <p className="text-sm text-gray-500 text-center">
                جارٍ تسجيل الدخول تلقائياً...
              </p>
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // If SQL fix is needed, show instructions
  if (needsSQLFix) {
    return (
      <div dir="rtl" className="w-full max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm">
            <CardHeader className="text-center pb-2">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100"
              >
                <AlertTriangle className="h-8 w-8 text-amber-600" />
              </motion.div>
              <CardTitle className="text-xl font-bold text-gray-900">
                يحتاج إعداد إضافي
              </CardTitle>
              <CardDescription className="text-gray-500 mt-2">
                قيد الدور في قاعدة البيانات لا يدعم دور المشرف بعد. يرجى تنفيذ الاستعلام التالي.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Steps */}
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold">
                    1
                  </div>
                  <p className="text-sm text-blue-800">
                    اذهب إلى <strong>Supabase Dashboard → SQL Editor</strong>
                  </p>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white text-xs font-bold">
                    2
                  </div>
                  <p className="text-sm text-blue-800">
                    انسخ والصق الاستعلام التالي ثم اضغط <strong>Run</strong>
                  </p>
                </div>
              </div>

              {/* SQL Code */}
              <div className="relative rounded-lg bg-gray-900 p-4 text-sm font-mono text-green-400 overflow-x-auto" dir="ltr">
                <button
                  type="button"
                  onClick={handleCopySQL}
                  className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600 transition-colors"
                >
                  {copiedSQL ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedSQL ? 'تم النسخ' : 'نسخ'}
                </button>
                <pre className="whitespace-pre-wrap text-xs">{sqlCode}</pre>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  بعد تنفيذ الاستعلام، اضغط الزر أدناه لإعادة المحاولة.
                </p>
              </div>

              {/* Retry button */}
              <Button
                type="button"
                onClick={() => {
                  setNeedsSQLFix(false);
                  setSqlCode('');
                }}
                className="w-full h-11 text-base font-semibold bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25"
              >
                إعادة المحاولة
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="w-full max-w-md mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            {/* Logo with special setup animation */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 150 }}
              className="mx-auto mb-4 relative"
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-700 shadow-xl shadow-emerald-500/30">
                <GraduationCap className="h-10 w-10 text-white" />
              </div>
              {/* Admin badge */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6, type: 'spring', stiffness: 300 }}
                className="absolute -bottom-2 -left-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 shadow-lg"
              >
                <Shield className="h-4 w-4 text-amber-900" />
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <CardTitle className="text-2xl font-bold text-gray-900">
                مرحباً بك في إكسامي! 🎓
              </CardTitle>
              <CardDescription className="text-gray-500 mt-2 text-base">
                أنشئ حساب المشرف الأول للنظام
              </CardDescription>
            </motion.div>

            {/* Info banner */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-right"
            >
              <Settings className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700">
                هذا الإعداد يظهر <strong>مرة واحدة فقط</strong> عند أول استخدام للنظام. بعد إنشاء حساب المشرف، يمكنك إدارة المستخدمين والصلاحيات من لوحة التحكم.
              </p>
            </motion.div>
          </CardHeader>

          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name Field */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.55 }}
                className="space-y-2"
              >
                <Label htmlFor="setup-name" className="text-gray-700 font-medium">
                  الاسم الكامل
                </Label>
                <div className="relative">
                  <Input
                    id="setup-name"
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
                transition={{ delay: 0.6 }}
                className="space-y-2"
              >
                <Label htmlFor="setup-email" className="text-gray-700 font-medium">
                  البريد الإلكتروني
                </Label>
                <div className="relative">
                  <Input
                    id="setup-email"
                    type="email"
                    placeholder="admin@school.edu"
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

              {/* Password Field with Strength */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.65 }}
                className="space-y-2"
              >
                <Label htmlFor="setup-password" className="text-gray-700 font-medium">
                  كلمة المرور
                </Label>
                <div className="relative">
                  <Input
                    id="setup-password"
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
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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

              {/* Confirm Password */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 }}
                className="space-y-2"
              >
                <Label htmlFor="setup-confirm" className="text-gray-700 font-medium">
                  تأكيد كلمة المرور
                </Label>
                <div className="relative">
                  <Input
                    id="setup-confirm"
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
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="text-xs text-red-500">كلمتا المرور غير متطابقتين</p>
                )}
                {confirmPassword.length > 0 && password === confirmPassword && (
                  <p className="text-xs text-emerald-600">كلمتا المرور متطابقتان ✓</p>
                )}
              </motion.div>

              {/* Admin role indicator */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.75 }}
                className="flex items-center gap-3 rounded-xl border-2 border-amber-200 bg-amber-50/50 p-3"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                  <Shield className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800">مشرف النظام</p>
                  <p className="text-xs text-amber-600">صلاحيات كاملة لإدارة المنصة</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-amber-500 mr-auto" />
              </motion.div>

              {/* Submit Button */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
              >
                <Button
                  type="submit"
                  disabled={isLoading || (confirmPassword.length > 0 && password !== confirmPassword)}
                  className="w-full h-12 text-base font-semibold bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25 transition-all duration-300 hover:shadow-emerald-500/40"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>جارٍ إعداد النظام...</span>
                    </>
                  ) : (
                    <>
                      <span>إعداد النظام وإنشاء حساب المشرف</span>
                      <ArrowRight className="h-5 w-5 mr-2 rotate-180" />
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
