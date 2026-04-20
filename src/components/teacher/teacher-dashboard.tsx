'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  Users,
  ClipboardList,
  TrendingUp,
  Award,
  Copy,
  Search,
  Download,
  Plus,
  Share2,
  Trash2,
  X,
  Loader2,
  ChevronLeft,
  Calendar,
  Hash,
  Clock,
  CheckCircle2,
  Eye,
  RotateCcw,
  Mail,
  AlertTriangle,
  GripVertical,
  Minus,
  Video,
  BookOpen,
  BarChart3,
  Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AppSidebar from '@/components/shared/app-sidebar';
import SettingsModal from '@/components/shared/settings-modal';
import SubjectsSection from '@/components/shared/subjects-section';
import SubjectDetail from '@/components/shared/subject-detail';
import SettingsPage from '@/components/shared/settings-page';
import ChatPanel from '@/components/shared/chat-panel';
import NotificationBell from '@/components/shared/notification-bell';
import NotificationsPanel from '@/components/shared/notifications-panel';
import StatCard from '@/components/shared/stat-card';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { useAutoRefresh, useDebouncedCallback, useRealtimeStatus } from '@/hooks/use-auto-refresh';
import { useIsMobile } from '@/hooks/use-mobile';
import RealtimeStatus from '@/components/shared/realtime-status';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import type { UserProfile, Quiz, QuizQuestion, Score, TeacherSection, Subject } from '@/lib/types';

// -------------------------------------------------------
// Props
// -------------------------------------------------------
interface TeacherDashboardProps {
  profile: UserProfile;
  onSignOut: () => void;
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

function scorePercentage(score: number, total: number): number {
  if (!total || total === 0 || !score && score !== 0) return 0;
  const pct = Math.round((score / total) * 100);
  return Number.isNaN(pct) ? 0 : pct;
}

function pctColorClass(pct: number): string {
  if (pct >= 90) return 'text-emerald-700 bg-emerald-100';
  if (pct >= 75) return 'text-teal-700 bg-teal-100';
  if (pct >= 60) return 'text-amber-700 bg-amber-100';
  return 'text-rose-700 bg-rose-100';
}

// Pie chart colors
const PIE_COLORS = ['#10b981', '#14b8a6', '#f59e0b', '#ef4444'];

// -------------------------------------------------------
// Main Component
// -------------------------------------------------------
export default function TeacherDashboard({ profile, onSignOut }: TeacherDashboardProps) {
  // ─── Navigation ───
  const { teacherSection, setTeacherSection: storeSetTeacherSection, viewingSubjectId, setViewingSubjectId } = useAppStore();
  const isMobile = useIsMobile();
  const [activeSection, setActiveSectionLocal] = useState<TeacherSection>(teacherSection || 'dashboard');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Sync with store
  const setActiveSection = useCallback((section: TeacherSection) => {
    setActiveSectionLocal(section);
    storeSetTeacherSection(section);
  }, [storeSetTeacherSection]);

  // Listen for store changes (e.g. from notifications navigation)
  useEffect(() => {
    if (teacherSection && teacherSection !== activeSection) {
      setActiveSectionLocal(teacherSection);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherSection]);

  // ─── Stores ───
  const { updateProfile: authUpdateProfile, signOut: authSignOut } = useAuthStore();

  // ─── Data state ───
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [subjectsCount, setSubjectsCount] = useState(0);
  const [teacherSubjects, setTeacherSubjects] = useState<Subject[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [attendanceData, setAttendanceData] = useState<{ student_id: string; attended: number; total: number }[]>([]);
  const [performanceDialogOpen, setPerformanceDialogOpen] = useState(false);
  const [performanceStudent, setPerformanceStudent] = useState<UserProfile | null>(null);

  // ─── Students section ───
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [studentDetailOpen, setStudentDetailOpen] = useState(false);
  const [resettingStudent, setResettingStudent] = useState(false);

  // ─── Quizzes section ───
  const [createQuizOpen, setCreateQuizOpen] = useState(false);
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDuration, setQuizDuration] = useState('');
  const [quizDate, setQuizDate] = useState('');
  const [quizTime, setQuizTime] = useState('');
  const [quizSubjectId, setQuizSubjectId] = useState('');
  const [quizAllowRetake, setQuizAllowRetake] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [viewingQuizResults, setViewingQuizResults] = useState<Quiz | null>(null);
  const [quizResultsScores, setQuizResultsScores] = useState<Score[]>([]);
  const [quizResultsStudents, setQuizResultsStudents] = useState<Record<string, UserProfile>>({});
  const [loadingResults, setLoadingResults] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionType, setCurrentQuestionType] = useState<QuizQuestion['type']>('mcq');
  const [currentQuestionText, setCurrentQuestionText] = useState('');
  const [mcqOptions, setMcqOptions] = useState(['', '', '', '']);
  const [mcqCorrect, setMcqCorrect] = useState(0);
  const [booleanCorrect, setBooleanCorrect] = useState(true);
  const [completionAnswer, setCompletionAnswer] = useState('');
  const [matchingPairs, setMatchingPairs] = useState<{ key: string; value: string }[]>([
    { key: '', value: '' },
  ]);
  const [creatingQuiz, setCreatingQuiz] = useState(false);

  // ─── Share modal ───
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareQuiz, setShareQuiz] = useState<Quiz | null>(null);

  // ─── Delete quiz ───
  const [deletingQuizId, setDeletingQuizId] = useState<string | null>(null);

  // ─── Unread notifications ───
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // ─── Unread messages ───
  const [unreadMessages, setUnreadMessages] = useState(0);

  // -------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------
  const fetchStudents = useCallback(async () => {
    try {
      const { data: links, error: linksError } = await supabase
        .from('teacher_student_links')
        .select('student_id')
        .eq('teacher_id', profile.id);

      if (linksError) {
        console.error('Error fetching student links:', linksError);
        return;
      }

      if (links && links.length > 0) {
        const studentIds = links.map((l: { student_id: string }) => l.student_id);
        const { data: studentProfiles, error: profilesError } = await supabase
          .from('users')
          .select('*')
          .in('id', studentIds);

        if (profilesError) {
          console.error('Error fetching student profiles:', profilesError);
        } else {
          setStudents((studentProfiles as UserProfile[]) || []);
        }
      } else {
        setStudents([]);
      }
    } catch {
      // silently ignore - prevents unhandled rejection
    }
  }, [profile.id]);

