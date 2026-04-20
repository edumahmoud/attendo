'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  ClipboardList,
  BookOpen,
  Award,
  TrendingUp,
  Search,
  Trash2,
  Shield,
  ShieldCheck,
  ShieldX,
  Eye,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Mail,
  Calendar,
  Hash,
  Ban,
  Bell,
  Send,
  Activity,
  Server,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Settings,
  User,
  Lock,
  HardDrive,
  RefreshCw,
  Database,
  Sparkles,
  LogOut,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AppSidebar from '@/components/shared/app-sidebar';
import NotificationBell from '@/components/shared/notification-bell';
import SettingsPage from '@/components/shared/settings-page';
import StatCard from '@/components/shared/stat-card';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { useAutoRefresh, useDebouncedCallback, useRealtimeStatus } from '@/hooks/use-auto-refresh';
import RealtimeStatus from '@/components/shared/realtime-status';
import { toast } from 'sonner';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { UserProfile, Subject, Quiz, Score, AdminSection } from '@/lib/types';

// -------------------------------------------------------
// Props
// -------------------------------------------------------
interface AdminDashboardProps {
  profile: UserProfile;
  onSignOut: () => Promise<void>;
}

// -------------------------------------------------------
// Animation variants
// -------------------------------------------------------
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

const cardHover = {
  whileHover: { scale: 1.02, y: -2 },
  whileTap: { scale: 0.98 },
  transition: { type: 'spring', stiffness: 400, damping: 25 },
};

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const roleLabels: Record<string, string> = {
  student: 'طالب',
  teacher: 'معلم',
  admin: 'مشرف',
  disabled: 'معطل',
};

const roleColors: Record<string, string> = {
  student: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  teacher: 'bg-teal-100 text-teal-700 border-teal-200',
  admin: 'bg-amber-100 text-amber-700 border-amber-200',
  disabled: 'bg-rose-100 text-rose-700 border-rose-200',
};

// Simple bar chart data for recent activity
interface BarDataItem {
  label: string;
  value: number;
  color: string;
}

