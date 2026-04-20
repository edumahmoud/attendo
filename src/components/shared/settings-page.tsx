'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  User,
  Mail,
  Lock,
  Shield,
  Bell,
  Info,
  Loader2,
  Trash2,
  AlertTriangle,
  Copy,
  Check,
  Camera,
  Eye,
  EyeOff,
  KeyRound,
  BellRing,
  FileQuestion,
  FileText,
  MessageSquare,
  Download,
  Database,
  Sparkles,
  Heart,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { useAppStore } from '@/stores/app-store';
import type { UserProfile, UserTitle } from '@/lib/types';

// -------------------------------------------------------
// Types
// -------------------------------------------------------
interface SettingsPageProps {
  profile: UserProfile;
  onBack: () => void;
}

// -------------------------------------------------------
// Animation variants
// -------------------------------------------------------
const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: 'easeOut' },
  }),
};

// -------------------------------------------------------
// Role helpers
// -------------------------------------------------------
const roleLabels: Record<string, string> = {
  student: 'طالب',
  teacher: 'معلم',
  admin: 'مشرف',
};

const roleColors: Record<string, string> = {
  student: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  teacher: 'bg-teal-100 text-teal-700 border-teal-200',
  admin: 'bg-amber-100 text-amber-700 border-amber-200',
};