  const fetchQuizzes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching quizzes:', error);
      } else {
        const quizList = (data as Quiz[]) || [];

        // Enrich with subject names
        const quizzesWithSubjects = quizList.filter(q => q.subject_id);
        if (quizzesWithSubjects.length > 0) {
          const subjectIds = [...new Set(quizzesWithSubjects.map(q => q.subject_id).filter(Boolean))];
          if (subjectIds.length > 0) {
            const { data: subjectsData } = await supabase
              .from('subjects')
              .select('id, name')
              .in('id', subjectIds);
            if (subjectsData) {
              const subjectMap: Record<string, string> = {};
              (subjectsData as { id: string; name: string }[]).forEach(s => {
                subjectMap[s.id] = s.name;
              });
              quizList.forEach(q => {
                if (q.subject_id) {
                  q.subject_name = subjectMap[q.subject_id] || '';
                }
              });
            }
          }
        }

        setQuizzes(quizList);
      }
    } catch {
      // silently ignore - prevents unhandled rejection
    }
  }, [profile.id]);

  const fetchScores = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('scores')
        .select('*')
        .eq('teacher_id', profile.id)
        .order('completed_at', { ascending: false });

      if (error) {
        console.error('Error fetching scores:', error);
      } else {
        setScores((data as Score[]) || []);
      }
    } catch {
      // silently ignore - prevents unhandled rejection
    }
  }, [profile.id]);

  // ─── Fetch subjects count ───
  const fetchSubjectsCount = useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from('subjects')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', profile.id);

      if (!error && count !== null) {
        setSubjectsCount(count);
      }
    } catch {
      // silently ignore
    }
  }, [profile.id]);

  // ─── Fetch teacher subjects (for quiz creation) ───
  const fetchTeacherSubjects = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('*')
        .eq('teacher_id', profile.id)
        .order('created_at', { ascending: false });
      if (!error && data) {
        setTeacherSubjects(data as Subject[]);
      }
    } catch {
      // silently ignore
    }
  }, [profile.id]);

  // ─── Fetch attendance data for performance calculation ───
  const fetchAttendanceData = useCallback(async () => {
    try {
      // Get lectures for teacher's subjects
      const { data: lectures } = await supabase
        .from('lectures')
        .select('id')
        .eq('teacher_id', profile.id);

      if (!lectures || lectures.length === 0) {
        setAttendanceData([]);
        return;
      }

      const lectureIds = lectures.map((l: { id: string }) => l.id);
      const totalLectures = lectureIds.length;

      // Get attendance for each student
      const { data: attendance } = await supabase
        .from('lecture_attendance')
        .select('student_id')
        .in('lecture_id', lectureIds);

      if (attendance) {
        const studentAttendanceMap: Record<string, number> = {};
        (attendance as { student_id: string }[]).forEach((a) => {
          studentAttendanceMap[a.student_id] = (studentAttendanceMap[a.student_id] || 0) + 1;
        });

        const attendanceArray = Object.entries(studentAttendanceMap).map(([student_id, attended]) => ({
          student_id,
          attended,
          total: totalLectures,
        }));

        setAttendanceData(attendanceArray);
      }
    } catch {
      // silently ignore
    }
  }, [profile.id]);

  // Load all data
  const initialLoadDone = useRef(false);
  const fetchAllData = useCallback(async (showLoading = false) => {
    if (showLoading || !initialLoadDone.current) setLoadingData(true);
    await Promise.allSettled([fetchStudents(), fetchQuizzes(), fetchScores(), fetchSubjectsCount(), fetchTeacherSubjects(), fetchAttendanceData()]);
    setLoadingData(false);
    initialLoadDone.current = true;
  }, [fetchStudents, fetchQuizzes, fetchScores, fetchSubjectsCount, fetchTeacherSubjects, fetchAttendanceData]);

  useEffect(() => {
    fetchAllData(true);
  }, [fetchAllData]);

  // -------------------------------------------------------
  // Realtime status & auto-refresh
  // -------------------------------------------------------
  const { status: rtStatusValue, lastUpdated: rtLastUpdated, markConnected, markDisconnected, markConnecting, markUpdated } = useRealtimeStatus();

  // -------------------------------------------------------
  // Fetch unread notifications count
  // -------------------------------------------------------
  const fetchUnreadNotifications = useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('is_read', false);

      if (!error && count !== null) {
        setUnreadNotifications(count);
      }
    } catch {
      // silently ignore
    }
  }, [profile.id]);

  useEffect(() => {
    fetchUnreadNotifications();

    const channel = supabase
      .channel('teacher-notifications-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => { fetchUnreadNotifications(); markUpdated(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile.id, fetchUnreadNotifications, markUpdated]);

  // -------------------------------------------------------
  // Fetch unread messages count
  // -------------------------------------------------------
  const fetchUnreadMessages = useCallback(async () => {
    try {
      let totalCount = 0;

      // 1. Private messages (receiver_id = me, not sent by me)
      const { count: privateCount, error: privateError } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', profile.id)
        .neq('sender_id', profile.id);

      if (!privateError && privateCount !== null) {
        totalCount += privateCount;
      }

      // 2. Subject messages from teacher's own subjects (not sent by me)
      const { data: mySubjects } = await supabase
        .from('subjects')
        .select('id')
        .eq('teacher_id', profile.id);

      if (mySubjects && mySubjects.length > 0) {
        const subjectIds = mySubjects.map(s => s.id);
        const { count: subjectCount, error: subjectError } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('subject_id', subjectIds)
          .neq('sender_id', profile.id)
          .is('receiver_id', null);

        if (!subjectError && subjectCount !== null) {
          totalCount += subjectCount;
        }
      }

      // 3. General chat messages (no subject, no receiver) - not from me
      const { count: generalCount, error: generalError } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .is('subject_id', null)
        .is('receiver_id', null)
        .neq('sender_id', profile.id);

      if (!generalError && generalCount !== null) {
        totalCount += generalCount;
      }

      setUnreadMessages(totalCount);
    } catch {
      // silently ignore
    }
  }, [profile.id]);

  useEffect(() => {
    fetchUnreadMessages();

    const interval = setInterval(fetchUnreadMessages, 15000);

    const channel = supabase
      .channel('teacher-unread-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { fetchUnreadMessages(); }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [profile.id, fetchUnreadMessages]);

  // Debounced versions of fetch functions to prevent rapid re-fetches
  const debouncedFetchStudents = useDebouncedCallback(() => fetchStudents(), 500);
  const debouncedFetchQuizzes = useDebouncedCallback(() => fetchQuizzes(), 500);
  const debouncedFetchScores = useDebouncedCallback(() => fetchScores(), 500);
  const debouncedFetchSubjectsCount = useDebouncedCallback(() => fetchSubjectsCount(), 500);

  // Full data refresh for polling fallback
  const refreshAllData = useCallback(async () => {
    await Promise.allSettled([fetchStudents(), fetchQuizzes(), fetchScores(), fetchSubjectsCount()]);
    markUpdated();
  }, [fetchStudents, fetchQuizzes, fetchScores, fetchSubjectsCount, markUpdated]);

  // Auto-refresh every 60 seconds as fallback
  useAutoRefresh(refreshAllData, 60000);

  // -------------------------------------------------------
  // Realtime subscriptions (with debounce + missing subscriptions)
  // -------------------------------------------------------
  useEffect(() => {
    markConnecting();

    const linksChannel = supabase
      .channel('teacher-links-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teacher_student_links', filter: `teacher_id=eq.${profile.id}` },
        () => { debouncedFetchStudents(); markUpdated(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') markConnected();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') markDisconnected();
      });

    const quizzesChannel = supabase
      .channel('teacher-quizzes-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quizzes', filter: `user_id=eq.${profile.id}` },
        () => { debouncedFetchQuizzes(); markUpdated(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') markConnected();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') markDisconnected();
      });

    const scoresChannel = supabase
      .channel('teacher-scores-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores', filter: `teacher_id=eq.${profile.id}` },
        () => { debouncedFetchScores(); markUpdated(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') markConnected();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') markDisconnected();
      });

    // Missing: subjects changes (for subjects count)
    const subjectsChannel = supabase
      .channel('teacher-subjects-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subjects', filter: `teacher_id=eq.${profile.id}` },
        () => { debouncedFetchSubjectsCount(); markUpdated(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') markConnected();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') markDisconnected();
      });

    return () => {
      supabase.removeChannel(linksChannel);
      supabase.removeChannel(quizzesChannel);
      supabase.removeChannel(scoresChannel);
      supabase.removeChannel(subjectsChannel);
    };
  }, [profile.id, debouncedFetchStudents, debouncedFetchQuizzes, debouncedFetchScores, debouncedFetchSubjectsCount, markConnecting, markUpdated, markConnected, markDisconnected]);

  // -------------------------------------------------------
  // Section change handler
  // -------------------------------------------------------
  const handleSectionChange = (section: string) => {
    setActiveSection(section as TeacherSection);
    storeSetTeacherSection(section as TeacherSection);
    // Reset subject detail when navigating away
    if (section !== 'subjects') {
      setViewingSubjectId(null);
    }
  };

  // -------------------------------------------------------
  // Computed values
  // -------------------------------------------------------
  const avgPerformance = (() => {
    if (scores.length === 0) return 0;
    const avg = Math.round(scores.reduce((sum, s) => sum + scorePercentage(s.score, s.total), 0) / scores.length);
    return Number.isNaN(avg) ? 0 : avg;
  })();

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const getStudentLastScore = (studentId: string): Score | null => {
    const studentScores = scores.filter((s) => s.student_id === studentId);
    return studentScores.length > 0 ? studentScores[0] : null;
  };

  const getStudentScores = (studentId: string): Score[] => {
    return scores.filter((s) => s.student_id === studentId);
  };

  // Get student performance metrics
  const getStudentPerformance = (studentId: string) => {
    const studentScores = scores.filter((s) => s.student_id === studentId);
    const attendance = attendanceData.find((a) => a.student_id === studentId);

    const avgScore = studentScores.length > 0
      ? Math.round(studentScores.reduce((sum, s) => sum + scorePercentage(s.score, s.total), 0) / studentScores.length)
      : null;

    const attendanceRate = attendance && attendance.total > 0
      ? Math.round((attendance.attended / attendance.total) * 100)
      : null;

    return {
      avgScore,
      attendanceRate,
      totalQuizzes: studentScores.length,
      totalLectures: attendance?.total || 0,
      attendedLectures: attendance?.attended || 0,
    };
  };

  // -------------------------------------------------------
  // Copy teacher code
  // -------------------------------------------------------
  const handleCopyTeacherCode = () => {
    if (profile.teacher_code) {
      navigator.clipboard.writeText(profile.teacher_code);
      toast.success('تم نسخ كود المعلم بنجاح');
    }
  };

  // -------------------------------------------------------
  // Excel export: student summaries
  // -------------------------------------------------------
  const handleExportSummaries = async () => {
    try {
      toast.info('جاري تحضير البيانات...');

      const studentIds = students.map((s) => s.id);
      const { data: summaries } = await supabase
        .from('summaries')
        .select('*')
        .in('user_id', studentIds);

      const wb = XLSX.utils.book_new();

      // Sheet 1: Student overview
      const overviewData = students.map((s) => {
        const sScores = getStudentScores(s.id);
        const lastScore = sScores[0];
        const avg = sScores.length > 0
          ? Math.round(sScores.reduce((sum, sc) => sum + scorePercentage(sc.score, sc.total), 0) / sScores.length)
          : 0;
        return {
          'اسم الطالب': s.name,
          'البريد الإلكتروني': s.email,
          'عدد الاختبارات': sScores.length,
          'آخر نتيجة': lastScore ? `${lastScore.score}/${lastScore.total}` : '—',
          'متوسط الأداء': `${avg}%`,
        };
      });
      const ws1 = XLSX.utils.json_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(wb, ws1, 'نظرة عامة على الطلاب');

      // Sheet 2: Detailed scores
      const scoresData = scores.map((s) => ({
        'اسم الطالب': students.find((st) => st.id === s.student_id)?.name || '—',
        'عنوان الاختبار': s.quiz_title,
        'الدرجة': `${s.score}/${s.total}`,
        'النسبة': `${scorePercentage(s.score, s.total)}%`,
        'تاريخ الإنجاز': formatDate(s.completed_at),
      }));
      if (scoresData.length > 0) {
        const ws2 = XLSX.utils.json_to_sheet(scoresData);
        XLSX.utils.book_append_sheet(wb, ws2, 'النتائج التفصيلية');
      }

      // Sheet 3: Summaries
      if (summaries && summaries.length > 0) {
        const summariesData = summaries.map((sm: { title: string; user_id: string; created_at: string; summary_content: string }) => ({
          'عنوان الملخص': sm.title,
          'الطالب': students.find((st) => st.id === sm.user_id)?.name || '—',
          'تاريخ الإنشاء': formatDate(sm.created_at),
          'المحتوى': sm.summary_content?.slice(0, 200) || '',
        }));
        const ws3 = XLSX.utils.json_to_sheet(summariesData);
        XLSX.utils.book_append_sheet(wb, ws3, 'الملخصات');
      }

      XLSX.writeFile(wb, `ملخصات_الطلاب_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('تم تصدير البيانات بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء تصدير البيانات');
    }
  };

  // -------------------------------------------------------
  // Excel export: all analytics data
  // -------------------------------------------------------
  const handleExportAllData = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Per-quiz stats
      const quizStats = quizzes.map((q) => {
        const qScores = scores.filter((s) => s.quiz_id === q.id);
        const avg = qScores.length > 0
          ? Math.round(qScores.reduce((sum, s) => sum + scorePercentage(s.score, s.total), 0) / qScores.length)
          : 0;
        return {
          'عنوان الاختبار': q.title,
          'عدد الأسئلة': q.questions?.length || 0,
          'عدد الطلاب': qScores.length,
          'متوسط الأداء': `${avg}%`,
          'تاريخ الإنشاء': formatDate(q.created_at),
        };
      });
      const ws1 = XLSX.utils.json_to_sheet(quizStats);
      XLSX.utils.book_append_sheet(wb, ws1, 'إحصائيات الاختبارات');

      // Sheet 2: Per-question breakdown
      const questionData: Record<string, string | number>[] = [];
      quizzes.forEach((q) => {
        const qScores = scores.filter((s) => s.quiz_id === q.id);
        q.questions?.forEach((question, idx) => {
          const correctCount = qScores.filter((s) => s.user_answers?.[idx]?.isCorrect).length;
          questionData.push({
            'الاختبار': q.title,
            'رقم السؤال': idx + 1,
            'نوع السؤال': question.type === 'mcq' ? 'اختيار متعدد' : question.type === 'boolean' ? 'صح/خطأ' : question.type === 'completion' ? 'إكمال' : 'مطابقة',
            'نص السؤال': question.question,
            'عدد الإجابات الصحيحة': correctCount,
            'عدد المشاركين': qScores.length,
            'نسبة الإجابة الصحيحة': qScores.length > 0 ? `${Math.round((correctCount / qScores.length) * 100)}%` : '—',
          });
        });
      });
      if (questionData.length > 0) {
        const ws2 = XLSX.utils.json_to_sheet(questionData);
        XLSX.utils.book_append_sheet(wb, ws2, 'تفصيل الأسئلة');
      }

      // Sheet 3: All scores
      const allScores = scores.map((s) => ({
        'اسم الطالب': students.find((st) => st.id === s.student_id)?.name || '—',
        'عنوان الاختبار': s.quiz_title,
        'الدرجة': `${s.score}/${s.total}`,
        'النسبة': `${scorePercentage(s.score, s.total)}%`,
        'تاريخ الإنجاز': formatDate(s.completed_at),
      }));
      if (allScores.length > 0) {
        const ws3 = XLSX.utils.json_to_sheet(allScores);
        XLSX.utils.book_append_sheet(wb, ws3, 'جميع النتائج');
      }

      XLSX.writeFile(wb, `تقرير_شامل_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('تم تصدير التقرير الشامل بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء تصدير البيانات');
    }
  };

  // -------------------------------------------------------
  // Per-quiz Excel download
  // -------------------------------------------------------
  const handleExportQuizData = (quiz: Quiz) => {
    try {
      const qScores = scores.filter((s) => s.quiz_id === quiz.id);
      const wb = XLSX.utils.book_new();

      const data = qScores.map((s) => ({
        'اسم الطالب': students.find((st) => st.id === s.student_id)?.name || '—',
        'الدرجة': `${s.score}/${s.total}`,
        'النسبة': `${scorePercentage(s.score, s.total)}%`,
        'تاريخ الإنجاز': formatDate(s.completed_at),
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, quiz.title);
      XLSX.writeFile(wb, `${quiz.title}_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('تم تصدير بيانات الاختبار بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء التصدير');
    }
  };

  // -------------------------------------------------------
  // Reset student scores
  // -------------------------------------------------------
  const handleResetStudent = async (studentId: string) => {
    setResettingStudent(true);
    try {
      const { error } = await supabase
        .from('scores')
        .delete()
        .eq('student_id', studentId)
        .eq('teacher_id', profile.id);

      if (error) {
        toast.error('حدث خطأ أثناء تصفير حالة الطالب');
      } else {
        toast.success('تم تصفير حالة الطالب بنجاح');
        setStudentDetailOpen(false);
        fetchScores();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setResettingStudent(false);
    }
  };

  // -------------------------------------------------------
  // Toggle results visibility
  // -------------------------------------------------------
  const handleToggleResults = async (quizId: string, currentValue: boolean) => {
    try {
      const response = await fetch('/api/quizzes/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId, updates: { results_visible: !currentValue } }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(!currentValue ? 'تم إظهار النتائج للطلاب' : 'تم إخفاء النتائج عن الطلاب');
        fetchQuizzes();
      } else {
        toast.error('حدث خطأ أثناء تحديث الإعداد');
      }
    } catch {
      toast.error('حدث خطأ أثناء تحديث الإعداد');
    }
  };

  // -------------------------------------------------------
  // Delete quiz
  // -------------------------------------------------------
  const handleDeleteQuiz = async (quizId: string) => {
    setDeletingQuizId(quizId);
    try {
      const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
      if (error) {
        toast.error('حدث خطأ أثناء حذف الاختبار');
      } else {
        toast.success('تم حذف الاختبار بنجاح');
        fetchQuizzes();
        fetchScores();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setDeletingQuizId(null);
    }
  };

  // -------------------------------------------------------
  // Share quiz
  // -------------------------------------------------------
  const handleShareQuiz = (quiz: Quiz) => {
    setShareQuiz(quiz);
    setShareModalOpen(true);
  };

  const handleCopyShareLink = () => {
    if (shareQuiz) {
      const link = `${window.location.origin}/quiz/${shareQuiz.id}`;
      navigator.clipboard.writeText(link);
      toast.success('تم نسخ رابط المشاركة');
    }
  };

  const handleNativeShare = async () => {
    if (shareQuiz && navigator.share) {
      try {
        await navigator.share({
          title: shareQuiz.title,
          text: `اختبار: ${shareQuiz.title}`,
          url: `${window.location.origin}/quiz/${shareQuiz.id}`,
        });
      } catch {
        // User cancelled or share failed
      }
    }
  };

  // -------------------------------------------------------
  // Question builder helpers
  // -------------------------------------------------------
  const resetQuestionForm = () => {
    setCurrentQuestionText('');
    setMcqOptions(['', '', '', '']);
    setMcqCorrect(0);
    setBooleanCorrect(true);
    setCompletionAnswer('');
    setMatchingPairs([{ key: '', value: '' }]);
  };

  const handleAddQuestion = () => {
    if (!currentQuestionText.trim()) {
      toast.error('يرجى إدخال نص السؤال');
      return;
    }

    let question: QuizQuestion;

    switch (currentQuestionType) {
      case 'mcq': {
        const filledOptions = mcqOptions.filter((o) => o.trim());
        if (filledOptions.length < 2) {
          toast.error('يرجى إدخال خيارين على الأقل');
          return;
        }
        if (!mcqOptions[mcqCorrect]?.trim()) {
          toast.error('يرجى التأكد من أن الإجابة الصحيحة ليست فارغة');
          return;
        }
        question = {
          type: 'mcq',
          question: currentQuestionText.trim(),
          options: mcqOptions.map((o) => o.trim()),
          correctAnswer: mcqOptions[mcqCorrect].trim(),
        };
        break;
      }
      case 'boolean': {
        question = {
          type: 'boolean',
          question: currentQuestionText.trim(),
          correctAnswer: booleanCorrect ? 'صح' : 'خطأ',
        };
        break;
      }
      case 'completion': {
        if (!completionAnswer.trim()) {
          toast.error('يرجى إدخال الإجابة الصحيحة');
          return;
        }
        question = {
          type: 'completion',
          question: currentQuestionText.trim(),
          correctAnswer: completionAnswer.trim(),
        };
        break;
      }
      case 'matching': {
        const validPairs = matchingPairs.filter((p) => p.key.trim() && p.value.trim());
        if (validPairs.length < 2) {
          toast.error('يرجى إدخال زوجين على الأقل');
          return;
        }
        question = {
          type: 'matching',
          question: currentQuestionText.trim(),
          pairs: validPairs.map((p) => ({ key: p.key.trim(), value: p.value.trim() })),
        };
        break;
      }
      default:
        return;
    }

    setQuizQuestions([...quizQuestions, question]);
    resetQuestionForm();
    toast.success('تم إضافة السؤال بنجاح');
  };

  const handleRemoveQuestion = (index: number) => {
    setQuizQuestions(quizQuestions.filter((_, i) => i !== index));
  };

  // -------------------------------------------------------
  // Open edit quiz
  // -------------------------------------------------------
  const handleOpenEditQuiz = (quiz: Quiz) => {
    setEditingQuiz(quiz);
    setQuizTitle(quiz.title);
    setQuizDuration(quiz.duration?.toString() || '');
    setQuizDate(quiz.scheduled_date || '');
    setQuizTime(quiz.scheduled_time || '');
    setQuizSubjectId(quiz.subject_id || '');
    setQuizAllowRetake(quiz.allow_retake || false);
    setQuizQuestions([...quiz.questions]);
    resetQuestionForm();
    setCreateQuizOpen(true);
  };

  // -------------------------------------------------------
  // Open create quiz (reset form)
  // -------------------------------------------------------
  const handleOpenCreateQuiz = () => {
    setEditingQuiz(null);
    setQuizTitle('');
    setQuizDuration('');
    setQuizDate('');
    setQuizTime('');
    setQuizSubjectId('');
    setQuizAllowRetake(false);
    setQuizQuestions([]);
    resetQuestionForm();
    setCreateQuizOpen(true);
  };

  // -------------------------------------------------------
  // View quiz results
  // -------------------------------------------------------
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
        // Fetch student profiles
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
        }
      }
    } catch {
      // silently ignore
    } finally {
      setLoadingResults(false);
    }
  };

  // -------------------------------------------------------
  // Create / Update quiz
  // -------------------------------------------------------
  const handleCreateQuiz = async () => {
    if (!quizTitle.trim()) {
      toast.error('يرجى إدخال عنوان الاختبار');
      return;
    }
    if (!quizSubjectId) {
      toast.error('يرجى اختيار المقرر');
      return;
    }
    if (quizQuestions.length === 0) {
      toast.error('يرجى إضافة سؤال واحد على الأقل');
      return;
    }

    setCreatingQuiz(true);
    try {
      const quizData: Record<string, unknown> = {
        user_id: profile.id,
        title: quizTitle.trim(),
        questions: quizQuestions,
        subject_id: quizSubjectId || null,
        allow_retake: quizAllowRetake,
      };

      if (quizDuration.trim()) {
        quizData.duration = parseInt(quizDuration, 10);
      } else {
        quizData.duration = null;
      }
      if (quizDate.trim()) {
        quizData.scheduled_date = quizDate;
      } else {
        quizData.scheduled_date = null;
      }
      if (quizTime.trim()) {
        quizData.scheduled_time = quizTime;
      } else {
        quizData.scheduled_time = null;
      }

      if (editingQuiz) {
        // Update existing quiz - try with allow_retake, fallback without
        let { error } = await supabase
          .from('quizzes')
          .update(quizData)
          .eq('id', editingQuiz.id);

        // If allow_retake column doesn't exist, retry without it
        if (error && error.message?.includes('allow_retake')) {
          const dataWithoutRetake = { ...quizData };
          delete dataWithoutRetake.allow_retake;
          const retryResult = await supabase
            .from('quizzes')
            .update(dataWithoutRetake)
            .eq('id', editingQuiz.id);
          error = retryResult.error;
        }

        if (error) {
          toast.error('حدث خطأ أثناء تعديل الاختبار');
        } else {
          toast.success('تم تعديل الاختبار بنجاح');
          setCreateQuizOpen(false);
          setEditingQuiz(null);
          fetchQuizzes();
        }
      } else {
        // Create new quiz - try with allow_retake, fallback without
        let result = await supabase
          .from('quizzes')
          .insert(quizData)
          .select('id')
          .single();

        // If allow_retake column doesn't exist, retry without it
        if (result.error && result.error.message?.includes('allow_retake')) {
          const dataWithoutRetake = { ...quizData };
          delete dataWithoutRetake.allow_retake;
          result = await supabase
            .from('quizzes')
            .insert(dataWithoutRetake)
            .select('id')
            .single();
        }

        const { data: newQuiz, error } = result;

        if (error) {
          toast.error('حدث خطأ أثناء إنشاء الاختبار');
        } else {
          toast.success('تم إنشاء الاختبار بنجاح');

          // Send notifications to enrolled students if subject is selected
          if (quizSubjectId && newQuiz) {
            try {
              const { data: enrolledStudents } = await supabase
                .from('subject_students')
                .select('student_id')
                .eq('subject_id', quizSubjectId);

              if (enrolledStudents && enrolledStudents.length > 0) {
                const { data: subjectData } = await supabase
                  .from('subjects')
                  .select('name')
                  .eq('id', quizSubjectId)
                  .single();

                const subjectName = (subjectData as any)?.name || 'مقرر';
                const notifications = enrolledStudents.map(s => ({
                  user_id: s.student_id,
                  title: 'اختبار جديد',
                  content: `تم إضافة اختبار "${quizTitle.trim()}" في مادة "${subjectName}"`,
                  type: 'quiz',
                  reference_id: newQuiz.id,
                }));
                await supabase.from('notifications').insert(notifications);
              }
            } catch (notifyErr) {
              console.error('Failed to send notifications:', notifyErr);
            }
          }

          setCreateQuizOpen(false);
          setQuizTitle('');
          setQuizDuration('');
          setQuizDate('');
          setQuizTime('');
          setQuizSubjectId('');
          setQuizAllowRetake(false);
          setQuizQuestions([]);
          resetQuestionForm();
          fetchQuizzes();
        }
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setCreatingQuiz(false);
    }
  };

  // -------------------------------------------------------
  // Settings handlers
  // -------------------------------------------------------
  const handleUpdateProfile = async (updates: Partial<UserProfile>) => {
    return authUpdateProfile(updates);
  };

  const handleDeleteAccount = async () => {
    await authSignOut();
  };

  // -------------------------------------------------------
  // Analytics computed data
  // -------------------------------------------------------
  const barChartData = quizzes.map((q) => {
    const qScores = scores.filter((s) => s.quiz_id === q.id);
    const avg = qScores.length > 0
      ? Math.round(qScores.reduce((sum, s) => sum + scorePercentage(s.score, s.total), 0) / qScores.length)
      : 0;
    return {
      name: q.title.length > 15 ? q.title.slice(0, 15) + '...' : q.title,
      avg,
    };
  });

  const pieChartData = (() => {
    const excellent = scores.filter((s) => scorePercentage(s.score, s.total) >= 90).length;
    const veryGood = scores.filter((s) => { const p = scorePercentage(s.score, s.total); return p >= 75 && p < 90; }).length;
    const good = scores.filter((s) => { const p = scorePercentage(s.score, s.total); return p >= 60 && p < 75; }).length;
    const weak = scores.filter((s) => scorePercentage(s.score, s.total) < 60).length;
    return [
      { name: 'ممتاز', value: excellent },
      { name: 'جيد جداً', value: veryGood },
      { name: 'جيد', value: good },
      { name: 'ضعيف', value: weak },
    ].filter((d) => d.value > 0);
  })();

  // ─── Reports filter & sort state ───
  const [reportSubjectFilter, setReportSubjectFilter] = useState<string>('all');
  const [reportSortKey, setReportSortKey] = useState<'name' | 'avgScore' | 'attendanceRate' | 'quizzesCompleted'>('name');
  const [reportSortDir, setReportSortDir] = useState<'asc' | 'desc'>('asc');

  // Filtered data for reports based on subject
  const filteredReportScores = reportSubjectFilter === 'all'
    ? scores
    : scores.filter((s) => {
        const quiz = quizzes.find((q) => q.id === s.quiz_id);
        return quiz?.subject_id === reportSubjectFilter;
      });

  const filteredReportQuizzes = reportSubjectFilter === 'all'
    ? quizzes
    : quizzes.filter((q) => q.subject_id === reportSubjectFilter);

  // Score distribution for CSS bar chart (0-20%, 20-40%, 40-60%, 60-80%, 80-100%)
  const scoreDistribution = (() => {
    const ranges = [
      { label: '0-20%', min: 0, max: 20, count: 0, color: 'bg-rose-500' },
      { label: '20-40%', min: 20, max: 40, count: 0, color: 'bg-amber-500' },
      { label: '40-60%', min: 40, max: 60, count: 0, color: 'bg-yellow-500' },
      { label: '60-80%', min: 60, max: 80, count: 0, color: 'bg-teal-500' },
      { label: '80-100%', min: 80, max: 101, count: 0, color: 'bg-emerald-500' },
    ];
    filteredReportScores.forEach((s) => {
      const pct = scorePercentage(s.score, s.total);
      for (const range of ranges) {
        if (pct >= range.min && pct < range.max) {
          range.count++;
          break;
        }
      }
    });
    return ranges;
  })();

  // Student performance summary for table
  const studentPerformanceData = students.map((s) => {
    const studentScores = filteredReportScores.filter((sc) => sc.student_id === s.id);
    const avgScore = studentScores.length > 0
      ? Math.round(studentScores.reduce((sum, sc) => sum + scorePercentage(sc.score, sc.total), 0) / studentScores.length)
      : null;
    const attendance = attendanceData.find((a) => a.student_id === s.id);
    const attendanceRate = attendance && attendance.total > 0
      ? Math.round((attendance.attended / attendance.total) * 100)
      : null;
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      avgScore,
      attendanceRate,
      quizzesCompleted: studentScores.length,
    };
  });

  // Sort student performance data
  const sortedStudentPerformance = [...studentPerformanceData].sort((a, b) => {
    let cmp = 0;
    switch (reportSortKey) {
      case 'name': cmp = a.name.localeCompare(b.name, 'ar'); break;
      case 'avgScore': cmp = (a.avgScore ?? -1) - (b.avgScore ?? -1); break;
      case 'attendanceRate': cmp = (a.attendanceRate ?? -1) - (b.attendanceRate ?? -1); break;
      case 'quizzesCompleted': cmp = a.quizzesCompleted - b.quizzesCompleted; break;
    }
    return reportSortDir === 'asc' ? cmp : -cmp;
  });

  // Toggle sort
  const handleReportSort = (key: typeof reportSortKey) => {
    if (reportSortKey === key) {
      setReportSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setReportSortKey(key);
      setReportSortDir('asc');
    }
  };

  // CSV export
  const exportToCSV = (data: Record<string, unknown>[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h];
        if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val ?? '';
      }).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Export student performance as Excel
  const handleExportPerformanceExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const data = sortedStudentPerformance.map((s) => ({
        'اسم الطالب': s.name,
        'البريد الإلكتروني': s.email,
        'متوسط الدرجات': s.avgScore !== null ? `${s.avgScore}%` : 'لا توجد بيانات',
        'نسبة الحضور': s.attendanceRate !== null ? `${s.attendanceRate}%` : 'لا توجد بيانات',
        'الاختبارات المكتملة': s.quizzesCompleted,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'أداء الطلاب');

      // Add score distribution sheet
      const distData = scoreDistribution.map((d) => ({
        'النسبة': d.label,
        'عدد الطلاب': d.count,
      }));
      const ws2 = XLSX.utils.json_to_sheet(distData);
      XLSX.utils.book_append_sheet(wb, ws2, 'توزيع الدرجات');

      const subjectName = reportSubjectFilter === 'all' ? 'جميع_المقررات' : teacherSubjects.find((s) => s.id === reportSubjectFilter)?.name || 'مقرر';
      XLSX.writeFile(wb, `تقرير_أداء_الطلاب_${subjectName}_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('تم تصدير التقرير بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء تصدير البيانات');
    }
  };

  // Export student performance as CSV
  const handleExportPerformanceCSV = () => {
    try {
      const data = sortedStudentPerformance.map((s) => ({
        'اسم الطالب': s.name,
        'البريد الإلكتروني': s.email,
        'متوسط الدرجات': s.avgScore !== null ? `${s.avgScore}%` : 'لا توجد بيانات',
        'نسبة الحضور': s.attendanceRate !== null ? `${s.attendanceRate}%` : 'لا توجد بيانات',
        'الاختبارات المكتملة': s.quizzesCompleted,
      }));
      const subjectName = reportSubjectFilter === 'all' ? 'جميع_المقررات' : teacherSubjects.find((s) => s.id === reportSubjectFilter)?.name || 'مقرر';
      exportToCSV(data as Record<string, unknown>[], `تقرير_أداء_الطلاب_${subjectName}_${new Date().toISOString().split('T')[0]}`);
      toast.success('تم تصدير CSV بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء تصدير البيانات');
    }
  };

  // -------------------------------------------------------
  // Render: Header
  // -------------------------------------------------------
  const renderHeader = () => (
    <motion.div
      variants={itemVariants}
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
    >
      <div>
        <h2 className="text-2xl font-bold text-foreground">أهلاً بك، د. {profile.name}</h2>
        <p className="text-muted-foreground mt-1">لوحة تحكم المعلم</p>
      </div>
      <div className="flex items-center gap-3">
        <RealtimeStatus
          status={rtStatusValue}
          lastUpdated={rtLastUpdated}
          onRefresh={refreshAllData}
        />
        {profile.teacher_code && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCopyTeacherCode}
            className="flex items-center gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 hover:border-emerald-300"
            title="انقر للنسخ"
          >
            <Copy className="h-4 w-4" />
            <span>كود المعلم:</span>
            <span className="font-mono text-base tracking-wider">{profile.teacher_code}</span>
          </motion.button>
        )}
      </div>
    </motion.div>
  );

  // -------------------------------------------------------
  // Render: Dashboard Section
  // -------------------------------------------------------
  const renderDashboard = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {renderHeader()}

      {/* Stats row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          icon={<BookOpen className="h-6 w-6" />}
          label="المقررات"
          value={subjectsCount}
          color="emerald"
        />
        <StatCard
          icon={<Users className="h-6 w-6" />}
          label="إجمالي الطلاب"
          value={students.length}
          color="teal"
        />
        <StatCard
          icon={<ClipboardList className="h-6 w-6" />}
          label="الاختبارات النشطة"
          value={quizzes.length}
          color="amber"
        />
        <StatCard
          icon={<TrendingUp className="h-6 w-6" />}
          label="متوسط الأداء"
          value={`${avgPerformance}%`}
          color="rose"
        />
        <StatCard
          icon={<Award className="h-6 w-6" />}
          label="اختبارات منجزة"
          value={scores.length}
          color="purple"
        />
      </motion.div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Student overview table (2/3) */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-600" />
                نظرة عامة على الطلاب
              </h3>
              <button
                onClick={() => setActiveSection('students')}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
              >
                عرض الكل
                <ChevronLeft className="h-3 w-3" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              {students.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  لا يوجد طلاب مسجلين بعد
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-right font-medium p-3">اسم الطالب</th>
                      <th className="text-right font-medium p-3">آخر نتيجة</th>
                      <th className="text-right font-medium p-3">تفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {students.slice(0, 8).map((student) => {
                      const lastScore = getStudentLastScore(student.id);
                      const pct = lastScore ? scorePercentage(lastScore.score, lastScore.total) : null;
                      return (
                        <tr key={student.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                                {student.name.charAt(0)}
                              </div>
                              <span className="text-sm font-medium text-foreground truncate">{student.name}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            {pct !== null ? (
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${pctColorClass(pct)}`}>
                                {pct}%
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => {
                                setSelectedStudent(student);
                                setStudentDetailOpen(true);
                              }}
                              className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              عرض
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </motion.div>

        {/* Performance alerts (1/3) */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                تنبيهات الأداء
              </h3>
              <button
                onClick={() => setActiveSection('analytics')}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
              >
                عرض الكل
                <ChevronLeft className="h-3 w-3" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              {scores.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  لا توجد نتائج بعد
                </div>
              ) : (
                <div className="divide-y">
                  {scores.slice(0, 6).map((score) => {
                    const pct = scorePercentage(score.score, score.total);
                    const student = students.find((s) => s.id === score.student_id);
                    return (
                      <div key={score.id} className="flex items-center gap-3 p-3">
                        <div
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                            pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-teal-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {student?.name || 'طالب'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {score.quiz_title}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${pctColorClass(pct)}`}>
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );

  // -------------------------------------------------------
  // Render: Students Section
  // -------------------------------------------------------
  const renderStudents = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">الطلاب</h2>
          <p className="text-muted-foreground mt-1">إدارة الطلاب المسجلين لديك</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="بحث عن طالب..."
              className="rounded-lg border bg-background pr-10 pl-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors w-48"
              dir="rtl"
            />
          </div>
          <button
            onClick={handleExportSummaries}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <Download className="h-4 w-4" />
            تصدير الملخصات (Excel)
          </button>
        </div>
      </motion.div>

      {/* Student cards */}
      {filteredStudents.length === 0 ? (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 py-16"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
            <Users className="h-8 w-8 text-emerald-600" />
          </div>
          <p className="text-lg font-semibold text-foreground mb-1">
            {studentSearch ? 'لا توجد نتائج للبحث' : 'لا يوجد طلاب مسجلين'}
          </p>
          <p className="text-sm text-muted-foreground">
            {studentSearch ? 'جرّب البحث بكلمات مختلفة' : 'شارك كود المعلم مع طلابك للتسجيل'}
          </p>
        </motion.div>
      ) : (
        <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStudents.map((student) => {
            const lastScore = getStudentLastScore(student.id);
            const pct = lastScore ? scorePercentage(lastScore.score, lastScore.total) : null;
            const perf = getStudentPerformance(student.id);
            return (
              <motion.div key={student.id} variants={itemVariants} {...cardHover}>
                <div
                  className="group rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    setSelectedStudent(student);
                    setStudentDetailOpen(true);
                  }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold transition-transform group-hover:scale-110">
                      {student.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground truncate">{student.name}</h3>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {student.email}
                      </p>
                    </div>
                  </div>
                  {/* Performance metrics */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="rounded-lg border bg-muted/30 p-2 text-center">
                      <p className="text-xs text-muted-foreground">متوسط الدرجات</p>
                      <p className={`text-sm font-bold ${perf.avgScore !== null ? (perf.avgScore >= 75 ? 'text-emerald-700' : perf.avgScore >= 60 ? 'text-amber-700' : 'text-rose-700') : 'text-muted-foreground'}`}>
                        {perf.avgScore !== null ? `${perf.avgScore}%` : 'لا توجد بيانات'}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-2 text-center">
                      <p className="text-xs text-muted-foreground">الحضور</p>
                      <p className={`text-sm font-bold ${perf.attendanceRate !== null ? (perf.attendanceRate >= 75 ? 'text-emerald-700' : perf.attendanceRate >= 50 ? 'text-amber-700' : 'text-rose-700') : 'text-muted-foreground'}`}>
                        {perf.attendanceRate !== null ? `${perf.attendanceRate}%` : 'لا توجد بيانات'}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-2 text-center">
                      <p className="text-xs text-muted-foreground">الاختبارات</p>
                      <p className="text-sm font-bold text-foreground">
                        {perf.totalQuizzes > 0 ? perf.totalQuizzes : 'لا توجد بيانات'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPerformanceStudent(student);
                        setPerformanceDialogOpen(true);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      عرض الأداء
                    </button>
                    <div className="flex-1" />
                    {pct !== null && (
                      <span className="text-xs text-muted-foreground">
                        آخر نتيجة: <span className={`font-bold ${pctColorClass(pct)}`}>{pct}%</span>
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Student detail modal */}
      <AnimatePresence>
        {studentDetailOpen && selectedStudent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => { if (!resettingStudent) setStudentDetailOpen(false); }}
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
              {/* Header */}
              <div className="flex items-center justify-between border-b p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold">
                    {selectedStudent.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{selectedStudent.name}</h3>
                    <p className="text-xs text-muted-foreground">{selectedStudent.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setStudentDetailOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scores list */}
              <div className="p-5 space-y-3 max-h-72 overflow-y-auto custom-scrollbar">
                {getStudentScores(selectedStudent.id).length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    لا توجد نتائج لهذا الطالب
                  </div>
                ) : (
                  getStudentScores(selectedStudent.id).map((score) => {
                    const pct = scorePercentage(score.score, score.total);
                    return (
                      <div key={score.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50">
                          <ClipboardList className="h-4 w-4 text-teal-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{score.quiz_title}</p>
                          <p className="text-xs text-muted-foreground">{score.score}/{score.total} · {formatDate(score.completed_at)}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${pctColorClass(pct)}`}>
                          {pct}%
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-3 border-t p-5">
                <button
                  onClick={() => handleResetStudent(selectedStudent.id)}
                  disabled={resettingStudent}
                  className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-700 disabled:opacity-60"
                >
                  {resettingStudent ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  تصفير حالة الطالب
                </button>
                <button
                  onClick={() => setStudentDetailOpen(false)}
                  className="rounded-lg border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Performance Detail Dialog */}
      <AnimatePresence>
        {performanceDialogOpen && performanceStudent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setPerformanceDialogOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl rounded-2xl border bg-background shadow-xl max-h-[90vh] overflow-y-auto"
              dir="rtl"
            >
              {(() => {
                const perf = getStudentPerformance(performanceStudent.id);
                const studentScores = getStudentScores(performanceStudent.id);

                return (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b p-5 sticky top-0 bg-background z-10">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold">
                          {performanceStudent.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-foreground">أداء الطالب: {performanceStudent.name}</h3>
                          <p className="text-xs text-muted-foreground">{performanceStudent.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setPerformanceDialogOpen(false)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="p-5 space-y-5">
                      {/* Performance overview cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-xl border p-4 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 mx-auto mb-2">
                            <Award className="h-5 w-5 text-emerald-600" />
                          </div>
                          <p className="text-xs text-muted-foreground">متوسط الدرجات</p>
                          <p className={`text-xl font-bold ${perf.avgScore !== null ? (perf.avgScore >= 75 ? 'text-emerald-700' : perf.avgScore >= 60 ? 'text-amber-700' : 'text-rose-700') : 'text-muted-foreground'}`}>
                            {perf.avgScore !== null ? `${perf.avgScore}%` : 'لا توجد بيانات'}
                          </p>
                        </div>
                        <div className="rounded-xl border p-4 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 mx-auto mb-2">
                            <Users className="h-5 w-5 text-teal-600" />
                          </div>
                          <p className="text-xs text-muted-foreground">نسبة الحضور</p>
                          <p className={`text-xl font-bold ${perf.attendanceRate !== null ? (perf.attendanceRate >= 75 ? 'text-emerald-700' : perf.attendanceRate >= 50 ? 'text-amber-700' : 'text-rose-700') : 'text-muted-foreground'}`}>
                            {perf.attendanceRate !== null ? `${perf.attendanceRate}%` : 'لا توجد بيانات'}
                          </p>
                        </div>
                        <div className="rounded-xl border p-4 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 mx-auto mb-2">
                            <ClipboardList className="h-5 w-5 text-amber-600" />
                          </div>
                          <p className="text-xs text-muted-foreground">اختبارات مكتملة</p>
                          <p className="text-xl font-bold text-foreground">
                            {perf.totalQuizzes > 0 ? perf.totalQuizzes : 'لا توجد بيانات'}
                          </p>
                        </div>
                        <div className="rounded-xl border p-4 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100 mx-auto mb-2">
                            <BarChart3 className="h-5 w-5 text-rose-600" />
                          </div>
                          <p className="text-xs text-muted-foreground">المحاضرات</p>
                          <p className="text-xl font-bold text-foreground">
                            {perf.totalLectures > 0 ? `${perf.attendedLectures}/${perf.totalLectures}` : 'لا توجد بيانات'}
                          </p>
                        </div>
                      </div>

                      {/* Visual performance bar */}
                      {perf.avgScore !== null && (
                        <div className="rounded-xl border p-4">
                          <p className="text-sm font-medium text-foreground mb-3">مؤشر الأداء العام</p>
                          <div className="h-4 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                perf.avgScore >= 75 ? 'bg-emerald-500' : perf.avgScore >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${perf.avgScore}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                            <span>ضعيف</span>
                            <span>مقبول</span>
                            <span>جيد</span>
                            <span>ممتاز</span>
                          </div>
                        </div>
                      )}

                      {/* Quiz scores list */}
                      <div className="rounded-xl border overflow-hidden">
                        <div className="border-b p-4">
                          <h4 className="font-semibold text-foreground flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-emerald-600" />
                            نتائج الاختبارات
                          </h4>
                        </div>
                        <div className="max-h-72 overflow-y-auto custom-scrollbar">
                          {studentScores.length === 0 ? (
                            <div className="p-6 text-center text-muted-foreground text-sm">
                              لا توجد نتائج اختبارات لهذا الطالب
                            </div>
                          ) : (
                            <div className="divide-y">
                              {studentScores.map((score) => {
                                const pct = scorePercentage(score.score, score.total);
                                return (
                                  <div key={score.id} className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate">{score.quiz_title}</p>
                                      <p className="text-xs text-muted-foreground">{score.score}/{score.total} · {formatDate(score.completed_at)}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${
                                            pct >= 75 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                                          }`}
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${pctColorClass(pct)}`}>
                                        {pct}%
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  // -------------------------------------------------------
  // Render: Quizzes Section
  // -------------------------------------------------------
  const renderQuizzes = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">الاختبارات</h2>
          <p className="text-muted-foreground mt-1">إنشاء وإدارة الاختبارات</p>
        </div>
        <button
          onClick={() => handleOpenCreateQuiz()}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          إنشاء اختبار يدوي
        </button>
      </motion.div>

      {/* Quiz cards */}
      {quizzes.length === 0 ? (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-teal-300 bg-teal-50/30 py-16"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 mb-4">
            <ClipboardList className="h-8 w-8 text-teal-600" />
          </div>
          <p className="text-lg font-semibold text-foreground mb-1">لا توجد اختبارات</p>
          <p className="text-sm text-muted-foreground mb-4">ابدأ بإنشاء اختبار جديد لطلابك</p>
          <button
            onClick={() => setCreateQuizOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" />
            إنشاء اختبار
          </button>
        </motion.div>
      ) : (
        <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quizzes.map((quiz) => {
            // Format scheduled date/time nicely
            const formattedSchedule = (() => {
              if (!quiz.scheduled_date) return null;
              try {
                const scheduledDateTime = quiz.scheduled_time
                  ? new Date(`${quiz.scheduled_date}T${quiz.scheduled_time}`)
                  : new Date(quiz.scheduled_date);
                return scheduledDateTime.toLocaleDateString('ar-SA', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  ...(quiz.scheduled_time ? { hour: '2-digit', minute: '2-digit' } : {}),
                });
              } catch {
                return `${quiz.scheduled_date}${quiz.scheduled_time ? ` ${quiz.scheduled_time}` : ''}`;
              }
            })();
            
            // Count students who completed this quiz
            const completedCount = scores.filter((s) => s.quiz_id === quiz.id).length;
            
            return (
            <motion.div key={quiz.id} variants={itemVariants} {...cardHover}>
              <div className="group rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 transition-transform group-hover:scale-110">
                    <ClipboardList className="h-5 w-5 text-teal-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground truncate">{quiz.title}</h3>
                    {quiz.subject_name && (
                      <div className="flex items-center gap-1 mt-1">
                        <BookOpen className="h-3 w-3 text-emerald-600" />
                        <span className="text-[11px] text-emerald-600 font-medium">{quiz.subject_name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
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
                      {formattedSchedule && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formattedSchedule}
                        </span>
                      )}
                      {completedCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {completedCount} طالب أكمل
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Retake toggle */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-dashed">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">السماح بإعادة الاختبار</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const newRetakeValue = !quiz.allow_retake;
                      const { error } = await supabase
                        .from('quizzes')
                        .update({ allow_retake: newRetakeValue })
                        .eq('id', quiz.id);
                      if (error) {
                        toast.error('حدث خطأ أثناء تحديث الإعداد');
                      } else {
                        toast.success(newRetakeValue ? 'تم تفعيل إعادة الاختبار' : 'تم تعطيل إعادة الاختبار');
                        fetchQuizzes();
                      }
                    }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                      quiz.allow_retake ? 'bg-emerald-600' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
                        quiz.allow_retake ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Results visibility toggle */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-dashed">
                  <div className="flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">إظهار النتائج للطلاب</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleResults(quiz.id, quiz.results_visible !== false)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                      quiz.results_visible !== false ? 'bg-emerald-600' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
                        quiz.results_visible !== false ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <button
                    onClick={() => handleViewQuizResults(quiz)}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-teal-700 border-teal-200 bg-teal-50 hover:bg-teal-100 transition-colors"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    النتائج
                  </button>
                  <button
                    onClick={() => handleOpenEditQuiz(quiz)}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    تعديل
                  </button>
                  <button
                    onClick={() => handleShareQuiz(quiz)}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    مشاركة
                  </button>
                  <button
                    onClick={() => handleDeleteQuiz(quiz.id)}
                    disabled={deletingQuizId === quiz.id}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-rose-700 border-rose-200 bg-rose-50 hover:bg-rose-100 transition-colors"
                  >
                    {deletingQuizId === quiz.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    حذف
                  </button>
                </div>
              </div>
            </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Create quiz modal */}
      <AnimatePresence>
        {createQuizOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => { if (!creatingQuiz) setCreateQuizOpen(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl rounded-2xl border bg-background shadow-xl max-h-[90vh] overflow-y-auto"
              dir="rtl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b p-5 sticky top-0 bg-background z-10">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-emerald-600" />
                  {editingQuiz ? 'تعديل الاختبار' : 'إنشاء اختبار جديد'}
                </h3>
                <button
                  onClick={() => { if (!creatingQuiz) setCreateQuizOpen(false); }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-5">
                {/* Title */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">عنوان الاختبار</label>
                  <input
                    type="text"
                    value={quizTitle}
                    onChange={(e) => setQuizTitle(e.target.value)}
                    placeholder="مثال: اختبار الفصل الثاني - الرياضيات"
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                    disabled={creatingQuiz}
                    dir="rtl"
                  />
                </div>

                {/* Subject selector */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">المقرر <span className="text-rose-500">*</span></label>
                  <select
                    value={quizSubjectId}
                    onChange={(e) => setQuizSubjectId(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                    disabled={creatingQuiz}
                    dir="rtl"
                  >
                    <option value="">اختر المقرر</option>
                    {teacherSubjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Duration & date/time */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">المدة (دقيقة)</label>
                    <input
                      type="number"
                      value={quizDuration}
                      onChange={(e) => setQuizDuration(e.target.value)}
                      placeholder="30"
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                      disabled={creatingQuiz}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">التاريخ (اختياري)</label>
                    <input
                      type="date"
                      value={quizDate}
                      onChange={(e) => setQuizDate(e.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                      disabled={creatingQuiz}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">الوقت (اختياري)</label>
                    <input
                      type="time"
                      value={quizTime}
                      onChange={(e) => setQuizTime(e.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                      disabled={creatingQuiz}
                    />
                  </div>
                </div>

                {/* Allow retake toggle */}
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">السماح بإعادة الاختبار</p>
                    <p className="text-xs text-muted-foreground mt-0.5">السماح للطلاب بإعادة الاختبار بعد إتمامه</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuizAllowRetake(!quizAllowRetake)}
                    disabled={creatingQuiz}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                      quizAllowRetake ? 'bg-emerald-600' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                        quizAllowRetake ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="border-t pt-5">
                  <h4 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                    <Plus className="h-4 w-4 text-emerald-600" />
                    إضافة سؤال
                  </h4>

                  {/* Question type selector */}
                  <div className="mb-4">
                    <label className="text-sm font-medium text-foreground mb-1.5 block">نوع السؤال</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { type: 'mcq' as const, label: 'اختيار متعدد' },
                        { type: 'boolean' as const, label: 'صح/خطأ' },
                        { type: 'completion' as const, label: 'إكمال' },
                        { type: 'matching' as const, label: 'مطابقة' },
                      ].map((opt) => (
                        <button
                          key={opt.type}
                          onClick={() => setCurrentQuestionType(opt.type)}
                          disabled={creatingQuiz}
                          className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                            currentQuestionType === opt.type
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-border text-muted-foreground hover:bg-muted/50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Question text */}
                  <div className="mb-4">
                    <label className="text-sm font-medium text-foreground mb-1.5 block">نص السؤال</label>
                    <input
                      type="text"
                      value={currentQuestionText}
                      onChange={(e) => setCurrentQuestionText(e.target.value)}
                      placeholder={
                        currentQuestionType === 'completion'
                          ? 'أدخل النص مع ____ مكان الفراغ'
                          : 'أدخل نص السؤال'
                      }
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                      disabled={creatingQuiz}
                      dir="rtl"
                    />
                  </div>

                  {/* MCQ options */}
                  {currentQuestionType === 'mcq' && (
                    <div className="space-y-2 mb-4">
                      <label className="text-sm font-medium text-foreground mb-1.5 block">الخيارات</label>
                      {mcqOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMcqCorrect(idx)}
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                              mcqCorrect === idx
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-muted-foreground/30 hover:border-emerald-400'
                            }`}
                          >
                            {mcqCorrect === idx && <CheckCircle2 className="h-3.5 w-3.5" />}
                          </button>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...mcqOptions];
                              newOpts[idx] = e.target.value;
                              setMcqOptions(newOpts);
                            }}
                            placeholder={`الخيار ${idx + 1}`}
                            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                            disabled={creatingQuiz}
                            dir="rtl"
                          />
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">اضغط على الدائرة لتحديد الإجابة الصحيحة</p>
                    </div>
                  )}

                  {/* Boolean */}
                  {currentQuestionType === 'boolean' && (
                    <div className="mb-4">
                      <label className="text-sm font-medium text-foreground mb-1.5 block">الإجابة الصحيحة</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setBooleanCorrect(true)}
                          disabled={creatingQuiz}
                          className={`rounded-lg border px-5 py-2.5 text-sm font-medium transition-all ${
                            booleanCorrect
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                              : 'border-border text-muted-foreground hover:bg-muted/50'
                          }`}
                        >
                          صح
                        </button>
                        <button
                          onClick={() => setBooleanCorrect(false)}
                          disabled={creatingQuiz}
                          className={`rounded-lg border px-5 py-2.5 text-sm font-medium transition-all ${
                            !booleanCorrect
                              ? 'border-rose-500 bg-rose-50 text-rose-700'
                              : 'border-border text-muted-foreground hover:bg-muted/50'
                          }`}
                        >
                          خطأ
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Completion */}
                  {currentQuestionType === 'completion' && (
                    <div className="mb-4">
                      <label className="text-sm font-medium text-foreground mb-1.5 block">الإجابة الصحيحة</label>
                      <input
                        type="text"
                        value={completionAnswer}
                        onChange={(e) => setCompletionAnswer(e.target.value)}
                        placeholder="أدخل الإجابة الصحيحة للفراغ"
                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                        disabled={creatingQuiz}
                        dir="rtl"
                      />
                    </div>
                  )}

                  {/* Matching */}
                  {currentQuestionType === 'matching' && (
                    <div className="space-y-3 mb-4">
                      <label className="text-sm font-medium text-foreground mb-1.5 block">أزواج المطابقة</label>
                      {matchingPairs.map((pair, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                          <input
                            type="text"
                            value={pair.key}
                            onChange={(e) => {
                              const newPairs = [...matchingPairs];
                              newPairs[idx] = { ...newPairs[idx], key: e.target.value };
                              setMatchingPairs(newPairs);
                            }}
                            placeholder="العنصر"
                            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                            disabled={creatingQuiz}
                            dir="rtl"
                          />
                          <span className="text-muted-foreground text-sm">←</span>
                          <input
                            type="text"
                            value={pair.value}
                            onChange={(e) => {
                              const newPairs = [...matchingPairs];
                              newPairs[idx] = { ...newPairs[idx], value: e.target.value };
                              setMatchingPairs(newPairs);
                            }}
                            placeholder="المطابق"
                            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                            disabled={creatingQuiz}
                            dir="rtl"
                          />
                          {matchingPairs.length > 1 && (
                            <button
                              onClick={() => {
                                setMatchingPairs(matchingPairs.filter((_, i) => i !== idx));
                              }}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 transition-colors"
                              disabled={creatingQuiz}
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => setMatchingPairs([...matchingPairs, { key: '', value: '' }])}
                        disabled={creatingQuiz}
                        className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        إضافة زوج آخر
                      </button>
                    </div>
                  )}

                  {/* Add question button */}
                  <button
                    onClick={handleAddQuestion}
                    disabled={creatingQuiz}
                    className="flex items-center gap-2 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/30 px-4 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400 transition-colors w-full justify-center"
                  >
                    <Plus className="h-4 w-4" />
                    إضافة سؤال
                  </button>
                </div>

                {/* Added questions list */}
                {quizQuestions.length > 0 && (
                  <div className="border-t pt-5">
                    <h4 className="text-sm font-bold text-foreground mb-3">
                      الأسئلة المضافة ({quizQuestions.length})
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                      {quizQuestions.map((q, idx) => (
                        <div key={idx} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{q.question}</p>
                            <p className="text-xs text-muted-foreground">
                              {q.type === 'mcq' ? 'اختيار متعدد' : q.type === 'boolean' ? 'صح/خطأ' : q.type === 'completion' ? 'إكمال' : 'مطابقة'}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRemoveQuestion(idx)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 transition-colors"
                            disabled={creatingQuiz}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-3 border-t p-5 sticky bottom-0 bg-background">
                <button
                  onClick={handleCreateQuiz}
                  disabled={creatingQuiz || !quizTitle.trim() || !quizSubjectId || quizQuestions.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {creatingQuiz ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {editingQuiz ? 'جاري التعديل...' : 'جاري الإنشاء...'}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      {editingQuiz ? 'تعديل الاختبار' : 'إنشاء الاختبار'}
                    </>
                  )}
                </button>
                <button
                  onClick={() => { if (!creatingQuiz) setCreateQuizOpen(false); }}
                  disabled={creatingQuiz}
                  className="rounded-lg border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quiz Results Dialog */}
      <AnimatePresence>
        {viewingQuizResults && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setViewingQuizResults(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl rounded-2xl border bg-background shadow-xl max-h-[90vh] overflow-y-auto"
              dir="rtl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b p-5 sticky top-0 bg-background z-10">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                  نتائج اختبار: {viewingQuizResults.title}
                  {(viewingQuizResults as any).subject_name && (
                    <Badge variant="outline" className="text-xs border-emerald-300 bg-emerald-50 text-emerald-700 mr-2">
                      <BookOpen className="h-3 w-3 ml-1" />
                      {(viewingQuizResults as any).subject_name}
                    </Badge>
                  )}
                </h3>
                <button
                  onClick={() => setViewingQuizResults(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5">
                {loadingResults ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                  </div>
                ) : quizResultsScores.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Users className="h-12 w-12 mb-3 text-muted-foreground/40" />
                    <p className="text-sm">لا يوجد طلاب أكملوا هذا الاختبار بعد</p>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="rounded-xl border bg-emerald-50 p-4 text-center">
                        <p className="text-2xl font-bold text-emerald-700">{quizResultsScores.length}</p>
                        <p className="text-xs text-emerald-600">طالب أكمل</p>
                      </div>
                      <div className="rounded-xl border bg-teal-50 p-4 text-center">
                        <p className="text-2xl font-bold text-teal-700">
                          {quizResultsScores.length > 0
                            ? Math.round(quizResultsScores.reduce((sum, s) => sum + (s.total > 0 ? (s.score / s.total) * 100 : 0), 0) / quizResultsScores.length)
                            : 0}%
                        </p>
                        <p className="text-xs text-teal-600">متوسط النسبة</p>
                      </div>
                      <div className="rounded-xl border bg-amber-50 p-4 text-center">
                        <p className="text-2xl font-bold text-amber-700">
                          {quizResultsScores.filter(s => s.total > 0 && (s.score / s.total) * 100 >= 60).length}
                        </p>
                        <p className="text-xs text-amber-600">ناجح (≥60%)</p>
                      </div>
                    </div>

                    {/* Students table */}
                    <div className="rounded-xl border overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr className="text-xs text-muted-foreground">
                            <th className="text-right font-medium p-3">الطالب</th>
                            <th className="text-center font-medium p-3">الدرجة</th>
                            <th className="text-center font-medium p-3">النسبة</th>
                            <th className="text-center font-medium p-3">التاريخ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {quizResultsScores.map((s) => {
                            const pct = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
                            const student = quizResultsStudents[s.student_id];
                            return (
                              <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                                      {student?.name?.charAt(0) || '؟'}
                                    </div>
                                    <span className="text-sm font-medium text-foreground">{student?.name || 'طالب'}</span>
                                  </div>
                                </td>
                                <td className="p-3 text-center">
                                  <span className="text-sm font-medium">{s.score}/{s.total}</span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${pctColorClass(pct)}`}>
                                    {pct}%
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className="text-xs text-muted-foreground">{formatDate(s.completed_at)}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share modal */}
      <AnimatePresence>
        {shareModalOpen && shareQuiz && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setShareModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border bg-background shadow-xl"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b p-5">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Share2 className="h-5 w-5 text-emerald-600" />
                  مشاركة الاختبار
                </h3>
                <button
                  onClick={() => setShareModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-muted-foreground">
                  شارك هذا الرابط مع طلابك للانضمام إلى الاختبار
                </p>
                <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/quiz/${shareQuiz.id}`}
                    className="flex-1 bg-transparent text-sm text-foreground outline-none font-mono"
                    dir="ltr"
                  />
                  <button
                    onClick={handleCopyShareLink}
                    className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    نسخ
                  </button>
                </div>
                {typeof navigator.share === 'function' && (
                  <button
                    onClick={handleNativeShare}
                    className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors w-full justify-center"
                  >
                    <Share2 className="h-4 w-4" />
                    مشاركة عبر التطبيقات
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  // -------------------------------------------------------
  // Render: Analytics Section
  // -------------------------------------------------------
  const renderAnalytics = () => {
    const maxDistCount = Math.max(...scoreDistribution.map((d) => d.count), 1);

    return (
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">التقارير والإحصائيات</h2>
            <p className="text-muted-foreground mt-1">تحليل شامل لأداء الطلاب والاختبارات</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportPerformanceExcel}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              <Download className="h-4 w-4" />
              تصدير Excel
            </button>
            <button
              onClick={handleExportPerformanceCSV}
              className="flex items-center gap-2 rounded-lg border border-emerald-600 px-4 py-2.5 text-sm font-medium text-emerald-600 shadow-sm transition-colors hover:bg-emerald-50"
            >
              <Download className="h-4 w-4" />
              تصدير CSV
            </button>
          </div>
        </motion.div>

        {/* Subject Filter */}
        <motion.div variants={itemVariants} className="flex items-center gap-3">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">تصفية حسب المقرر:</span>
          <select
            value={reportSubjectFilter}
            onChange={(e) => setReportSubjectFilter(e.target.value)}
            className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">جميع المقررات</option>
            {teacherSubjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </motion.div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recharts: Bar chart */}
          <motion.div variants={itemVariants}>
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                متوسط الأداء لكل اختبار
              </h3>
              {barChartData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  لا توجد بيانات كافية
                </div>
              ) : (
                <div className="h-72" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportSubjectFilter === 'all' ? barChartData : filteredReportQuizzes.map((q) => {
                      const qScores = filteredReportScores.filter((s) => s.quiz_id === q.id);
                      const avg = qScores.length > 0
                        ? Math.round(qScores.reduce((sum, s) => sum + scorePercentage(s.score, s.total), 0) / qScores.length)
                        : 0;
                      return { name: q.title.length > 15 ? q.title.slice(0, 15) + '...' : q.title, avg };
                    })} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        angle={-20}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, 'متوسط الأداء']}
                        contentStyle={{ direction: 'rtl', textAlign: 'right' }}
                      />
                      <Bar
                        dataKey="avg"
                        fill="#10b981"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={50}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </motion.div>

          {/* Pie chart */}
          <motion.div variants={itemVariants}>
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <Award className="h-4 w-4 text-teal-600" />
                توزيع أداء الطلاب
              </h3>
              {pieChartData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  لا توجد بيانات كافية
                </div>
              ) : (
                <div className="h-72" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={(() => {
                          const excellent = filteredReportScores.filter((s) => scorePercentage(s.score, s.total) >= 90).length;
                          const veryGood = filteredReportScores.filter((s) => { const p = scorePercentage(s.score, s.total); return p >= 75 && p < 90; }).length;
                          const good = filteredReportScores.filter((s) => { const p = scorePercentage(s.score, s.total); return p >= 60 && p < 75; }).length;
                          const weak = filteredReportScores.filter((s) => scorePercentage(s.score, s.total) < 60).length;
                          return [
                            { name: 'ممتاز', value: excellent },
                            { name: 'جيد جداً', value: veryGood },
                            { name: 'جيد', value: good },
                            { name: 'ضعيف', value: weak },
                          ].filter((d) => d.value > 0);
                        })()}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name} (${value})`}
                      >
                        {pieChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ direction: 'rtl', textAlign: 'right' }}
                      />
                      <Legend
                        formatter={(value) => <span style={{ color: '#374151', fontSize: 12 }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* CSS-based Score Distribution Bar Chart */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-emerald-600" />
              توزيع الدرجات
            </h3>
            <div className="space-y-3">
              {scoreDistribution.map((range) => (
                <div key={range.label} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-14 text-left shrink-0" dir="ltr">{range.label}</span>
                  <div className="flex-1 h-8 bg-muted/30 rounded-lg overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: maxDistCount > 0 ? `${(range.count / maxDistCount) * 100}%` : '0%' }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className={`h-full ${range.color} rounded-lg flex items-center justify-end px-2`}
                    >
                      {range.count > 0 && (
                        <span className="text-xs font-bold text-white">{range.count}</span>
                      )}
                    </motion.div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* CSS-based Student Performance Comparison */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-600" />
              مقارنة أداء الطلاب
            </h3>
            {sortedStudentPerformance.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                لا يوجد طلاب
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {sortedStudentPerformance.map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="text-xs text-foreground w-28 truncate shrink-0" title={s.name}>{s.name}</span>
                    <div className="flex-1 h-6 bg-muted/30 rounded-md overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: s.avgScore !== null ? `${s.avgScore}%` : '0%' }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className={`h-full rounded-md flex items-center justify-end px-2 ${
                          s.avgScore === null ? 'bg-muted' :
                          s.avgScore >= 90 ? 'bg-emerald-500' :
                          s.avgScore >= 75 ? 'bg-teal-500' :
                          s.avgScore >= 60 ? 'bg-amber-500' :
                          'bg-rose-500'
                        }`}
                      >
                        <span className="text-[10px] font-bold text-white">
                          {s.avgScore !== null ? `${s.avgScore}%` : '—'}
                        </span>
                      </motion.div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Student Performance Table with Sort */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-teal-600" />
                ملخص أداء الطلاب
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPerformanceCSV}
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </button>
                <button
                  onClick={handleExportPerformanceExcel}
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  <Download className="h-3.5 w-3.5" />
                  Excel
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {sortedStudentPerformance.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  لا يوجد طلاب
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr className="text-xs text-muted-foreground">
                      <th
                        className="text-right font-medium p-3 cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleReportSort('name')}
                      >
                        <span className="inline-flex items-center gap-1">
                          اسم الطالب
                          {reportSortKey === 'name' && (
                            <span className="text-emerald-600">{reportSortDir === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </span>
                      </th>
                      <th
                        className="text-right font-medium p-3 cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleReportSort('avgScore')}
                      >
                        <span className="inline-flex items-center gap-1">
                          متوسط الدرجات
                          {reportSortKey === 'avgScore' && (
                            <span className="text-emerald-600">{reportSortDir === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </span>
                      </th>
                      <th
                        className="text-right font-medium p-3 cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleReportSort('attendanceRate')}
                      >
                        <span className="inline-flex items-center gap-1">
                          نسبة الحضور
                          {reportSortKey === 'attendanceRate' && (
                            <span className="text-emerald-600">{reportSortDir === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </span>
                      </th>
                      <th
                        className="text-right font-medium p-3 cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleReportSort('quizzesCompleted')}
                      >
                        <span className="inline-flex items-center gap-1">
                          الاختبارات المكتملة
                          {reportSortKey === 'quizzesCompleted' && (
                            <span className="text-emerald-600">{reportSortDir === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortedStudentPerformance.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                              <Users className="h-4 w-4 text-emerald-600" />
                            </div>
                            <div>
                              <span className="text-sm font-medium text-foreground block">{s.name}</span>
                              <span className="text-[10px] text-muted-foreground">{s.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          {s.avgScore !== null ? (
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${pctColorClass(s.avgScore)}`}>
                              {s.avgScore}%
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">لا توجد بيانات</span>
                          )}
                        </td>
                        <td className="p-3">
                          {s.attendanceRate !== null ? (
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              s.attendanceRate >= 90 ? 'text-emerald-700 bg-emerald-100' :
                              s.attendanceRate >= 75 ? 'text-teal-700 bg-teal-100' :
                              s.attendanceRate >= 60 ? 'text-amber-700 bg-amber-100' :
                              'text-rose-700 bg-rose-100'
                            }`}>
                              {s.attendanceRate}%
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">لا توجد بيانات</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-foreground">{s.quizzesCompleted}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </motion.div>

        {/* Detailed table per quiz */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-teal-600" />
                تفاصيل الاختبارات
              </h3>
              <button
                onClick={handleExportAllData}
                className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                <Download className="h-3.5 w-3.5" />
                تصدير كافة البيانات
              </button>
            </div>
            <div className="overflow-x-auto">
              {filteredReportQuizzes.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  لا توجد اختبارات
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-right font-medium p-3">اسم الاختبار</th>
                      <th className="text-right font-medium p-3">المقرر</th>
                      <th className="text-right font-medium p-3">عدد الطلاب</th>
                      <th className="text-right font-medium p-3">متوسط الأداء</th>
                      <th className="text-right font-medium p-3">تحميل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredReportQuizzes.map((quiz) => {
                      const qScores = filteredReportScores.filter((s) => s.quiz_id === quiz.id);
                      const avg = qScores.length > 0
                        ? Math.round(qScores.reduce((sum, s) => sum + scorePercentage(s.score, s.total), 0) / qScores.length)
                        : 0;
                      return (
                        <tr key={quiz.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-100">
                                <ClipboardList className="h-4 w-4 text-teal-600" />
                              </div>
                              <span className="text-sm font-medium text-foreground truncate">{quiz.title}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="text-sm text-muted-foreground">{quiz.subject_name || '—'}</span>
                          </td>
                          <td className="p-3">
                            <span className="text-sm text-foreground">{qScores.length}</span>
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${pctColorClass(avg)}`}>
                              {avg}%
                            </span>
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => handleExportQuizData(quiz)}
                              disabled={qScores.length === 0}
                              className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Excel
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  };

  // -------------------------------------------------------
  // Main render
  // -------------------------------------------------------
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppSidebar
        role="teacher"
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        userName={profile.name}
        onSignOut={onSignOut}
        unreadNotifications={unreadNotifications}
        unreadMessages={unreadMessages}
        notificationBellSlot={
          isMobile ? (
            <NotificationBell
              profile={profile}
              onOpenPanel={() => setActiveSection('notifications')}
            />
          ) : undefined
        }
      />

      {/* Main content */}
      <main className="md:mr-72 min-h-screen">
        {/* Desktop: sticky top bar with notification bell */}
        {!isMobile && (
          <div className="sticky top-0 z-20 flex items-center justify-end gap-3 border-b bg-background/95 backdrop-blur-sm px-6 py-2">
            <NotificationBell
              profile={profile}
              onOpenPanel={() => setActiveSection('notifications')}
            />
          </div>
        )}
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {loadingData ? (
            <div className="flex flex-col items-center justify-center py-32">
              <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mb-4" />
              <p className="text-muted-foreground text-sm">جاري تحميل البيانات...</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                {activeSection === 'dashboard' && renderDashboard()}
                {activeSection === 'students' && renderStudents()}
                {activeSection === 'quizzes' && renderQuizzes()}
                {activeSection === 'analytics' && renderAnalytics()}
                {activeSection === 'subjects' && (
                  viewingSubjectId
                    ? <SubjectDetail subjectId={viewingSubjectId} profile={profile} onBack={() => setViewingSubjectId(null)} />
                    : <SubjectsSection profile={profile} role="teacher" />
                )}
                {activeSection === 'chat' && (
                  <div className="h-[calc(100vh-8rem)] sm:h-[calc(100vh-7rem)] overflow-hidden rounded-xl border bg-card shadow-sm">
                    <ChatPanel profile={profile} />
                  </div>
                )}
                {activeSection === 'lectures' && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="flex flex-col items-center justify-center py-32"
                    dir="rtl"
                  >
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mb-5">
                      <Video className="h-10 w-10 text-emerald-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">المحاضرات</h2>
                    <p className="text-muted-foreground text-center max-w-sm">سيتم إضافة المحاضرات قريباً</p>
                  </motion.div>
                )}
                {activeSection === 'notifications' && (
                  <NotificationsPanel profile={profile} onBack={() => setActiveSection('dashboard')} />
                )}
                {activeSection === 'settings' && (
                  <SettingsPage profile={profile} onBack={() => setActiveSection('dashboard')} />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Settings modal — kept for backward compat, now using SettingsPage */}
    </div>
  );
}