// -------------------------------------------------------
// Main Component
// -------------------------------------------------------
export default function AdminDashboard({ profile, onSignOut }: AdminDashboardProps) {
  // ─── Navigation ───
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');

  // ─── Stores ───
  const { setAdminSection: storeSetAdminSection } = useAppStore();
  const { updateProfile: authUpdateProfile, signOut: authSignOut } = useAuthStore();

  // ─── Data state ───
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [allQuizzes, setAllQuizzes] = useState<Quiz[]>([]);
  const [allScores, setAllScores] = useState<Score[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // ─── Users section ───
  const [userSearch, setUserSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [grantAdminConfirm, setGrantAdminConfirm] = useState<UserProfile | null>(null);
  const [revokeAdminConfirm, setRevokeAdminConfirm] = useState<UserProfile | null>(null);
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<UserProfile | null>(null);
  const [disableUserConfirm, setDisableUserConfirm] = useState<UserProfile | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const USERS_PER_PAGE = 20;
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search handler
  const handleUserSearchChange = (value: string) => {
    setUserSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setUsersPage(1);
    }, 300);
  };

  // ─── Subjects section ───
  const [deleteSubjectConfirm, setDeleteSubjectConfirm] = useState<Subject | null>(null);
  const [subjectDetailId, setSubjectDetailId] = useState<string | null>(null);

  // ─── Quizzes section ───
  const [deleteQuizConfirm, setDeleteQuizConfirm] = useState<Quiz | null>(null);
  const [viewingQuizResults, setViewingQuizResults] = useState<Quiz | null>(null);
  const [quizResultsScores, setQuizResultsScores] = useState<Score[]>([]);
  const [quizResultsStudents, setQuizResultsStudents] = useState<Record<string, UserProfile>>({});
  const [loadingResults, setLoadingResults] = useState(false);

  // ─── Settings section ───
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [adminName, setAdminName] = useState(profile.name);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // -------------------------------------------------------
  // Data fetching — uses server-side API with service role (bypasses RLS)
  // -------------------------------------------------------
  const fetchAllData = useCallback(async () => {
    setLoadingData(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('No auth session found');
        setLoadingData(false);
        return;
      }

      const response = await fetch('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!response.ok) {
        console.error('Failed to fetch admin dashboard data:', response.status);
        setLoadingData(false);
        return;
      }

      const data = await response.json();
      setAllUsers((data.users as UserProfile[]) || []);
      setAllSubjects((data.subjects as Subject[]) || []);
      setAllQuizzes((data.quizzes as Quiz[]) || []);
      setAllScores((data.scores as Score[]) || []);
    } catch (error) {
      console.error('Error fetching admin dashboard data:', error);
    } finally {
      setLoadingData(false);
    }
  }, []);

  // Individual refresh helpers (all use the same API)
  const fetchUsers = useCallback(async () => { await fetchAllData(); }, [fetchAllData]);
  const fetchSubjects = useCallback(async () => { await fetchAllData(); }, [fetchAllData]);
  const fetchQuizzes = useCallback(async () => { await fetchAllData(); }, [fetchAllData]);
  const fetchScores = useCallback(async () => { await fetchAllData(); }, [fetchAllData]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // -------------------------------------------------------
  // Realtime status & auto-refresh
  // -------------------------------------------------------
  const rtStatus = useRealtimeStatus();

  const debouncedFetchUsers = useDebouncedCallback(() => fetchUsers(), 500);
  const debouncedFetchSubjects = useDebouncedCallback(() => fetchSubjects(), 500);
  const debouncedFetchQuizzes = useDebouncedCallback(() => fetchQuizzes(), 500);
  const debouncedFetchScores = useDebouncedCallback(() => fetchScores(), 500);

  const refreshAllData = useCallback(async () => {
    await Promise.all([fetchUsers(), fetchSubjects(), fetchQuizzes(), fetchScores()]);
    rtStatus.markUpdated();
  }, [fetchUsers, fetchSubjects, fetchQuizzes, fetchScores, rtStatus]);

  useAutoRefresh(refreshAllData, 60000);

  // -------------------------------------------------------
  // Realtime subscriptions (with debounce)
  // -------------------------------------------------------
  useEffect(() => {
    rtStatus.markConnecting();

    const usersChannel = supabase
      .channel('admin-users-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        debouncedFetchUsers(); rtStatus.markUpdated();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') rtStatus.markConnected();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') rtStatus.markDisconnected();
      });

    const subjectsChannel = supabase
      .channel('admin-subjects-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subjects' }, () => {
        debouncedFetchSubjects(); rtStatus.markUpdated();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') rtStatus.markConnected();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') rtStatus.markDisconnected();
      });

    const quizzesChannel = supabase
      .channel('admin-quizzes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quizzes' }, () => {
        debouncedFetchQuizzes(); rtStatus.markUpdated();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') rtStatus.markConnected();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') rtStatus.markDisconnected();
      });

    const scoresChannel = supabase
      .channel('admin-scores-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
        debouncedFetchScores(); rtStatus.markUpdated();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') rtStatus.markConnected();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') rtStatus.markDisconnected();
      });

    return () => {
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(subjectsChannel);
      supabase.removeChannel(quizzesChannel);
      supabase.removeChannel(scoresChannel);
    };
  }, [debouncedFetchUsers, debouncedFetchSubjects, debouncedFetchQuizzes, debouncedFetchScores, rtStatus]);

  // -------------------------------------------------------
  // Section change handler
  // -------------------------------------------------------
  const handleSectionChange = (section: string) => {
    setActiveSection(section as AdminSection);
    storeSetAdminSection(section as AdminSection);
  };

  // -------------------------------------------------------
  // Computed values
  // -------------------------------------------------------
  const studentCount = allUsers.filter((u) => u.role === 'student').length;
  const teacherCount = allUsers.filter((u) => u.role === 'teacher').length;
  const adminCount = allUsers.filter((u) => u.role === 'admin').length;

  const filteredUsers = allUsers.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / USERS_PER_PAGE);
  const paginatedUsers = filteredUsers.slice((usersPage - 1) * USERS_PER_PAGE, usersPage * USERS_PER_PAGE);

  // Recent activity data for bar chart
  const recentActivityData: BarDataItem[] = (() => {
    const now = new Date();
    const days: BarDataItem[] = [];
    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();

      const dayScores = allScores.filter(
        (s) => s.completed_at >= dayStart && s.completed_at < dayEnd
      );

      days.push({
        label: dayNames[d.getDay()],
        value: dayScores.length,
        color: i === 0 ? 'bg-emerald-500' : 'bg-emerald-300',
      });
    }
    return days;
  })();

  const maxBarValue = Math.max(...recentActivityData.map((d) => d.value), 1);

  // System health indicators
  const systemHealth = [
    {
      label: 'قاعدة البيانات',
      status: 'متصل' as const,
      icon: <Database className="h-4 w-4" />,
    },
    {
      label: 'خدمة المصادقة',
      status: 'نشطة' as const,
      icon: <Shield className="h-4 w-4" />,
    },
    {
      label: 'خدمة التخزين',
      status: 'متصل' as const,
      icon: <HardDrive className="h-4 w-4" />,
    },
  ];

  // -------------------------------------------------------
  // User management handlers
  // -------------------------------------------------------
  const handleGrantAdmin = async (user: UserProfile) => {
    setActionLoading(user.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'grant_admin', userId: user.id }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success(`تم منح صلاحيات المشرف لـ ${user.name}`);
        fetchUsers();
      } else {
        toast.error(result.error || 'حدث خطأ أثناء منح صلاحيات المشرف');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setActionLoading(null);
      setGrantAdminConfirm(null);
    }
  };

  const handleRevokeAdmin = async (user: UserProfile) => {
    if (user.id === profile.id) {
      toast.error('لا يمكنك إزالة صلاحيات المشرف من حسابك');
      setRevokeAdminConfirm(null);
      return;
    }
    setActionLoading(user.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'revoke_admin', userId: user.id }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success(`تم إزالة صلاحيات المشرف من ${user.name}`);
        fetchUsers();
      } else {
        toast.error(result.error || 'حدث خطأ أثناء إزالة صلاحيات المشرف');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setActionLoading(null);
      setRevokeAdminConfirm(null);
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (user.id === profile.id) {
      toast.error('لا يمكنك حذف حسابك الخاص');
      setDeleteUserConfirm(null);
      return;
    }
    setActionLoading(user.id);
    try {
      // Delete user's related data first
      await supabase.from('scores').delete().eq('student_id', user.id);
      await supabase.from('scores').delete().eq('teacher_id', user.id);
      await supabase.from('teacher_student_links').delete().eq('student_id', user.id);
      await supabase.from('teacher_student_links').delete().eq('teacher_id', user.id);
      await supabase.from('subject_students').delete().eq('student_id', user.id);
      await supabase.from('notifications').delete().eq('user_id', user.id);
      await supabase.from('quizzes').delete().eq('user_id', user.id);
      await supabase.from('summaries').delete().eq('user_id', user.id);

      // Delete auth user via API to prevent re-creation on login
      const deleteResponse = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const deleteData = await deleteResponse.json();

      if (!deleteData.success) {
        toast.error(deleteData.error || 'فشل في حذف حساب المصادقة');
        return;
      }

      const { error } = await supabase.from('users').delete().eq('id', user.id);

      if (error) {
        toast.error('حدث خطأ أثناء حذف بيانات المستخدم');
      } else {
        toast.success(`تم حذف المستخدم ${user.name} بنجاح`);
        fetchUsers();
        fetchQuizzes();
        fetchScores();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setActionLoading(null);
      setDeleteUserConfirm(null);
    }
  };

  const handleDisableUser = async (user: UserProfile) => {
    if (user.id === profile.id) {
      toast.error('لا يمكنك تعطيل حسابك الخاص');
      setDisableUserConfirm(null);
      return;
    }
    setActionLoading(user.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'disable_user', userId: user.id }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success(`تم تعطيل المستخدم ${user.name}`);
        fetchUsers();
      } else {
        toast.error(result.error || 'حدث خطأ أثناء تعطيل المستخدم');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setActionLoading(null);
      setDisableUserConfirm(null);
    }
  };

  // -------------------------------------------------------
  // Subject management handlers
  // -------------------------------------------------------
  const handleDeleteSubject = async (subject: Subject) => {
    setActionLoading(subject.id);
    try {
      await supabase.from('subject_students').delete().eq('subject_id', subject.id);
      await supabase.from('subject_files').delete().eq('subject_id', subject.id);
      await supabase.from('subject_notes').delete().eq('subject_id', subject.id);

      const { error } = await supabase.from('subjects').delete().eq('id', subject.id);

      if (error) {
        toast.error('حدث خطأ أثناء حذف المادة');
      } else {
        toast.success(`تم حذف المادة "${subject.name}" بنجاح`);
        fetchSubjects();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setActionLoading(null);
      setDeleteSubjectConfirm(null);
    }
  };

  // -------------------------------------------------------
  // Quiz management handlers
  // -------------------------------------------------------
  const handleDeleteQuiz = async (quiz: Quiz) => {
    setActionLoading(quiz.id);
    try {
      await supabase.from('scores').delete().eq('quiz_id', quiz.id);
      const { error } = await supabase.from('quizzes').delete().eq('id', quiz.id);

      if (error) {
        toast.error('حدث خطأ أثناء حذف الاختبار');
      } else {
        toast.success(`تم حذف الاختبار "${quiz.title}" بنجاح`);
        fetchQuizzes();
        fetchScores();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setActionLoading(null);
      setDeleteQuizConfirm(null);
    }
  };

  const handleViewQuizResults = async (quiz: Quiz) => {
    setViewingQuizResults(quiz);
    setLoadingResults(true);
    try {
      const { data: quizScores, error } = await supabase
        .from('scores')
        .select('*')
        .eq('quiz_id', quiz.id)
        .order('completed_at', { ascending: false });
      if (!error && quizScores) {
        setQuizResultsScores(quizScores as Score[]);
        const studentIds = [...new Set((quizScores as Score[]).map(s => s.student_id))];
        if (studentIds.length > 0) {
          const { data: studentProfiles } = await supabase
            .from('users')
            .select('*')
            .in('id', studentIds);
          if (studentProfiles) {
            const map: Record<string, UserProfile> = {};
            (studentProfiles as UserProfile[]).forEach(p => { map[p.id] = p; });
            setQuizResultsStudents(map);
          }
        } else {
          setQuizResultsStudents({});
        }
      }
    } catch {
      // silently ignore
    } finally {
      setLoadingResults(false);
    }
  };

  // -------------------------------------------------------
  // Settings handlers
  // -------------------------------------------------------
  const handleSendAnnouncement = async () => {
    if (!announcementTitle.trim()) {
      toast.error('يرجى إدخال عنوان الإعلان');
      return;
    }
    if (!announcementContent.trim()) {
      toast.error('يرجى إدخال محتوى الإعلان');
      return;
    }

    setSendingAnnouncement(true);
    try {
      const userIds = allUsers.map((u) => u.id);
      const response = await fetch('/api/admin/send-announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: announcementTitle.trim(),
          content: announcementContent.trim(),
          userIds,
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(`تم إرسال الإعلان إلى ${data.count} مستخدم`);
        setAnnouncementTitle('');
        setAnnouncementContent('');
      } else {
        toast.error(data.error || 'حدث خطأ أثناء إرسال الإعلان');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setSendingAnnouncement(false);
    }
  };

  const handleSaveProfile = async () => {
    const trimmed = adminName.trim();
    if (!trimmed) {
      toast.error('الاسم مطلوب');
      return;
    }

    setIsSavingProfile(true);
    try {
      const result = await authUpdateProfile({ name: trimmed });
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
  };

  const handleChangePassword = async () => {
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
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error('فشل في تغيير كلمة المرور');
      } else {
        toast.success('تم تغيير كلمة المرور بنجاح');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      toast.error('حدث خطأ أثناء تغيير كلمة المرور');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // -------------------------------------------------------
  // Get user title prefix
  // -------------------------------------------------------
  const getUserTitlePrefix = (user: UserProfile): string => {
    if (user.is_admin) return 'مشرف';
    if (user.role === 'teacher') return 'د.';
    if (user.role === 'student') return '';
    return '';
  };

  // -------------------------------------------------------
  // Render: Dashboard Section
  // -------------------------------------------------------
  const renderDashboard = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            مرحباً، مشرف النظام
          </h2>
          <p className="text-muted-foreground mt-1">لوحة تحكم الإدارة المركزية</p>
        </div>
        <div className="flex items-center gap-3">
          <RealtimeStatus
            status={rtStatus.status}
            lastUpdated={rtStatus.lastUpdated}
            onRefresh={refreshAllData}
          />
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-gradient-to-l from-emerald-50 to-slate-50 px-4 py-2 text-sm">
            <Shield className="h-4 w-4 text-emerald-600" />
            <span className="font-medium text-emerald-700">وضع المشرف</span>
          </div>
        </div>
      </motion.div>

      {/* Stats row */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          icon={<Users className="h-6 w-6" />}
          label="إجمالي المستخدمين"
          value={allUsers.length}
          color="emerald"
        />
        <StatCard
          icon={<Award className="h-6 w-6" />}
          label="الطلاب"
          value={studentCount}
          color="teal"
        />
        <StatCard
          icon={<BookOpen className="h-6 w-6" />}
          label="المعلمون"
          value={teacherCount}
          color="amber"
        />
        <StatCard
          icon={<ClipboardList className="h-6 w-6" />}
          label="المواد الدراسية"
          value={allSubjects.length}
          color="rose"
        />
        <StatCard
          icon={<TrendingUp className="h-6 w-6" />}
          label="الاختبارات المنجزة"
          value={allScores.length}
          color="emerald"
        />
      </motion.div>

      {/* Two columns: Activity chart + System health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity Bar Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-600" />
                النشاط الأخير (7 أيام)
              </h3>
              <span className="text-xs text-muted-foreground">اختبارات مكتملة</span>
            </div>
            <div className="p-6">
              <div className="flex items-end gap-3 h-48">
                {recentActivityData.map((day, idx) => (
                  <div key={idx} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {day.value}
                    </span>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${(day.value / maxBarValue) * 100}%` }}
                      transition={{ duration: 0.5, delay: idx * 0.08, ease: 'easeOut' }}
                      className={`w-full min-h-[4px] rounded-t-lg ${day.color} transition-all hover:opacity-80`}
                      style={{ maxHeight: '100%' }}
                    />
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {day.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* System Health */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Server className="h-4 w-4 text-emerald-600" />
                صحة النظام
              </h3>
            </div>
            <div className="p-4 space-y-3">
              {systemHealth.map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center justify-between rounded-lg border bg-emerald-50/50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                      {item.icon}
                    </div>
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-medium text-emerald-600">{item.status}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="border-t p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>آخر فحص</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  الآن
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Quick actions */}
      <motion.div variants={itemVariants}>
        <div className="rounded-xl border bg-card shadow-sm p-4">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            إجراءات سريعة
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'إدارة المستخدمين', icon: <Users className="h-5 w-5" />, section: 'users' as AdminSection },
              { label: 'إدارة المواد', icon: <BookOpen className="h-5 w-5" />, section: 'subjects' as AdminSection },
              { label: 'إدارة الاختبارات', icon: <ClipboardList className="h-5 w-5" />, section: 'quizzes' as AdminSection },
              { label: 'إرسال إعلان', icon: <Bell className="h-5 w-5" />, section: 'settings' as AdminSection },
            ].map((action) => (
              <motion.button
                key={action.section}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleSectionChange(action.section)}
                className="flex flex-col items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-emerald-700 transition-colors hover:bg-emerald-100 hover:border-emerald-300"
              >
                {action.icon}
                <span className="text-xs font-medium">{action.label}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  // -------------------------------------------------------
  // Render: Users Section
  // -------------------------------------------------------
  const renderUsers = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold text-foreground">إدارة المستخدمين</h2>
          <p className="text-muted-foreground mt-1">
            {allUsers.length} مستخدم مسجل ({studentCount} طالب، {teacherCount} معلم، {adminCount} مشرف)
          </p>
        </div>
      </motion.div>

      {/* Search and filters */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={userSearch}
            onChange={(e) => handleUserSearchChange(e.target.value)}
            placeholder="بحث بالاسم أو البريد الإلكتروني..."
            className="w-full rounded-lg border bg-background pr-10 pl-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
            dir="rtl"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="تصفية حسب الدور" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الأدوار</SelectItem>
            <SelectItem value="student">طالب</SelectItem>
            <SelectItem value="teacher">معلم</SelectItem>
            <SelectItem value="admin">مشرف</SelectItem>
            <SelectItem value="disabled">معطل</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Users table */}
      <motion.div variants={itemVariants}>
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
            {filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
                  <Users className="h-8 w-8 text-emerald-600" />
                </div>
                <p className="text-lg font-semibold text-foreground mb-1">
                  {userSearch || roleFilter !== 'all' ? 'لا توجد نتائج' : 'لا يوجد مستخدمون'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {userSearch || roleFilter !== 'all'
                    ? 'جرّب البحث بكلمات مختلفة أو تغيير الفلتر'
                    : 'سيظهر المستخدمون هنا عند تسجيلهم'}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-right font-medium p-3">الاسم</th>
                    <th className="text-right font-medium p-3 hidden sm:table-cell">البريد الإلكتروني</th>
                    <th className="text-right font-medium p-3">الدور</th>
                    <th className="text-right font-medium p-3 hidden md:table-cell">الجنس</th>
                    <th className="text-right font-medium p-3 hidden md:table-cell">تاريخ التسجيل</th>
                    <th className="text-right font-medium p-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginatedUsers.map((user) => {
                    const titlePrefix = getUserTitlePrefix(user);
                    const isSelf = user.id === profile.id;
                    const isDisabled = user.role === 'disabled';
                    return (
                      <tr
                        key={user.id}
                        className={`hover:bg-muted/30 transition-colors ${isDisabled ? 'opacity-60' : ''}`}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                              {user.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-foreground truncate block">
                                {titlePrefix && (
                                  <span className="text-emerald-600 ml-1">{titlePrefix}</span>
                                )}
                                {user.name}
                              </span>
                              <span className="text-xs text-muted-foreground truncate block sm:hidden">{user.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 hidden sm:table-cell">
                          <span className="text-xs text-muted-foreground truncate max-w-[200px] inline-block">
                            {user.email}
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge className={`text-[10px] ${roleColors[user.role] || ''}`}>
                            {roleLabels[user.role] || user.role}
                          </Badge>
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {user.gender === 'male' ? '♂ ذكر' : user.gender === 'female' ? '♀ أنثى' : '—'}
                          </span>
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(user.created_at)}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            {/* Grant/Revoke admin */}
                            {!user.is_admin && !isDisabled ? (
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setGrantAdminConfirm(user)}
                                disabled={actionLoading === user.id}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                                title="منح صلاحيات المشرف"
                              >
                                <Shield className="h-3.5 w-3.5" />
                              </motion.button>
                            ) : user.is_admin && !isSelf ? (
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setRevokeAdminConfirm(user)}
                                disabled={actionLoading === user.id}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                                title="إزالة صلاحيات المشرف"
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                              </motion.button>
                            ) : null}

                            {/* Disable/Enable user */}
                            {isDisabled ? (
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={async () => {
                                  setActionLoading(user.id);
                                  const { error } = await supabase
                                    .from('users')
                                    .update({ role: 'student', is_admin: false })
                                    .eq('id', user.id);
                                  if (error) {
                                    toast.error('حدث خطأ أثناء تفعيل المستخدم');
                                  } else {
                                    toast.success(`تم تفعيل المستخدم ${user.name}`);
                                    fetchUsers();
                                  }
                                  setActionLoading(null);
                                }}
                                disabled={actionLoading === user.id || isSelf}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                                title="تفعيل المستخدم"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </motion.button>
                            ) : (
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setDisableUserConfirm(user)}
                                disabled={actionLoading === user.id || isSelf}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                                title="تعطيل المستخدم"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </motion.button>
                            )}

                            {/* Delete user */}
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => setDeleteUserConfirm(user)}
                              disabled={actionLoading === user.id || isSelf}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                              title="حذف المستخدم"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </motion.button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-xs text-muted-foreground">
                عرض {((usersPage - 1) * USERS_PER_PAGE) + 1} - {Math.min(usersPage * USERS_PER_PAGE, filteredUsers.length)} من {filteredUsers.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                  disabled={usersPage === 1}
                  className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-3 w-3" />
                  السابق
                </button>
                <span className="text-xs text-muted-foreground">
                  {usersPage} / {totalPages}
                </span>
                <button
                  onClick={() => setUsersPage((p) => Math.min(totalPages, p + 1))}
                  disabled={usersPage === totalPages}
                  className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  التالي
                  <ChevronLeft className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Grant Admin Confirmation */}
      <AlertDialog open={!!grantAdminConfirm} onOpenChange={(open) => !open && setGrantAdminConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-right flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              تأكيد منح صلاحيات المشرف
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right space-y-2">
              <p>
                هل أنت متأكد من منح صلاحيات المشرف للمستخدم &quot;{grantAdminConfirm?.name}&quot;؟
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs">
                <p className="font-bold mb-1">⚠️ تحذير:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>سيتمكن هذا المستخدم من الوصول إلى لوحة تحكم الإدارة بالكامل</li>
                  <li>سيتمكن من حذف المستخدمين والمواد والاختبارات</li>
                  <li>سيتمكن من إرسال إعلانات لجميع المستخدمين</li>
                  <li>سيتمكن من منح صلاحيات المشرف لمستخدمين آخرين</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={actionLoading === grantAdminConfirm?.id}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => grantAdminConfirm && handleGrantAdmin(grantAdminConfirm)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={actionLoading === grantAdminConfirm?.id}
            >
              {actionLoading === grantAdminConfirm?.id ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري التنفيذ...
                </span>
              ) : (
                'منح الصلاحيات'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke Admin Confirmation */}
      <AlertDialog open={!!revokeAdminConfirm} onOpenChange={(open) => !open && setRevokeAdminConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-right flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              تأكيد إزالة صلاحيات المشرف
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من إزالة صلاحيات المشرف من &quot;{revokeAdminConfirm?.name}&quot;؟
              سيتم تحويل الدور إلى معلم.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={actionLoading === revokeAdminConfirm?.id}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeAdminConfirm && handleRevokeAdmin(revokeAdminConfirm)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={actionLoading === revokeAdminConfirm?.id}
            >
              {actionLoading === revokeAdminConfirm?.id ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري التنفيذ...
                </span>
              ) : (
                'إزالة الصلاحيات'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={!!deleteUserConfirm} onOpenChange={(open) => !open && setDeleteUserConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-right flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              تأكيد حذف المستخدم
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من حذف المستخدم &quot;{deleteUserConfirm?.name}&quot; نهائياً؟
              سيتم حذف جميع بياناته بما في ذلك الاختبارات والنتائج والملخصات. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={actionLoading === deleteUserConfirm?.id}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUserConfirm && handleDeleteUser(deleteUserConfirm)}
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={actionLoading === deleteUserConfirm?.id}
            >
              {actionLoading === deleteUserConfirm?.id ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الحذف...
                </span>
              ) : (
                'حذف نهائياً'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable User Confirmation */}
      <AlertDialog open={!!disableUserConfirm} onOpenChange={(open) => !open && setDisableUserConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-right flex items-center gap-2">
              <Ban className="h-5 w-5 text-amber-500" />
              تأكيد تعطيل المستخدم
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right space-y-2">
              <p>هل أنت متأكد من تعطيل حساب &quot;{disableUserConfirm?.name}&quot;؟</p>
              <p className="text-xs text-muted-foreground">لن يتمكن هذا المستخدم من الوصول إلى النظام. يمكنك تفعيله لاحقاً من جدول المستخدمين.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={actionLoading === disableUserConfirm?.id}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disableUserConfirm && handleDisableUser(disableUserConfirm)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={actionLoading === disableUserConfirm?.id}
            >
              {actionLoading === disableUserConfirm?.id ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري التنفيذ...
                </span>
              ) : (
                'تعطيل'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );

  // -------------------------------------------------------
  // Render: Subjects Section
  // -------------------------------------------------------
  const renderSubjects = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-bold text-foreground">إدارة المواد الدراسية</h2>
        <p className="text-muted-foreground mt-1">
          {allSubjects.length} مادة دراسية مسجلة
        </p>
      </motion.div>

      {/* Subjects list */}
      {allSubjects.length === 0 ? (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 py-16"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
            <BookOpen className="h-8 w-8 text-emerald-600" />
          </div>
          <p className="text-lg font-semibold text-foreground mb-1">لا توجد مواد دراسية</p>
          <p className="text-sm text-muted-foreground">سيتم عرض المواد هنا عند إنشائها من قبل المعلمين</p>
        </motion.div>
      ) : (
        <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allSubjects.map((subject) => (
            <motion.div key={subject.id} variants={itemVariants} {...cardHover}>
              <div className="group rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white text-sm font-bold transition-transform group-hover:scale-110"
                    style={{ backgroundColor: subject.color || '#10b981' }}
                  >
                    {subject.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground truncate">{subject.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      المعلم: {subject.teacher_name || 'غير معروف'}
                    </p>
                  </div>
                </div>

                {subject.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {subject.description}
                  </p>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {subject.student_count || 0} طالب
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(subject.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setSubjectDetailId(subject.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
                      title="عرض التفاصيل"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setDeleteSubjectConfirm(subject)}
                      disabled={actionLoading === subject.id}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                      title="حذف المادة"
                    >
                      {actionLoading === subject.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </motion.button>
                  </div>
                </div>

                {!subject.is_active && (
                  <Badge className="mt-2 bg-rose-100 text-rose-700 border-rose-200 text-[10px]">
                    معطلة
                  </Badge>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Subject Detail Modal */}
      <AnimatePresence>
        {subjectDetailId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setSubjectDetailId(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl border bg-background shadow-xl"
              dir="rtl"
            >
              {(() => {
                const subject = allSubjects.find((s) => s.id === subjectDetailId);
                if (!subject) return null;
                return (
                  <>
                    <div className="flex items-center justify-between border-b p-5">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white font-bold"
                          style={{ backgroundColor: subject.color || '#10b981' }}
                        >
                          {subject.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-foreground">{subject.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            المعلم: {subject.teacher_name || 'غير معروف'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSubjectDetailId(null)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="p-5 space-y-4">
                      {subject.description && (
                        <div>
                          <Label className="text-sm text-muted-foreground">الوصف</Label>
                          <p className="text-sm text-foreground mt-1">{subject.description}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg border p-3">
                          <span className="text-xs text-muted-foreground">عدد الطلاب</span>
                          <p className="text-lg font-bold text-foreground">{subject.student_count || 0}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <span className="text-xs text-muted-foreground">الحالة</span>
                          <p className="text-sm font-medium text-foreground">
                            {subject.is_active ? 'نشطة' : 'معطلة'}
                          </p>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        <span>تاريخ الإنشاء: {formatDate(subject.created_at)}</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Subject Confirmation */}
      <AlertDialog open={!!deleteSubjectConfirm} onOpenChange={(open) => !open && setDeleteSubjectConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-right flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              تأكيد حذف المادة
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من حذف المادة &quot;{deleteSubjectConfirm?.name}&quot;؟
              سيتم حذف جميع الملفات والملاحظات المرتبطة. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={actionLoading === deleteSubjectConfirm?.id}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSubjectConfirm && handleDeleteSubject(deleteSubjectConfirm)}
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={actionLoading === deleteSubjectConfirm?.id}
            >
              {actionLoading === deleteSubjectConfirm?.id ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الحذف...
                </span>
              ) : (
                'حذف نهائياً'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );

  // -------------------------------------------------------
  // Render: Quizzes Section
  // -------------------------------------------------------
  const renderQuizzes = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-bold text-foreground">إدارة الاختبارات</h2>
        <p className="text-muted-foreground mt-1">
          {allQuizzes.length} اختبار مسجل في النظام
        </p>
      </motion.div>

      {/* Quizzes list */}
      {allQuizzes.length === 0 ? (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-teal-300 bg-teal-50/30 py-16"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 mb-4">
            <ClipboardList className="h-8 w-8 text-teal-600" />
          </div>
          <p className="text-lg font-semibold text-foreground mb-1">لا توجد اختبارات</p>
          <p className="text-sm text-muted-foreground">سيتم عرض الاختبارات هنا عند إنشائها</p>
        </motion.div>
      ) : (
        <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allQuizzes.map((quiz) => {
            const quizWithTeacher = quiz as Quiz & { teacher_name?: string };
            return (
              <motion.div key={quiz.id} variants={itemVariants} {...cardHover}>
                <div className="group rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 transition-transform group-hover:scale-110">
                      <ClipboardList className="h-5 w-5 text-teal-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground truncate">{quiz.title}</h3>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          {quiz.questions?.length || 0} أسئلة
                        </span>
                        {quiz.duration && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {quiz.duration} دقيقة
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        المعلم: {quizWithTeacher.teacher_name || 'غير معروف'}
                      </p>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setDeleteQuizConfirm(quiz)}
                      disabled={actionLoading === quiz.id}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-rose-600 opacity-0 group-hover:opacity-100 hover:bg-rose-50 transition-all disabled:opacity-50"
                      title="حذف الاختبار"
                    >
                      {actionLoading === quiz.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </motion.button>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {formatDate(quiz.created_at)}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Delete Quiz Confirmation */}
      <AlertDialog open={!!deleteQuizConfirm} onOpenChange={(open) => !open && setDeleteQuizConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-right flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              تأكيد حذف الاختبار
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من حذف الاختبار &quot;{deleteQuizConfirm?.title}&quot;؟
              سيتم حذف جميع النتائج المرتبطة به. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={actionLoading === deleteQuizConfirm?.id}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteQuizConfirm && handleDeleteQuiz(deleteQuizConfirm)}
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={actionLoading === deleteQuizConfirm?.id}
            >
              {actionLoading === deleteQuizConfirm?.id ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الحذف...
                </span>
              ) : (
                'حذف نهائياً'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );

  // -------------------------------------------------------
  // Render: Settings Section
  // -------------------------------------------------------
  const renderSettings = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-bold text-foreground">إعدادات المشرف</h2>
        <p className="text-muted-foreground mt-1">إدارة حسابك وإعدادات النظام</p>
      </motion.div>

      {/* Personal info card */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden border-emerald-200/50 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                <User className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-base">المعلومات الشخصية</CardTitle>
                <CardDescription>إدارة بياناتك الشخصية</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-name" className="text-sm text-muted-foreground">الاسم</Label>
              <Input
                id="admin-name"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="أدخل اسمك"
                className="text-right"
                disabled={isSavingProfile}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">البريد الإلكتروني</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2.5">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm text-muted-foreground select-all">{profile.email}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-gradient-to-r from-emerald-100 to-slate-100 text-emerald-700 border-emerald-200">
                <Shield className="h-3 w-3 ml-1" />
                مشرف النظام
              </Badge>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleSaveProfile}
                disabled={isSavingProfile || adminName === profile.name}
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

      {/* Security card */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden border-amber-200/50 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                <Lock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-base">الأمان</CardTitle>
                <CardDescription>تغيير كلمة المرور</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-current-pw" className="text-sm text-muted-foreground">
                كلمة المرور الحالية
              </Label>
              <Input
                id="admin-current-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الحالية"
                className="text-right"
                disabled={isChangingPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-new-pw" className="text-sm text-muted-foreground">
                كلمة المرور الجديدة
              </Label>
              <Input
                id="admin-new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الجديدة"
                className="text-right"
                disabled={isChangingPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-confirm-pw" className="text-sm text-muted-foreground">
                تأكيد كلمة المرور الجديدة
              </Label>
              <Input
                id="admin-confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="أعد إدخال كلمة المرور الجديدة"
                className="text-right"
                disabled={isChangingPassword}
              />
            </div>
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
                <>
                  <Lock className="h-4 w-4" />
                  تغيير كلمة المرور
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* System Announcements card */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden border-emerald-200/50 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
                <Bell className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-base">إعلانات النظام</CardTitle>
                <CardDescription>إرسال إشعارات لجميع المستخدمين</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="announcement-title" className="text-sm text-muted-foreground">
                عنوان الإعلان
              </Label>
              <Input
                id="announcement-title"
                value={announcementTitle}
                onChange={(e) => setAnnouncementTitle(e.target.value)}
                placeholder="مثال: صيانة مجدولة للنظام"
                className="text-right"
                disabled={sendingAnnouncement}
                dir="rtl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-content" className="text-sm text-muted-foreground">
                محتوى الإعلان
              </Label>
              <Textarea
                id="announcement-content"
                value={announcementContent}
                onChange={(e) => setAnnouncementContent(e.target.value)}
                placeholder="اكتب محتوى الإعلان هنا..."
                rows={4}
                className="text-right resize-none"
                disabled={sendingAnnouncement}
                dir="rtl"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span>سيتم الإرسال إلى {allUsers.length} مستخدم</span>
              </div>
              <Button
                onClick={handleSendAnnouncement}
                disabled={sendingAnnouncement || !announcementTitle.trim() || !announcementContent.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {sendingAnnouncement ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري الإرسال...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    إرسال الإعلان
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* System Info card */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden border-slate-200/50 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <Database className="h-4 w-4 text-slate-600" />
              </div>
              <div>
                <CardTitle className="text-base">معلومات النظام</CardTitle>
                <CardDescription>إحصائيات عامة عن النظام</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'المستخدمون', value: allUsers.length, icon: <Users className="h-4 w-4" /> },
                { label: 'المواد', value: allSubjects.length, icon: <BookOpen className="h-4 w-4" /> },
                { label: 'الاختبارات', value: allQuizzes.length, icon: <ClipboardList className="h-4 w-4" /> },
                { label: 'النتائج', value: allScores.length, icon: <CheckCircle2 className="h-4 w-4" /> },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border p-3 text-center">
                  <div className="flex justify-center text-emerald-600 mb-1">{stat.icon}</div>
                  <p className="text-lg font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            <Separator className="my-4" />

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={fetchAllData}
                className="gap-2 border-emerald-200 hover:bg-emerald-50 text-emerald-700"
              >
                <RefreshCw className="h-4 w-4" />
                تحديث البيانات
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="gap-2 border-rose-200 hover:bg-rose-50 text-rose-700"
                  >
                    <LogOut className="h-4 w-4" />
                    تسجيل الخروج
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader className="text-right">
                    <AlertDialogTitle className="text-right">تأكيد تسجيل الخروج</AlertDialogTitle>
                    <AlertDialogDescription className="text-right">
                      هل أنت متأكد من تسجيل الخروج من حساب المشرف؟
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-row-reverse gap-2">
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        await authSignOut();
                        await onSignOut();
                      }}
                      className="bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      تسجيل الخروج
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );

  // -------------------------------------------------------
  // Loading state
  // -------------------------------------------------------
  if (loadingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100" dir="rtl">
        <AppSidebar
          role="admin"
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          userName={profile.name}
          onSignOut={async () => {
            await authSignOut();
            await onSignOut();
          }}
        />
        <main className="mr-0 md:mr-72 min-h-screen flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-slate-600 flex items-center justify-center shadow-lg">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">جاري تحميل البيانات...</span>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  // -------------------------------------------------------
  // Main Render
  // -------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100" dir="rtl">
      <AppSidebar
        role="admin"
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        userName={profile.name}
        onSignOut={async () => {
          await authSignOut();
          await onSignOut();
        }}
      />

      <main className="mr-0 md:mr-72 min-h-screen">
        {/* Desktop: sticky top bar with notification bell */}
        <div className="sticky top-0 z-20 flex items-center justify-end gap-3 border-b bg-background/95 backdrop-blur-sm px-6 py-2">
          <NotificationBell
            profile={profile}
            onOpenPanel={() => handleSectionChange('settings')}
          />
        </div>
        <div className="p-4 sm:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          {activeSection === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderDashboard()}
            </motion.div>
          )}
          {activeSection === 'users' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderUsers()}
            </motion.div>
          )}
          {activeSection === 'subjects' && (
            <motion.div
              key="subjects"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderSubjects()}
            </motion.div>
          )}
          {activeSection === 'quizzes' && (
            <motion.div
              key="quizzes"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderQuizzes()}
            </motion.div>
          )}
          {activeSection === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <SettingsPage profile={profile} onBack={() => handleSectionChange('dashboard')} />
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