// -------------------------------------------------------
// Component
// -------------------------------------------------------
export default function SettingsPage({ profile, onBack }: SettingsPageProps) {
  // ─── Stores ─────────────────────────────────────────
  const { updateProfile, refreshProfile } = useAuthStore();
  const { clearCache } = useAppStore();

  // ─── Profile state ──────────────────────────────────
  const [name, setName] = useState(profile.name);
  const [selectedTitleId, setSelectedTitleId] = useState<string>(profile.title_id || '');
  const [selectedGender, setSelectedGender] = useState<string>(profile.gender || '');
  const [userTitles, setUserTitles] = useState<UserTitle[]>([]);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [titlesLoading, setTitlesLoading] = useState(true);

  // ─── Security state ─────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  // ─── Danger zone state ──────────────────────────────
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);

  // ─── Notifications state ────────────────────────────
  const [browserNotifications, setBrowserNotifications] = useState(false);
  const [inAppNotifications, setInAppNotifications] = useState(true);
  const [notifyNewQuiz, setNotifyNewQuiz] = useState(true);
  const [notifyNewNote, setNotifyNewNote] = useState(true);
  const [notifyNewMessage, setNotifyNewMessage] = useState(true);

  // ─── Data & cache state ─────────────────────────────
  const [cacheSize, setCacheSize] = useState<string>('جاري الحساب...');
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isDownloadingData, setIsDownloadingData] = useState(false);

  // ─── Copy state ─────────────────────────────────────
  const [copiedCode, setCopiedCode] = useState(false);

  // ─── Avatar upload state ──────────────────────────────
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch user titles ──────────────────────────────
  useEffect(() => {
    const fetchTitles = async () => {
      try {
        const { data, error } = await supabase
          .from('user_titles')
          .select('*')
          .eq('is_active', true)
          .order('title', { ascending: true });

        if (error) {
          console.error('Error fetching titles:', error);
        } else if (data) {
          setUserTitles(data as UserTitle[]);
        }
      } catch {
        console.error('Failed to fetch user titles');
      } finally {
        setTitlesLoading(false);
      }
    };

    fetchTitles();
  }, []);

  // ─── Load notification preferences from localStorage ─
  useEffect(() => {
    try {
      const saved = localStorage.getItem('examy_notification_prefs');
      if (saved) {
        const prefs = JSON.parse(saved) as {
          inApp?: boolean;
          newQuiz?: boolean;
          newNote?: boolean;
          newMessage?: boolean;
        };
        if (typeof prefs.inApp === 'boolean') setInAppNotifications(prefs.inApp);
        if (typeof prefs.newQuiz === 'boolean') setNotifyNewQuiz(prefs.newQuiz);
        if (typeof prefs.newNote === 'boolean') setNotifyNewNote(prefs.newNote);
        if (typeof prefs.newMessage === 'boolean') setNotifyNewMessage(prefs.newMessage);
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // ─── Save notification preferences to localStorage ──
  useEffect(() => {
    try {
      localStorage.setItem(
        'examy_notification_prefs',
        JSON.stringify({
          inApp: inAppNotifications,
          newQuiz: notifyNewQuiz,
          newNote: notifyNewNote,
          newMessage: notifyNewMessage,
        }),
      );
    } catch {
      // ignore storage errors
    }
  }, [inAppNotifications, notifyNewQuiz, notifyNewNote, notifyNewMessage]);

  // ─── Sync local state with profile prop ─────────────
  useEffect(() => {
    setName(profile.name);
    setSelectedTitleId(profile.title_id || '');
    setSelectedGender(profile.gender || '');
  }, [profile.name, profile.title_id, profile.gender]);

  // ─── Estimate cache size ────────────────────────────
  useEffect(() => {
    const estimateCacheSize = () => {
      try {
        let totalSize = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            const value = localStorage.getItem(key);
            if (value) {
              totalSize += key.length + value.length;
            }
          }
        }
        const sizeKB = (totalSize * 2) / 1024;
        if (sizeKB < 1024) {
          setCacheSize(`${sizeKB.toFixed(1)} كيلوبايت`);
        } else {
          setCacheSize(`${(sizeKB / 1024).toFixed(2)} ميجابايت`);
        }
      } catch {
        setCacheSize('غير معروف');
      }
    };
    estimateCacheSize();
  }, []);

  // ─── Check browser notification permission ──────────
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserNotifications(Notification.permission === 'granted');
    }
  }, []);

  // ─── Handlers ───────────────────────────────────────

  const handleAvatarUpload = useCallback(async (file: File) => {
    // Client-side validation with type detection fallback
    if (file.size > 2 * 1024 * 1024) {
      toast.error('حجم الصورة يجب أن يكون أقل من 2 ميجابايت');
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    // Some browsers report empty file.type — try to detect from extension
    const detectedType = file.type || (
      file.name.toLowerCase().endsWith('.png') ? 'image/png'
        : file.name.toLowerCase().endsWith('.gif') ? 'image/gif'
          : file.name.toLowerCase().endsWith('.webp') ? 'image/webp'
            : 'image/jpeg'
    );
    if (!allowedTypes.includes(detectedType)) {
      toast.error('نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WebP');
      return;
    }

    setUploadingAvatar(true);
    try {
      // Get the user's session token for authenticated upload
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      const formData = new FormData();
      formData.append('avatar', file);
      formData.append('userId', profile.id);

      const response = await fetch('/api/profile/upload-avatar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      let data: { success?: boolean; error?: string; detail?: string; avatarUrl?: string; warning?: string };
      try {
        data = await response.json();
      } catch {
        toast.error(`فشل في رفع الصورة (HTTP ${response.status})`);
        return;
      }

      if (data.success) {
        if (data.warning) {
          toast.warning(data.warning, { duration: 6000 });
        } else {
          toast.success('تم تحديث الصورة الشخصية بنجاح');
        }
        try {
          await refreshProfile();
        } catch (refreshErr) {
          console.error('[AVATAR] Failed to refresh profile after upload:', refreshErr);
          // Upload succeeded, just the UI refresh failed — not critical
        }
      } else {
        const errorMsg = data.error || `فشل في رفع الصورة (HTTP ${response.status})`;
        console.error('[AVATAR] Upload failed:', errorMsg, data.detail);
        // Show the main error, and log the detail for debugging
        toast.error(errorMsg, {
          duration: 6000,
          description: data.detail ? 'اضغط على تفاصيل للمزيد' : undefined,
        });
        // Also log actionable detail to console
        if (data.detail) {
          console.error('[AVATAR] Detail:', data.detail);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      console.error('[AVATAR] Network/unexpected error:', err);
      toast.error(`فشل في رفع الصورة: ${message}`);
    } finally {
      setUploadingAvatar(false);
    }
  }, [profile.id, refreshProfile]);

  const handleSaveProfile = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('الاسم مطلوب');
      return;
    }

    setIsSavingProfile(true);
    try {
      const updates: Partial<UserProfile> = { name: trimmed };
      if (selectedTitleId !== profile.title_id) {
        updates.title_id = selectedTitleId === '__none__' ? null : selectedTitleId || null;
      }
      if (selectedGender !== (profile.gender || '')) {
        updates.gender = (selectedGender as 'male' | 'female') || undefined;
      }

      const result = await updateProfile(updates);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('تم تحديث الملف الشخصي بنجاح');
      }
    } catch {
      toast.error('حدث خطأ أثناء التحديث');
    } finally {
      setIsSavingProfile(false);
    }
  }, [name, selectedTitleId, profile.title_id, updateProfile]);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword) {
      toast.error('يرجى إدخال كلمة المرور الحالية');
      return;
    }
    if (!newPassword) {
      toast.error('يرجى إدخال كلمة المرور الجديدة');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('كلمة المرور الجديدة غير متطابقة');
      return;
    }

    setIsChangingPassword(true);
    try {
      // Verify current password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword,
      });

      if (signInError) {
        toast.error('كلمة المرور الحالية غير صحيحة');
        setIsChangingPassword(false);
        return;
      }

      // Current password is correct, now update
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error('فشل في تغيير كلمة المرور');
      } else {
        toast.success('تم تغيير كلمة المرور بنجاح');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordDialogOpen(false);
      }
    } catch {
      toast.error('حدث خطأ أثناء تغيير كلمة المرور');
    } finally {
      setIsChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword, profile.email]);

  const handleDeleteAccount = useCallback(async () => {
    setIsDeletingAccount(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error('حدث خطأ أثناء حذف الحساب');
      } else {
        localStorage.clear();
        clearCache();
        toast.success('تم حذف الحساب بنجاح');
      }
    } catch {
      toast.error('حدث خطأ أثناء حذف الحساب');
    } finally {
      setIsDeletingAccount(false);
      setDeleteStep(0);
    }
  }, [clearCache]);

  const handleCopyTeacherCode = useCallback(async () => {
    if (!profile.teacher_code) return;
    try {
      await navigator.clipboard.writeText(profile.teacher_code);
      setCopiedCode(true);
      toast.success('تم نسخ كود المعلم');
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error('فشل في نسخ الكود');
    }
  }, [profile.teacher_code]);

  const handleRequestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      toast.error('المتصفح لا يدعم الإشعارات');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setBrowserNotifications(true);
        toast.success('تم تفعيل إشعارات المتصفح');
      } else {
        setBrowserNotifications(false);
        toast.error('تم رفض إذن الإشعارات');
      }
    } catch {
      toast.error('فشل في طلب إذن الإشعارات');
    }
  }, []);

  const handleClearCache = useCallback(async () => {
    setIsClearingCache(true);
    try {
      // Save auth keys before clearing
      const authKeys: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-')) {
          const value = localStorage.getItem(key);
          if (value) authKeys[key] = value;
        }
      }

      clearCache();
      localStorage.clear();

      // Restore auth keys
      Object.entries(authKeys).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });

      // Re-estimate cache size
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) totalSize += key.length + value.length;
        }
      }
      const sizeKB = (totalSize * 2) / 1024;
      setCacheSize(sizeKB < 1024 ? `${sizeKB.toFixed(1)} كيلوبايت` : `${(sizeKB / 1024).toFixed(2)} ميجابايت`);

      toast.success('تم مسح ذاكرة التخزين المؤقت بنجاح');
    } catch {
      toast.error('فشل في مسح الذاكرة المؤقتة');
    } finally {
      setIsClearingCache(false);
    }
  }, [clearCache]);

  const handleDownloadData = useCallback(async () => {
    setIsDownloadingData(true);
    try {
      // Fetch user data from Supabase
      const userData: Record<string, unknown> = {
        profile,
        exportedAt: new Date().toISOString(),
      };

      // Fetch summaries
      const { data: summaries } = await supabase
        .from('summaries')
        .select('*')
        .eq('user_id', profile.id);
      if (summaries) userData.summaries = summaries;

      // Fetch quizzes
      const { data: quizzes } = await supabase
        .from('quizzes')
        .select('*')
        .eq('user_id', profile.id);
      if (quizzes) userData.quizzes = quizzes;

      // Fetch scores
      const { data: scores } = await supabase
        .from('scores')
        .select('*')
        .eq('student_id', profile.id);
      if (scores) userData.scores = scores;

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `examy_data_${profile.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('تم تحميل بياناتك بنجاح');
    } catch {
      toast.error('فشل في تحميل البيانات');
    } finally {
      setIsDownloadingData(false);
    }
  }, [profile]);

  const handleRefreshData = useCallback(async () => {
    try {
      await refreshProfile();
      toast.success('تم تحديث البيانات من قاعدة البيانات');
    } catch {
      toast.error('فشل في تحديث البيانات');
    }
  }, [refreshProfile]);

  // ─── Helper: get user initials ──────────────────────
  const getInitials = (userName: string) => {
    const parts = userName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return parts[0][0] + parts[1][0];
    }
    return userName.substring(0, 2);
  };

  // ─── Helper: get selected title text ────────────────
  const getSelectedTitleText = () => {
    if (!selectedTitleId || selectedTitleId === '__none__') return '';
    const title = userTitles.find((t) => t.id === selectedTitleId);
    return title ? title.title : '';
  };

  // ─── Notification toggle row component ──────────────
  const NotificationToggle = ({
    icon: Icon,
    label,
    description,
    checked,
    onCheckedChange,
    iconColor = 'text-emerald-600',
  }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    iconColor?: string;
  }) => (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconColor}`} />
        <div className="space-y-0.5 min-w-0">
          <Label className="text-sm font-medium text-foreground">{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="data-[state=checked]:bg-emerald-600 shrink-0"
      />
    </div>
  );

  // ─── Render ─────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-emerald-50/50 to-background">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="shrink-0 rounded-full hover:bg-emerald-100"
              aria-label="العودة"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground sm:text-2xl">الإعدادات</h1>
              <p className="text-sm text-muted-foreground">إدارة حسابك وتفضيلاتك</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 pb-12">

        {/* ═════════════════════════════════════════════════
            Section 1: الملف الشخصي
            ═════════════════════════════════════════════════ */}
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          <Card className="overflow-hidden border-emerald-200/50 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                  <User className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-base">الملف الشخصي</CardTitle>
                  <CardDescription>إدارة بياناتك الشخصية والملف التعريفي</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Avatar & basic info row */}
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <div className="relative group">
                  <Avatar className="h-20 w-20 border-2 border-emerald-200 shadow-md">
                    <AvatarImage src={profile.avatar_url} alt={profile.name} />
                    <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xl font-bold">
                      {getInitials(profile.name)}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="تغيير الصورة الشخصية"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    ) : (
                      <Camera className="h-6 w-6 text-white" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAvatarUpload(file);
                      e.target.value = '';
                    }}
                  />
                </div>

                <div className="flex-1 space-y-1 text-center sm:text-right">
                  <p className="text-lg font-semibold text-foreground">
                    {(profile.role === 'teacher' || profile.role === 'admin') && getSelectedTitleText() && (
                      <span className="ml-1 text-emerald-600">{getSelectedTitleText()}</span>
                    )}
                    {profile.name}
                  </p>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                  <div className="mt-1 flex items-center justify-center gap-2 sm:justify-start">
                    <Badge className={roleColors[profile.role] || roleColors.student}>
                      {roleLabels[profile.role] || profile.role}
                    </Badge>
                    {profile.is_admin && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200">مشرف النظام</Badge>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Title selector - only for teachers and admins */}
              {(profile.role === 'teacher' || profile.role === 'admin') && (
                <div className="space-y-2">
                  <Label htmlFor="title-select" className="text-sm font-medium text-muted-foreground">
                    اللقب العلمي
                  </Label>
                  <Select
                    value={selectedTitleId || '__none__'}
                    onValueChange={setSelectedTitleId}
                    disabled={titlesLoading}
                  >
                    <SelectTrigger id="title-select" className="w-full">
                      <SelectValue placeholder={titlesLoading ? 'جاري التحميل...' : 'اختر اللقب'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">بدون لقب</SelectItem>
                      {userTitles.map((title) => (
                        <SelectItem key={title.id} value={title.id}>
                          {title.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Gender selector */}
              <div className="space-y-2">
                <Label htmlFor="gender-select" className="text-sm font-medium text-muted-foreground">
                  الجنس
                </Label>
                <Select
                  value={selectedGender || '__none__'}
                  onValueChange={setSelectedGender}
                >
                  <SelectTrigger id="gender-select" className="w-full">
                    <SelectValue placeholder="اختر الجنس" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">غير محدد</SelectItem>
                    <SelectItem value="male">ذكر</SelectItem>
                    <SelectItem value="female">أنثى</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Name input */}
              <div className="space-y-2">
                <Label htmlFor="settings-name" className="text-sm font-medium text-muted-foreground">
                  الاسم
                </Label>
                <Input
                  id="settings-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="أدخل اسمك"
                  className="text-right"
                  maxLength={100}
                  disabled={isSavingProfile}
                />
              </div>

              {/* Email (read-only with lock icon) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">
                  البريد الإلكتروني
                </Label>
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2.5">
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm text-muted-foreground select-all truncate">{profile.email}</span>
                  <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                    للقراءة فقط
                  </Badge>
                </div>
              </div>

              {/* Role (read-only) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">الدور</Label>
                <div className="flex items-center gap-2">
                  <Badge className={roleColors[profile.role] || roleColors.student}>
                    {roleLabels[profile.role] || profile.role}
                  </Badge>
                  {profile.is_admin && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200">مشرف النظام</Badge>
                  )}
                </div>
              </div>

              {/* Teacher code (for teachers only) */}
              {profile.role === 'teacher' && profile.teacher_code && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    كود المعلم
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2.5 font-mono text-sm tracking-wider text-emerald-800">
                      {profile.teacher_code}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyTeacherCode}
                      className="shrink-0 border-emerald-200 hover:bg-emerald-50"
                      aria-label="نسخ كود المعلم"
                    >
                      {copiedCode ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    شارك هذا الكود مع طلابك ليتمكنوا من الانضمام
                  </p>
                </div>
              )}

              {/* Save button */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSaveProfile}
                  disabled={
                    isSavingProfile ||
                    (name === profile.name && (selectedTitleId || '__none__') === (profile.title_id || '__none__') && (selectedGender || '__none__') === (profile.gender || '__none__'))
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 min-w-[140px]"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جاري الحفظ...
                    </>
                  ) : (
                    'حفظ التغييرات'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ═════════════════════════════════════════════════
            Section 2: الإشعارات
            ═════════════════════════════════════════════════ */}
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          custom={1}
        >
          <Card className="overflow-hidden border-emerald-200/50 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                  <Bell className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-base">الإشعارات</CardTitle>
                  <CardDescription>إدارة تفضيلات الإشعارات</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-1">
              {/* Browser push notifications */}
              <NotificationToggle
                icon={BellRing}
                label="إشعارات المتصفح"
                description="تلقي إشعارات فورية عبر المتصفح"
                checked={browserNotifications}
                iconColor="text-emerald-600"
                onCheckedChange={(checked) => {
                  if (checked && typeof window !== 'undefined' && 'Notification' in window) {
                    if (Notification.permission === 'granted') {
                      setBrowserNotifications(true);
                    } else if (Notification.permission === 'denied') {
                      toast.error('تم رفض إذن الإشعارات مسبقاً. يرجى تفعيله من إعدادات المتصفح');
                      setBrowserNotifications(false);
                    } else {
                      handleRequestNotificationPermission();
                    }
                  } else {
                    setBrowserNotifications(checked);
                  }
                }}
              />

              <Separator className="my-3" />

              {/* In-app notifications */}
              <NotificationToggle
                icon={Bell}
                label="إشعارات التطبيق"
                description="عرض الإشعارات داخل المنصة"
                checked={inAppNotifications}
                onCheckedChange={setInAppNotifications}
              />

              <Separator className="my-3" />

              {/* Notify on new quiz */}
              <NotificationToggle
                icon={FileQuestion}
                label="إشعار عند اختبار جديد"
                description="إشعار عند إنشاء اختبار جديد في موادك"
                checked={notifyNewQuiz}
                onCheckedChange={setNotifyNewQuiz}
              />

              <Separator className="my-3" />

              {/* Notify on new note */}
              <NotificationToggle
                icon={FileText}
                label="إشعار عند ملاحظة جديدة"
                description="إشعار عند إضافة ملاحظة جديدة في موادك"
                checked={notifyNewNote}
                onCheckedChange={setNotifyNewNote}
              />

              <Separator className="my-3" />

              {/* Notify on new message */}
              <NotificationToggle
                icon={MessageSquare}
                label="إشعار عند رسالة جديدة"
                description="إشعار عند استلام رسالة جديدة"
                checked={notifyNewMessage}
                onCheckedChange={setNotifyNewMessage}
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* ═════════════════════════════════════════════════
            Section 3: الأمان والخصوصية
            ═════════════════════════════════════════════════ */}
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          custom={2}
        >
          <Card className="overflow-hidden border-amber-200/50 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                  <Shield className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-base">الأمان والخصوصية</CardTitle>
                  <CardDescription>إدارة أمان حسابك وبياناتك</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Change password — button opens dialog */}
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <KeyRound className="h-5 w-5 mt-0.5 text-amber-600 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">تغيير كلمة المرور</p>
                    <p className="text-xs text-muted-foreground">قم بتغيير كلمة مرور حسابك</p>
                  </div>
                </div>

                <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 border-amber-200 hover:bg-amber-50 text-amber-700 shrink-0">
                      <KeyRound className="h-4 w-4" />
                      تغيير
                    </Button>
                  </DialogTrigger>
                  <DialogContent dir="rtl" className="sm:max-w-md">
                    <DialogHeader className="text-right">
                      <DialogTitle className="flex items-center gap-2 text-right">
                        <KeyRound className="h-5 w-5 text-amber-600" />
                        تغيير كلمة المرور
                      </DialogTitle>
                      <DialogDescription className="text-right">
                        أدخل كلمة المرور الحالية والجديدة
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                      {/* Current password */}
                      <div className="space-y-2">
                        <Label htmlFor="dialog-current-password" className="text-sm text-muted-foreground">
                          كلمة المرور الحالية
                        </Label>
                        <div className="relative">
                          <Input
                            id="dialog-current-password"
                            type={showCurrentPassword ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="أدخل كلمة المرور الحالية"
                            className="pl-10 text-right"
                            disabled={isChangingPassword}
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label={showCurrentPassword ? 'إخفاء' : 'إظهار'}
                          >
                            {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {/* New password */}
                      <div className="space-y-2">
                        <Label htmlFor="dialog-new-password" className="text-sm text-muted-foreground">
                          كلمة المرور الجديدة
                        </Label>
                        <div className="relative">
                          <Input
                            id="dialog-new-password"
                            type={showNewPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="أدخل كلمة المرور الجديدة"
                            className="pl-10 text-right"
                            disabled={isChangingPassword}
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label={showNewPassword ? 'إخفاء' : 'إظهار'}
                          >
                            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Confirm new password */}
                      <div className="space-y-2">
                        <Label htmlFor="dialog-confirm-password" className="text-sm text-muted-foreground">
                          تأكيد كلمة المرور الجديدة
                        </Label>
                        <div className="relative">
                          <Input
                            id="dialog-confirm-password"
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="أعد إدخال كلمة المرور الجديدة"
                            className="pl-10 text-right"
                            disabled={isChangingPassword}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label={showConfirmPassword ? 'إخفاء' : 'إظهار'}
                          >
                            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <DialogFooter className="flex-row-reverse gap-2 sm:gap-2">
                      <Button
                        onClick={handleChangePassword}
                        disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                        className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
                      >
                        {isChangingPassword ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            جاري التغيير...
                          </>
                        ) : (
                          'تغيير كلمة المرور'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setPasswordDialogOpen(false)}
                        disabled={isChangingPassword}
                      >
                        إلغاء
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Clear cache */}
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div className="flex items-start gap-3 min-w-0">
                  <HardDrive className="h-5 w-5 mt-0.5 text-amber-600 shrink-0" />
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-medium text-foreground">مسح ذاكرة التخزين المؤقت</p>
                    <p className="text-xs text-muted-foreground">
                      الحجم الحالي: {cacheSize}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearCache}
                  disabled={isClearingCache}
                  className="gap-2 border-amber-200 hover:bg-amber-50 text-amber-700 shrink-0"
                >
                  {isClearingCache ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جاري المسح...
                    </>
                  ) : (
                    <>
                      <Database className="h-4 w-4" />
                      مسح
                    </>
                  )}
                </Button>
              </div>

              {/* Download my data */}
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div className="flex items-start gap-3 min-w-0">
                  <Download className="h-5 w-5 mt-0.5 text-amber-600 shrink-0" />
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-medium text-foreground">تحميل بياناتي</p>
                    <p className="text-xs text-muted-foreground">
                      تصدير جميع بياناتك كملف JSON
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadData}
                  disabled={isDownloadingData}
                  className="gap-2 border-amber-200 hover:bg-amber-50 text-amber-700 shrink-0"
                >
                  {isDownloadingData ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جاري التحضير...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      تحميل
                    </>
                  )}
                </Button>
              </div>

              {/* Refresh data */}
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div className="flex items-start gap-3 min-w-0">
                  <RefreshCw className="h-5 w-5 mt-0.5 text-emerald-600 shrink-0" />
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-medium text-foreground">تحديث البيانات</p>
                    <p className="text-xs text-muted-foreground">
                      إعادة تحميل البيانات من الخادم
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshData}
                  className="gap-2 border-emerald-200 hover:bg-emerald-50 text-emerald-700 shrink-0"
                >
                  <RefreshCw className="h-4 w-4" />
                  تحديث
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ═════════════════════════════════════════════════
            Section 4: حول التطبيق
            ═════════════════════════════════════════════════ */}
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          custom={3}
        >
          <Card className="overflow-hidden border-emerald-200/50 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                  <Info className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-base">حول التطبيق</CardTitle>
                  <CardDescription>معلومات عن المنصة</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                {/* App logo */}
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-foreground">
                    Examy - المنصة التعليمية الذكية
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    منصة متكاملة للتعلم والتعليم مدعومة بالذكاء الاصطناعي
                  </p>
                </div>

                <Badge variant="outline" className="gap-1.5 border-emerald-200 text-emerald-700">
                  الإصدار 1.0.0
                </Badge>

                <Separator className="w-48" />

                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  صُنع بـ
                  <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
                  بواسطة Z.ai
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* ═════════════════════════════════════════════════
            Section 5: منطقة الخطر
            ═════════════════════════════════════════════════ */}
        <motion.div
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          custom={4}
        >
          <Card className="overflow-hidden border-rose-200/70 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <CardTitle className="text-base text-rose-700">منطقة الخطر</CardTitle>
                  <CardDescription className="text-rose-600/70">إجراءات لا يمكن التراجع عنها</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-5 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-rose-500" />
                    <h4 className="text-sm font-semibold text-rose-700">حذف الحساب</h4>
                  </div>
                  <p className="text-sm text-rose-600/80">
                    حذف الحساب سيؤدي إلى إزالة جميع بياناتك نهائياً. هذا الإجراء لا يمكن التراجع عنه.
                  </p>
                </div>

                {/* Double-confirmation delete flow */}
                {deleteStep === 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-2"
                        disabled={isDeletingAccount}
                      >
                        <Trash2 className="h-4 w-4" />
                        حذف الحساب
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent dir="rtl">
                      <AlertDialogHeader className="text-right">
                        <AlertDialogTitle className="text-right flex items-center gap-2 justify-end">
                          تأكيد حذف الحساب
                          <AlertTriangle className="h-5 w-5 text-rose-500" />
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-right">
                          هل أنت متأكد من حذف حسابك؟ سيتم حذف جميع بياناتك بشكل نهائي ولا يمكن استرجاعها.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex-row-reverse gap-2">
                        <AlertDialogCancel disabled={isDeletingAccount}>إلغاء</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => setDeleteStep(1)}
                          className="bg-rose-600 hover:bg-rose-700 text-white"
                          disabled={isDeletingAccount}
                        >
                          متابعة
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {deleteStep === 1 && (
                  <div className="space-y-3 rounded-lg border border-rose-300 bg-rose-100/50 p-4">
                    <p className="text-sm font-medium text-rose-700">
                      تأكيد نهائي: هل أنت متأكد تماماً من رغبتك في حذف حسابك؟
                    </p>
                    <p className="text-xs text-rose-600/80">
                      هذا هو التأكيد الأخير. بعد النقر على &quot;حذف نهائياً&quot;، سيتم حذف حسابك وجميع بياناتك بشكل دائم.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-2"
                        disabled={isDeletingAccount}
                        onClick={handleDeleteAccount}
                      >
                        {isDeletingAccount ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            جاري الحذف...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" />
                            حذف نهائياً
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteStep(0)}
                        disabled={isDeletingAccount}
                        className="border-rose-200 hover:bg-rose-50"
                      >
                        إلغاء
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Bottom spacing */}
        <div className="h-4" />
      </div>
    </div>
  );
}
