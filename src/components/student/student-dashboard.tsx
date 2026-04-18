'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  ClipboardList,
  Users,
  BookOpen,
  Award,
  Plus,
  Upload,
  X,
  Loader2,
  Search,
  Link2,
  ChevronLeft,
  Calendar,
  Hash,
  CheckCircle2,
  Eye,
  Play,
  UserPlus,
  Trash2,
  FileUp,
  Type,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AppSidebar from '@/components/shared/app-sidebar';
import SettingsModal from '@/components/shared/settings-modal';
import StatCard from '@/components/shared/stat-card';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import type { UserProfile, Summary, Quiz, Score, StudentSection } from '@/lib/types';

// -------------------------------------------------------
// PDF.js worker setup - lazy loaded to avoid server-side DOMMatrix error
// -------------------------------------------------------
let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function getPdfjsLib() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  }
  return pdfjsLib;
}

// -------------------------------------------------------
// Props
// -------------------------------------------------------
interface StudentDashboardProps {
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
// Helper: format date to Arabic-friendly string
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

// -------------------------------------------------------
// Helper: calculate score percentage
// -------------------------------------------------------
function scorePercentage(score: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((score / total) * 100);
}

// -------------------------------------------------------
// Main Component
// -------------------------------------------------------
export default function StudentDashboard({ profile, onSignOut }: StudentDashboardProps) {
  // ─── Navigation ───
  const [activeSection, setActiveSection] = useState<StudentSection>('dashboard');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ─── App store ───
  const { setViewingQuizId, setViewingSummaryId } = useAppStore();

  // ─── Auth store ───
  const { updateProfile: authUpdateProfile, signOut: authSignOut } = useAuthStore();

  // ─── Data state ───
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [linkedTeachers, setLinkedTeachers] = useState<UserProfile[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // ─── New summary modal ───
  const [newSummaryOpen, setNewSummaryOpen] = useState(false);
  const [summaryTitle, setSummaryTitle] = useState('');
  const [summaryInputMode, setSummaryInputMode] = useState<'text' | 'file'>('text');
  const [summaryText, setSummaryText] = useState('');
  const [summaryFile, setSummaryFile] = useState<File | null>(null);
  const [creatingSummary, setCreatingSummary] = useState(false);
  const [summaryStep, setSummaryStep] = useState<'input' | 'processing'>('input');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Link teacher modal ───
  const [linkTeacherOpen, setLinkTeacherOpen] = useState(false);
  const [teacherCode, setTeacherCode] = useState('');
  const [linkingTeacher, setLinkingTeacher] = useState(false);

  // ─── Deleting summary state ───
  const [deletingSummaryId, setDeletingSummaryId] = useState<string | null>(null);

  // ─── Deleting teacher link ───
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);

  // -------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------
  const fetchSummaries = useCallback(async () => {
    const { data, error } = await supabase
      .from('summaries')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching summaries:', error);
    } else {
      setSummaries((data as Summary[]) || []);
    }
  }, [profile.id]);

  const fetchQuizzes = useCallback(async () => {
    // Own quizzes
    const { data: ownQuizzes, error: ownError } = await supabase
      .from('quizzes')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });

    if (ownError) {
      console.error('Error fetching own quizzes:', ownError);
    }

    // Teacher-linked quizzes
    const { data: links } = await supabase
      .from('teacher_student_links')
      .select('teacher_id')
      .eq('student_id', profile.id);

    let teacherQuizzes: Quiz[] = [];
    if (links && links.length > 0) {
      const teacherIds = links.map((l) => l.teacher_id);
      const { data: tQuizzes, error: tError } = await supabase
        .from('quizzes')
        .select('*')
        .in('user_id', teacherIds)
        .order('created_at', { ascending: false });

      if (tError) {
        console.error('Error fetching teacher quizzes:', tError);
      } else {
        teacherQuizzes = (tQuizzes as Quiz[]) || [];
      }
    }

