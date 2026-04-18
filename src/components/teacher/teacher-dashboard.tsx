'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AppSidebar from '@/components/shared/app-sidebar';
import SettingsModal from '@/components/shared/settings-modal';
import StatCard from '@/components/shared/stat-card';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import type { UserProfile, Quiz, QuizQuestion, Score, TeacherSection } from '@/lib/types';

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
  if (total === 0) return 0;
  return Math.round((score / total) * 100);
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
  const [activeSection, setActiveSection] = useState<TeacherSection>('dashboard');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ─── Stores ───
  const { setTeacherSection: storeSetTeacherSection } = useAppStore();
  const { updateProfile: authUpdateProfile, signOut: authSignOut } = useAuthStore();

  // ─── Data state ───
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loadingData, setLoadingData] = useState(true);

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

  // -------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------
  const fetchStudents = useCallback(async () => {
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
  }, [profile.id]);

  const fetchQuizzes = useCallback(async () => {
    const { data, error } = await supabase
      .from('quizzes')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching quizzes:', error);
    } else {
      setQuizzes((data as Quiz[]) || []);
    }
  }, [profile.id]);

  const fetchScores = useCallback(async () => {
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
  }, [profile.id]);

  const fetchAllData = useCallback(async () => {
    setLoadingData(true);
    await Promise.all([fetchStudents(), fetchQuizzes(), fetchScores()]);
    setLoadingData(false);
  }, [fetchStudents, fetchQuizzes, fetchScores]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // -------------------------------------------------------
  // Realtime subscriptions
  // -------------------------------------------------------
  useEffect(() => {
    const linksChannel = supabase
      .channel('teacher-links-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teacher_student_links', filter: `teacher_id=eq.${profile.id}` },
        () => { fetchStudents(); }
      )
      .subscribe();

    const quizzesChannel = supabase
      .channel('teacher-quizzes-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quizzes', filter: `user_id=eq.${profile.id}` },
        () => { fetchQuizzes(); }
      )
      .subscribe();

    const scoresChannel = supabase
      .channel('teacher-scores-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores', filter: `teacher_id=eq.${profile.id}` },
        () => { fetchScores(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(linksChannel);
      supabase.removeChannel(quizzesChannel);
      supabase.removeChannel(scoresChannel);
    };
  }, [profile.id, fetchStudents, fetchQuizzes, fetchScores]);

  // -------------------------------------------------------
  // Section change handler
  // -------------------------------------------------------
  const handleSectionChange = (section: string) => {
    if (section === 'settings') {
      setSettingsOpen(true);
      return;
    }
    setActiveSection(section as TeacherSection);
    storeSetTeacherSection(section as TeacherSection);
  };

  // -------------------------------------------------------
  // Computed values
  // -------------------------------------------------------
  const avgPerformance = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + scorePercentage(s.score, s.total), 0) / scores.length)
    : 0;

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
  // Create quiz
  // -------------------------------------------------------
  const handleCreateQuiz = async () => {
    if (!quizTitle.trim()) {
      toast.error('يرجى إدخال عنوان الاختبار');
      return;
    }
    if (quizQuestions.length === 0) {
      toast.error('يرجى إضافة سؤال واحد على الأقل');
      return;
    }

    setCreatingQuiz(true);
    try {
      const insertData: Record<string, unknown> = {
        user_id: profile.id,
        title: quizTitle.trim(),
        questions: quizQuestions,
      };

      if (quizDuration.trim()) {
        insertData.duration = parseInt(quizDuration, 10);
      }
      if (quizDate.trim()) {
        insertData.scheduled_date = quizDate;
      }
      if (quizTime.trim()) {
        insertData.scheduled_time = quizTime;
      }

      const { error } = await supabase.from('quizzes').insert(insertData);

      if (error) {
        toast.error('حدث خطأ أثناء إنشاء الاختبار');
      } else {
        toast.success('تم إنشاء الاختبار بنجاح');
        setCreateQuizOpen(false);
        setQuizTitle('');
        setQuizDuration('');
        setQuizDate('');
        setQuizTime('');
        setQuizQuestions([]);
        resetQuestionForm();
        fetchQuizzes();
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
    </motion.div>
  );

  // -------------------------------------------------------
  // Render: Dashboard Section
  // -------------------------------------------------------
  const renderDashboard = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {renderHeader()}

      {/* Stats row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="h-6 w-6" />}
          label="إجمالي الطلاب"
          value={students.length}
          color="emerald"
        />
        <StatCard
          icon={<ClipboardList className="h-6 w-6" />}
          label="الاختبارات النشطة"
          value={quizzes.length}
          color="teal"
        />
        <StatCard
          icon={<TrendingUp className="h-6 w-6" />}
          label="متوسط الأداء"
          value={`${avgPerformance}%`}
          color="amber"
        />
        <StatCard
          icon={<Award className="h-6 w-6" />}
          label="اختبارات منجزة"
          value={scores.length}
          color="rose"
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
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">آخر نتيجة</span>
                    {pct !== null ? (
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${pctColorClass(pct)}`}>
                        {pct}%
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">لا توجد نتائج</span>
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
          onClick={() => setCreateQuizOpen(true)}
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
          {quizzes.map((quiz) => (
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
                      {quiz.scheduled_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {quiz.scheduled_date}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t">
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
          ))}
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
                  إنشاء اختبار جديد
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
                  disabled={creatingQuiz || !quizTitle.trim() || quizQuestions.length === 0}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {creatingQuiz ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جاري الإنشاء...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      إنشاء الاختبار
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
  const renderAnalytics = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">التقارير والإحصائيات</h2>
          <p className="text-muted-foreground mt-1">تحليل شامل لأداء الطلاب والاختبارات</p>
        </div>
        <button
          onClick={handleExportAllData}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <Download className="h-4 w-4" />
          تصدير كافة البيانات (Excel)
        </button>
      </motion.div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart */}
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
                  <BarChart data={barChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
                      data={pieChartData}
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

      {/* Detailed table per quiz */}
      <motion.div variants={itemVariants}>
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b p-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-teal-600" />
              تفاصيل الاختبارات
            </h3>
          </div>
          <div className="overflow-x-auto">
            {quizzes.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                لا توجد اختبارات
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-right font-medium p-3">اسم الاختبار</th>
                    <th className="text-right font-medium p-3">عدد الطلاب</th>
                    <th className="text-right font-medium p-3">متوسط الأداء</th>
                    <th className="text-right font-medium p-3">تحميل</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quizzes.map((quiz) => {
                    const qScores = scores.filter((s) => s.quiz_id === quiz.id);
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
      />

      {/* Main content */}
      <main className="md:mr-72 min-h-screen">
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
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Settings modal */}
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        profile={profile}
        onUpdateProfile={handleUpdateProfile}
        onDeleteAccount={handleDeleteAccount}
      />
    </div>
  );
}