    // Merge and deduplicate
    const allQuizzes = [...(ownQuizzes as Quiz[] || []), ...teacherQuizzes];
    const uniqueMap = new Map<string, Quiz>();
    allQuizzes.forEach((q) => uniqueMap.set(q.id, q));
    setQuizzes(Array.from(uniqueMap.values()));
  }, [profile.id]);

  const fetchScores = useCallback(async () => {
    const { data, error } = await supabase
      .from('scores')
      .select('*')
      .eq('student_id', profile.id)
      .order('completed_at', { ascending: false });

    if (error) {
      console.error('Error fetching scores:', error);
    } else {
      setScores((data as Score[]) || []);
    }
  }, [profile.id]);

  const fetchLinkedTeachers = useCallback(async () => {
    const { data: links, error: linksError } = await supabase
      .from('teacher_student_links')
      .select('teacher_id')
      .eq('student_id', profile.id);

    if (linksError) {
      console.error('Error fetching teacher links:', linksError);
      return;
    }

    if (links && links.length > 0) {
      const teacherIds = links.map((l) => l.teacher_id);
      const { data: teachers, error: teachersError } = await supabase
        .from('users')
        .select('*')
        .in('id', teacherIds);

      if (teachersError) {
        console.error('Error fetching teacher profiles:', teachersError);
      } else {
        setLinkedTeachers((teachers as UserProfile[]) || []);
      }
    } else {
      setLinkedTeachers([]);
    }
  }, [profile.id]);

  // Load all data
  const fetchAllData = useCallback(async () => {
    setLoadingData(true);
    await Promise.all([fetchSummaries(), fetchQuizzes(), fetchScores(), fetchLinkedTeachers()]);
    setLoadingData(false);
  }, [fetchSummaries, fetchQuizzes, fetchScores, fetchLinkedTeachers]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // -------------------------------------------------------
  // Realtime subscriptions
  // -------------------------------------------------------
  useEffect(() => {
    const summariesChannel = supabase
      .channel('summaries-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'summaries', filter: `user_id=eq.${profile.id}` },
        () => { fetchSummaries(); }
      )
      .subscribe();

    const quizzesChannel = supabase
      .channel('quizzes-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quizzes' },
        () => { fetchQuizzes(); }
      )
      .subscribe();

    const scoresChannel = supabase
      .channel('scores-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores', filter: `student_id=eq.${profile.id}` },
        () => { fetchScores(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(summariesChannel);
      supabase.removeChannel(quizzesChannel);
      supabase.removeChannel(scoresChannel);
    };
  }, [profile.id, fetchSummaries, fetchQuizzes, fetchScores]);

  // -------------------------------------------------------
  // Section change handler
  // -------------------------------------------------------
  const handleSectionChange = (section: string) => {
    if (section === 'settings') {
      setSettingsOpen(true);
      return;
    }
    setActiveSection(section as StudentSection);
  };

  // -------------------------------------------------------
  // PDF text extraction
  // -------------------------------------------------------
  const extractTextFromPDF = async (file: File): Promise<string> => {
    const lib = await getPdfjsLib();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      pages.push(pageText);
    }

    return pages.join('\n\n');
  };

  // -------------------------------------------------------
  // Create summary handler
  // -------------------------------------------------------
  const handleCreateSummary = async () => {
    const title = summaryTitle.trim();
    if (!title) {
      toast.error('يرجى إدخال عنوان الملخص');
      return;
    }

    let content = '';

    if (summaryInputMode === 'file') {
      if (!summaryFile) {
        toast.error('يرجى اختيار ملف PDF');
        return;
      }
      try {
        setSummaryStep('processing');
        content = await extractTextFromPDF(summaryFile);
        if (!content.trim()) {
          toast.error('لم يتم العثور على نص في الملف');
          setSummaryStep('input');
          return;
        }
      } catch (err) {
        console.error('PDF extraction error:', err);
        toast.error('حدث خطأ أثناء قراءة ملف PDF');
        setSummaryStep('input');
        return;
      }
    } else {
      content = summaryText.trim();
      if (!content) {
        toast.error('يرجى إدخال المحتوى أو لصقه');
        return;
      }
    }

    setCreatingSummary(true);

    try {
      // 1. Generate summary
      const summaryRes = await fetch('/api/gemini/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      const summaryData = await summaryRes.json();
      if (!summaryData.success) {
        throw new Error(summaryData.error || 'فشل في إنشاء الملخص');
      }

      const summaryContent = summaryData.data.summary;

      // 2. Generate quiz
      const quizRes = await fetch('/api/gemini/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      const quizData = await quizRes.json();
      let quizQuestions: unknown[] = [];
      if (quizData.success && quizData.data?.questions) {
        quizQuestions = quizData.data.questions;
      }

      // 3. Save summary to supabase
      const { data: insertedSummary, error: summaryError } = await supabase
        .from('summaries')
        .insert({
          user_id: profile.id,
          title,
          original_content: content,
          summary_content: summaryContent,
        })
        .select()
        .single();

      if (summaryError) {
        throw new Error(summaryError.message);
      }

      // 4. Save quiz to supabase (if generated)
      if (quizQuestions.length > 0 && insertedSummary) {
        await supabase.from('quizzes').insert({
          user_id: profile.id,
          title: `اختبار: ${title}`,
          questions: quizQuestions,
          summary_id: insertedSummary.id,
        });
      }

      toast.success('تم إنشاء الملخص والاختبار بنجاح');

      // Reset form
      setSummaryTitle('');
      setSummaryText('');
      setSummaryFile(null);
      setSummaryInputMode('text');
      setNewSummaryOpen(false);

      // Refresh data
      fetchSummaries();
      fetchQuizzes();
    } catch (err) {
      console.error('Create summary error:', err);
      toast.error(err instanceof Error ? err.message : 'حدث خطأ أثناء إنشاء الملخص');
    } finally {
      setCreatingSummary(false);
      setSummaryStep('input');
    }
  };

  // -------------------------------------------------------
  // Delete summary handler
  // -------------------------------------------------------
  const handleDeleteSummary = async (summaryId: string) => {
    setDeletingSummaryId(summaryId);
    try {
      const { error } = await supabase.from('summaries').delete().eq('id', summaryId);
      if (error) {
        toast.error('حدث خطأ أثناء حذف الملخص');
      } else {
        toast.success('تم حذف الملخص بنجاح');
        fetchSummaries();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setDeletingSummaryId(null);
    }
  };

  // -------------------------------------------------------
  // Link teacher handler
  // -------------------------------------------------------
  const handleLinkTeacher = async () => {
    const code = teacherCode.trim().toUpperCase();
    if (!code) {
      toast.error('يرجى إدخال رمز المعلم');
      return;
    }

    setLinkingTeacher(true);

    try {
      // Find teacher by code
      const { data: teacher, error: teacherError } = await supabase
        .from('users')
        .select('*')
        .eq('teacher_code', code)
        .eq('role', 'teacher')
        .single();

      if (teacherError || !teacher) {
        toast.error('لم يتم العثور على معلم بهذا الرمز');
        return;
      }

      // Check if already linked
      const existing = linkedTeachers.find((t) => t.id === teacher.id);
      if (existing) {
        toast.error('أنت مرتبط بالفعل بهذا المعلم');
        return;
      }

      // Create link
      const { error: linkError } = await supabase.from('teacher_student_links').insert({
        teacher_id: teacher.id,
        student_id: profile.id,
      });

      if (linkError) {
        if (linkError.code === '23505') {
          toast.error('أنت مرتبط بالفعل بهذا المعلم');
        } else {
          toast.error('حدث خطأ أثناء ربط المعلم');
        }
        return;
      }

      toast.success(`تم ربط المعلم ${teacher.name} بنجاح`);
      setTeacherCode('');
      setLinkTeacherOpen(false);
      fetchLinkedTeachers();
      fetchQuizzes();
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setLinkingTeacher(false);
    }
  };

  // -------------------------------------------------------
  // Unlink teacher handler
  // -------------------------------------------------------
  const handleUnlinkTeacher = async (teacherId: string) => {
    setDeletingLinkId(teacherId);
    try {
      const { error } = await supabase
        .from('teacher_student_links')
        .delete()
        .eq('teacher_id', teacherId)
        .eq('student_id', profile.id);

      if (error) {
        toast.error('حدث خطأ أثناء إلغاء الربط');
      } else {
        toast.success('تم إلغاء ربط المعلم بنجاح');
        fetchLinkedTeachers();
        fetchQuizzes();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setDeletingLinkId(null);
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
  // Computed: check which quizzes are completed
  // -------------------------------------------------------
  const completedQuizIds = new Set(scores.map((s) => s.quiz_id));

  // -------------------------------------------------------
  // Render: Dashboard Section
  // -------------------------------------------------------
  const renderDashboard = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-bold text-foreground">لوحة التحكم</h2>
        <p className="text-muted-foreground mt-1">مرحباً بك في منصة إكسامي التعليمية</p>
      </motion.div>

      {/* Stats row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<FileText className="h-6 w-6" />}
          label="ملخصات"
          value={summaries.length}
          color="emerald"
        />
        <StatCard
          icon={<ClipboardList className="h-6 w-6" />}
          label="اختبارات"
          value={quizzes.length}
          color="teal"
        />
        <StatCard
          icon={<Award className="h-6 w-6" />}
          label="اختبارات منجزة"
          value={scores.length}
          color="amber"
        />
      </motion.div>

      {/* Two columns: recent summaries & recent scores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* أحدث الملخصات */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-emerald-600" />
                أحدث الملخصات
              </h3>
              <button
                onClick={() => setActiveSection('summaries')}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
              >
                عرض الكل
                <ChevronLeft className="h-3 w-3" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto custom-scrollbar">
              {summaries.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  لا توجد ملخصات بعد
                </div>
              ) : (
                <div className="divide-y">
                  {summaries.slice(0, 5).map((summary) => (
                    <motion.button
                      key={summary.id}
                      whileHover={{ backgroundColor: 'rgba(0,0,0,0.02)' }}
                      onClick={() => setViewingSummaryId(summary.id)}
                      className="flex w-full items-start gap-3 p-4 text-right transition-colors"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                        <FileText className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{summary.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {summary.summary_content.slice(0, 80)}...
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-1">{formatDate(summary.created_at)}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* آخر النتائج */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-600" />
                آخر النتائج
              </h3>
            </div>
            <div className="max-h-80 overflow-y-auto custom-scrollbar">
              {scores.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  لا توجد نتائج بعد
                </div>
              ) : (
                <div className="divide-y">
                  {scores.slice(0, 5).map((score) => {
                    const pct = scorePercentage(score.score, score.total);
                    const pctColor =
                      pct >= 80
                        ? 'text-emerald-700 bg-emerald-100'
                        : pct >= 60
                          ? 'text-amber-700 bg-amber-100'
                          : 'text-rose-700 bg-rose-100';
                    return (
                      <div key={score.id} className="flex items-center gap-3 p-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                          <Award className="h-4 w-4 text-amber-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{score.quiz_title}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {score.score} / {score.total}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${pctColor}`}>
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
  // Render: Summaries Section
  // -------------------------------------------------------
  const renderSummaries = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">الملخصات</h2>
          <p className="text-muted-foreground mt-1">جميع ملخصاتك الدراسية في مكان واحد</p>
        </div>
        <button
          onClick={() => setNewSummaryOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          ملخص جديد
        </button>
      </motion.div>

      {/* Summaries grid */}
      {summaries.length === 0 ? (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 py-16"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
            <FileText className="h-8 w-8 text-emerald-600" />
          </div>
          <p className="text-lg font-semibold text-foreground mb-1">لا توجد ملخصات</p>
          <p className="text-sm text-muted-foreground mb-4">ابدأ بإنشاء ملخصك الأول من محتوى دراسي</p>
          <button
            onClick={() => setNewSummaryOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            إنشاء ملخص
          </button>
        </motion.div>
      ) : (
        <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summaries.map((summary) => (
            <motion.div key={summary.id} variants={itemVariants} {...cardHover}>
              <div className="group relative rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSummary(summary.id);
                  }}
                  disabled={deletingSummaryId === summary.id}
                  className="absolute top-3 left-3 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-50 hover:text-rose-600"
                >
                  {deletingSummaryId === summary.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>

                <button
                  onClick={() => setViewingSummaryId(summary.id)}
                  className="w-full text-right"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 transition-transform group-hover:scale-110">
                      <FileText className="h-5 w-5 text-emerald-600" />
                    </div>
                    <h3 className="font-semibold text-foreground truncate">{summary.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {summary.summary_content.slice(0, 120)}...
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                    <Calendar className="h-3 w-3" />
                    {formatDate(summary.created_at)}
                  </div>
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* New Summary Modal */}
      <AnimatePresence>
        {newSummaryOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => {
              if (!creatingSummary) setNewSummaryOpen(false);
            }}
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
              {/* Modal header */}
              <div className="flex items-center justify-between border-b p-5">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-600" />
                  ملخص جديد
                </h3>
                <button
                  onClick={() => {
                    if (!creatingSummary) setNewSummaryOpen(false);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal body */}
              <div className="p-5 space-y-4">
                {/* Title */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">عنوان الملخص</label>
                  <input
                    type="text"
                    value={summaryTitle}
                    onChange={(e) => setSummaryTitle(e.target.value)}
                    placeholder="مثال: ملخص الفصل الثالث - الفيزياء"
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                    disabled={creatingSummary}
                    dir="rtl"
                  />
                </div>

                {/* Input mode toggle */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">طريقة الإدخال</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSummaryInputMode('text')}
                      disabled={creatingSummary}
                      className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                        summaryInputMode === 'text'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-border text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      <Type className="h-4 w-4" />
                      لصق نص
                    </button>
                    <button
                      onClick={() => setSummaryInputMode('file')}
                      disabled={creatingSummary}
                      className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                        summaryInputMode === 'file'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-border text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      <Upload className="h-4 w-4" />
                      رفع ملف PDF
                    </button>
                  </div>
                </div>

                {/* Text input */}
                {summaryInputMode === 'text' && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      المحتوى
                    </label>
                    <textarea
                      value={summaryText}
                      onChange={(e) => setSummaryText(e.target.value)}
                      placeholder="الصق المحتوى الدراسي هنا..."
                      rows={6}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors resize-none"
                      disabled={creatingSummary}
                      dir="rtl"
                    />
                  </div>
                )}

                {/* File upload */}
                {summaryInputMode === 'file' && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      ملف PDF
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setSummaryFile(e.target.files?.[0] || null)}
                      className="hidden"
                      disabled={creatingSummary}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={creatingSummary}
                      className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/30 p-6 transition-colors hover:border-emerald-400 hover:bg-emerald-50/50"
                    >
                      {summaryFile ? (
                        <>
                          <FileUp className="h-8 w-8 text-emerald-600" />
                          <span className="text-sm font-medium text-emerald-700">{summaryFile.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {(summaryFile.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 text-emerald-400" />
                          <span className="text-sm text-muted-foreground">اضغط لاختيار ملف PDF</span>
                          <span className="text-xs text-muted-foreground/60">الحد الأقصى 10 MB</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Processing indicator */}
                {summaryStep === 'processing' && creatingSummary && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                      <div>
                        <p className="text-sm font-medium text-emerald-700">جاري استخراج النص من الملف...</p>
                        <p className="text-xs text-emerald-600/70 mt-0.5">يرجى الانتظار</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Modal footer */}
              <div className="flex items-center gap-3 border-t p-5">
                <button
                  onClick={handleCreateSummary}
                  disabled={creatingSummary}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {creatingSummary ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جاري الإنشاء...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      إنشاء الملخص
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    if (!creatingSummary) setNewSummaryOpen(false);
                  }}
                  disabled={creatingSummary}
                  className="rounded-lg border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  إلغاء
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
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-bold text-foreground">الاختبارات</h2>
        <p className="text-muted-foreground mt-1">اختباراتك واختبارات المعلمين</p>
      </motion.div>

      {/* Quizzes grid */}
      {quizzes.length === 0 ? (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-teal-300 bg-teal-50/30 py-16"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 mb-4">
            <ClipboardList className="h-8 w-8 text-teal-600" />
          </div>
          <p className="text-lg font-semibold text-foreground mb-1">لا توجد اختبارات</p>
          <p className="text-sm text-muted-foreground mb-4">
            أنشئ ملخصاً أولاً وسيتم توليد اختبار تلقائياً
          </p>
          <button
            onClick={() => setActiveSection('summaries')}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700"
          >
            <FileText className="h-4 w-4" />
            إنشاء ملخص
          </button>
        </motion.div>
      ) : (
        <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quizzes.map((quiz) => {
            const isCompleted = completedQuizIds.has(quiz.id);
            const score = scores.find((s) => s.quiz_id === quiz.id);
            const pct = score ? scorePercentage(score.score, score.total) : null;

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
                            <Calendar className="h-3 w-3" />
                            {quiz.duration} دقيقة
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    {isCompleted && pct !== null && (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                          pct >= 80
                            ? 'text-emerald-700 bg-emerald-100'
                            : pct >= 60
                              ? 'text-amber-700 bg-amber-100'
                              : 'text-rose-700 bg-rose-100'
                        }`}
                      >
                        {pct}%
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    {isCompleted ? (
                      <button
                        onClick={() => setViewingQuizId(quiz.id)}
                        className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        عرض النتائج
                      </button>
                    ) : (
                      <button
                        onClick={() => setViewingQuizId(quiz.id)}
                        className="flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-teal-700"
                      >
                        <Play className="h-3.5 w-3.5" />
                        ابدأ الاختبار
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );

  // -------------------------------------------------------
  // Render: Teachers Section
  // -------------------------------------------------------
  const renderTeachers = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">المعلمون</h2>
          <p className="text-muted-foreground mt-1">معلموك المسجلون في المنصة</p>
        </div>
        <button
          onClick={() => setLinkTeacherOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <UserPlus className="h-4 w-4" />
          ربط معلم جديد
        </button>
      </motion.div>

      {/* Teachers list */}
      {linkedTeachers.length === 0 ? (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 py-16"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
            <Users className="h-8 w-8 text-emerald-600" />
          </div>
          <p className="text-lg font-semibold text-foreground mb-1">لا يوجد معلمون</p>
          <p className="text-sm text-muted-foreground mb-4">
            اربط حسابك مع معلمك باستخدام الرمز الخاص به
          </p>
          <button
            onClick={() => setLinkTeacherOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <Link2 className="h-4 w-4" />
            ربط معلم
          </button>
        </motion.div>
      ) : (
        <motion.div variants={containerVariants} className="space-y-3">
          {linkedTeachers.map((teacher) => {
            const initials = teacher.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2);
            return (
              <motion.div key={teacher.id} variants={itemVariants}>
                <div className="group flex items-center justify-between rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm">
                      {initials || 'م'}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{teacher.name}</h3>
                      <p className="text-xs text-muted-foreground">{teacher.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnlinkTeacher(teacher.id)}
                    disabled={deletingLinkId === teacher.id}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-medium text-rose-600 opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-100 disabled:opacity-100"
                  >
                    {deletingLinkId === teacher.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <X className="h-3.5 w-3.5" />
                        إلغاء الربط
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Link Teacher Modal */}
      <AnimatePresence>
        {linkTeacherOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => {
              if (!linkingTeacher) setLinkTeacherOpen(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border bg-background shadow-xl"
              dir="rtl"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between border-b p-5">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-emerald-600" />
                  ربط معلم جديد
                </h3>
                <button
                  onClick={() => {
                    if (!linkingTeacher) setLinkTeacherOpen(false);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal body */}
              <div className="p-5 space-y-4">
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                    <Search className="h-7 w-7 text-emerald-600" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    أدخل رمز المعلم الخاص للربط مع حسابك
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">رمز المعلم</label>
                  <input
                    type="text"
                    value={teacherCode}
                    onChange={(e) => setTeacherCode(e.target.value.toUpperCase())}
                    placeholder="مثال: ABC123"
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors text-center tracking-widest font-mono"
                    disabled={linkingTeacher}
                    dir="ltr"
                    maxLength={10}
                  />
                </div>
              </div>

              {/* Modal footer */}
              <div className="flex items-center gap-3 border-t p-5">
                <button
                  onClick={handleLinkTeacher}
                  disabled={linkingTeacher}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {linkingTeacher ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جاري الربط...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4" />
                      ربط
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    if (!linkingTeacher) setLinkTeacherOpen(false);
                  }}
                  disabled={linkingTeacher}
                  className="rounded-lg border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  // -------------------------------------------------------
  // Render: Section content
  // -------------------------------------------------------
  const renderSection = () => {
    if (loadingData) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mb-4" />
          <p className="text-muted-foreground text-sm">جاري تحميل البيانات...</p>
        </div>
      );
    }

    switch (activeSection) {
      case 'dashboard':
        return renderDashboard();
      case 'summaries':
        return renderSummaries();
      case 'quizzes':
        return renderQuizzes();
      case 'teachers':
        return renderTeachers();
      default:
        return null;
    }
  };

  // -------------------------------------------------------
  // Main render
  // -------------------------------------------------------
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppSidebar
        role="student"
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        userName={profile.name}
        onSignOut={onSignOut}
      />

      {/* Main Content - offset for desktop sidebar */}
      <main className="md:mr-72">
        <div className="p-4 sm:p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderSection()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        profile={profile}
        onUpdateProfile={handleUpdateProfile}
        onDeleteAccount={handleDeleteAccount}
      />

      {/* Custom scrollbar styles */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: hsl(var(--muted-foreground) / 0.2);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: hsl(var(--muted-foreground) / 0.35);
        }
        .line-clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
