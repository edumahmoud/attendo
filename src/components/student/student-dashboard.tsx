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
  Video,
  BarChart3,
  Clock,
  FolderOpen,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AppSidebar from '@/components/shared/app-sidebar';
import SubjectsSection from '@/components/shared/subjects-section';
import SubjectDetail from '@/components/shared/subject-detail';
import SettingsPage from '@/components/shared/settings-page';
import ChatPanel from '@/components/shared/chat-panel';
import NotificationBell from '@/components/shared/notification-bell';
import NotificationsPanel from '@/components/shared/notifications-panel';
import PersonalFilesSection from '@/components/shared/personal-files-section';
import StatCard from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/stores/app-store';
import { useAuthStore } from '@/stores/auth-store';
import { useAutoRefresh, useDebouncedCallback, useRealtimeStatus } from '@/hooks/use-auto-refresh';
import { useIsMobile } from '@/hooks/use-mobile';
import RealtimeStatus from '@/components/shared/realtime-status';
import { toast } from 'sonner';
import type { UserProfile, Summary, Quiz, Score, StudentSection, Subject, SubjectFile } from '@/lib/types';

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
  if (!total || total === 0 || !score && score !== 0) return 0;
  const pct = Math.round((score / total) * 100);
  return Number.isNaN(pct) ? 0 : pct;
}

// -------------------------------------------------------
// Main Component
// -------------------------------------------------------
export default function StudentDashboard({ profile, onSignOut }: StudentDashboardProps) {
  // ─── Navigation ───
  const { studentSection, setStudentSection: storeSetStudentSection, setViewingQuizId, setViewingSummaryId, viewingSubjectId, setViewingSubjectId, setCurrentPage, setReviewScoreId } = useAppStore();
  const isMobile = useIsMobile();
  const [activeSection, setActiveSectionLocal] = useState<StudentSection>(studentSection || 'dashboard');

  // Sync with store
  const setActiveSection = useCallback((section: StudentSection) => {
    setActiveSectionLocal(section);
    storeSetStudentSection(section);
  }, [storeSetStudentSection]);

  // Listen for store changes (e.g. from notifications navigation)
  useEffect(() => {
    if (studentSection && studentSection !== activeSection) {
      setActiveSectionLocal(studentSection);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentSection]);

  // ─── Unread notifications count ───
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // ─── Unread messages count ───
  const [unreadMessages, setUnreadMessages] = useState(0);

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

  // ─── Expanded teacher card ───
  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null);

  // ─── Deleting summary state ───
  const [deletingSummaryId, setDeletingSummaryId] = useState<string | null>(null);

  // ─── Deleting teacher link ───
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);

  // ─── Teacher subjects (for teacher cards) ───
  const [teacherSubjects, setTeacherSubjects] = useState<Record<string, Subject[]>>({});

  // ─── Subjects count (for dashboard) ───
  const [subjectsCount, setSubjectsCount] = useState(0);

  // ─── Student files section ───
  const [studentFiles, setStudentFiles] = useState<SubjectFile[]>([]);
  const [myFilesCount, setMyFilesCount] = useState(0);
  const [enrolledSubjects, setEnrolledSubjects] = useState<Subject[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadSubjectId, setUploadSubjectId] = useState<string | null>(null);
  const [uploadVisibility, setUploadVisibility] = useState<'public' | 'private'>('private');
  const [fileDragOver, setFileDragOver] = useState(false);
  const studentFileInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------
  const fetchSummaries = useCallback(async () => {
    try {
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
    } catch {
      // silently ignore - prevents unhandled rejection
    }
  }, [profile.id]);

  const fetchQuizzes = useCallback(async () => {
    try {
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
      const finalQuizzes = Array.from(uniqueMap.values());

      // Enrich with subject names
      const quizzesWithSubjects = finalQuizzes.filter(q => q.subject_id);
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
            finalQuizzes.forEach(q => {
              if (q.subject_id) {
                q.subject_name = subjectMap[q.subject_id] || '';
              }
            });
          }
        }
      }

      setQuizzes(finalQuizzes);
    } catch {
      // silently ignore - prevents unhandled rejection
    }
  }, [profile.id]);

  const fetchScores = useCallback(async () => {
    try {
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
    } catch {
      // silently ignore - prevents unhandled rejection
    }
  }, [profile.id]);

  const fetchLinkedTeachers = useCallback(async () => {
    try {
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
    } catch {
      // silently ignore - prevents unhandled rejection
    }
  }, [profile.id]);

  // ─── Fetch subjects for each linked teacher ───
  const fetchTeacherSubjects = useCallback(async () => {
    if (linkedTeachers.length === 0) {
      setTeacherSubjects({});
      return;
    }

    try {
      // Get all enrolled subjects for this student
      const { data: enrollments } = await supabase
        .from('subject_students')
        .select('subject_id')
        .eq('student_id', profile.id);

      if (!enrollments || enrollments.length === 0) {
        setTeacherSubjects({});
        return;
      }

      const enrolledSubjectIds = enrollments.map((e: { subject_id: string }) => e.subject_id);

      // Fetch subjects details
      const { data: subjectsData } = await supabase
        .from('subjects')
        .select('*')
        .in('id', enrolledSubjectIds);

      if (!subjectsData) {
        setTeacherSubjects({});
        return;
      }

      // Group by teacher_id
      const grouped: Record<string, Subject[]> = {};
      (subjectsData as Subject[]).forEach((s) => {
        if (!grouped[s.teacher_id]) grouped[s.teacher_id] = [];
        grouped[s.teacher_id].push(s);
      });

      setTeacherSubjects(grouped);
    } catch {
      // silently ignore
    }
  }, [profile.id, linkedTeachers.length]);

  // ─── Fetch subjects count for dashboard ───
  const fetchSubjectsCount = useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from('subject_students')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', profile.id);

      if (!error && count !== null) {
        setSubjectsCount(count);
      }
    } catch {
      // silently ignore
    }
  }, [profile.id]);

  // ─── Fetch student files across all enrolled subjects ───
  const fetchStudentFiles = useCallback(async () => {
    try {
      // Get enrolled subjects
      const { data: enrollments } = await supabase
        .from('subject_students')
        .select('subject_id')
        .eq('student_id', profile.id);

      if (!enrollments || enrollments.length === 0) {
        setStudentFiles([]);
        setEnrolledSubjects([]);
        return;
      }

      const enrolledSubjectIds = enrollments.map((e: { subject_id: string }) => e.subject_id);

      // Fetch subject details
      const { data: subjectsData } = await supabase
        .from('subjects')
        .select('*')
        .in('id', enrolledSubjectIds);

      if (subjectsData) {
        setEnrolledSubjects(subjectsData as Subject[]);
      }

      // Fetch all files for these subjects that the student can see
      const { data: filesData, error } = await supabase
        .from('subject_files')
        .select('*')
        .in('subject_id', enrolledSubjectIds)
        .or(`visibility.eq.public,visibility.is.null,uploaded_by.eq.${profile.id}`)
        .order('created_at', { ascending: false });

      if (!error && filesData) {
        setStudentFiles(filesData as SubjectFile[]);
      }
    } catch {
      // silently ignore
    }
  }, [profile.id]);

  // ─── Fetch student's own files count (user_files) ───
  const fetchMyFilesCount = useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from('user_files')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id);
      if (!error && count !== null) {
        setMyFilesCount(count);
      }
    } catch {
      // silently ignore
    }
  }, [profile.id]);

  // ─── Handle file upload ───
  const handleFileUpload = async (file: File) => {
    if (!uploadSubjectId) {
      toast.error('يرجى اختيار المقرر أولاً');
      return;
    }

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name);
      formData.append('visibility', uploadVisibility);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/subjects/${uploadSubjectId}/files/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();
      if (result.success) {
        toast.success('تم رفع الملف بنجاح');
        fetchStudentFiles();
      } else {
        toast.error(result.error || 'فشل في رفع الملف');
      }
    } catch {
      toast.error('حدث خطأ أثناء رفع الملف');
    } finally {
      setUploadingFile(false);
    }
  };

  // ─── Handle file drop ───
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setFileDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // ─── Handle delete student file ───
  const handleDeleteFile = async (file: SubjectFile) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/subjects/${file.subject_id}/files?fileId=${file.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        toast.success('تم حذف الملف بنجاح');
        fetchStudentFiles();
      } else {
        toast.error(result.error || 'فشل في حذف الملف');
      }
    } catch {
      toast.error('حدث خطأ أثناء حذف الملف');
    }
  };

  // Load all data
  const initialLoadDone = useRef(false);
  const fetchAllData = useCallback(async (showLoading = false) => {
    if (showLoading || !initialLoadDone.current) setLoadingData(true);
    await Promise.allSettled([fetchSummaries(), fetchQuizzes(), fetchScores(), fetchLinkedTeachers(), fetchSubjectsCount(), fetchStudentFiles(), fetchMyFilesCount()]);
    setLoadingData(false);
    initialLoadDone.current = true;
  }, [fetchSummaries, fetchQuizzes, fetchScores, fetchLinkedTeachers, fetchSubjectsCount, fetchStudentFiles, fetchMyFilesCount]);

  useEffect(() => {
    fetchAllData(true);
  }, [fetchAllData]);

  // Fetch teacher subjects when linked teachers change
  useEffect(() => {
    fetchTeacherSubjects();
  }, [fetchTeacherSubjects]);

  // -------------------------------------------------------
  // Realtime status & auto-refresh
  // -------------------------------------------------------
  const { status: rtStatusValue, lastUpdated: rtLastUpdated, markConnected, markDisconnected, markConnecting, markUpdated } = useRealtimeStatus();

  // Debounced versions of fetch functions to prevent rapid re-fetches
  const debouncedFetchSummaries = useDebouncedCallback(() => fetchSummaries(), 500);
  const debouncedFetchQuizzes = useDebouncedCallback(() => fetchQuizzes(), 500);
  const debouncedFetchScores = useDebouncedCallback(() => fetchScores(), 500);
  const debouncedFetchLinkedTeachers = useDebouncedCallback(() => fetchLinkedTeachers(), 500);
  const debouncedFetchSubjectsCount = useDebouncedCallback(() => fetchSubjectsCount(), 500);

  // Full data refresh for polling fallback
  const refreshAllData = useCallback(async () => {
    await Promise.allSettled([fetchSummaries(), fetchQuizzes(), fetchScores(), fetchLinkedTeachers(), fetchSubjectsCount(), fetchStudentFiles(), fetchMyFilesCount()]);
    markUpdated();
  }, [fetchSummaries, fetchQuizzes, fetchScores, fetchLinkedTeachers, fetchSubjectsCount, fetchStudentFiles, fetchMyFilesCount, markUpdated]);

  // Auto-refresh every 60 seconds as fallback
  useAutoRefresh(refreshAllData, 60000);

  // -------------------------------------------------------
  // Realtime subscriptions (with debounce + missing subscriptions)
  // -------------------------------------------------------
  useEffect(() => {
    markConnecting();

    const summariesChannel = supabase
      .channel('summaries-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'summaries', filter: `user_id=eq.${profile.id}` },
        () => { debouncedFetchSummaries(); markConnected(); markUpdated(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') markConnected();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') markDisconnected();
      });

    const quizzesChannel = supabase
      .channel('quizzes-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quizzes' },
        () => { debouncedFetchQuizzes(); markUpdated(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') markConnected();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') markDisconnected();
      });

    const scoresChannel = supabase
      .channel('scores-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores', filter: `student_id=eq.${profile.id}` },
        () => { debouncedFetchScores(); markUpdated(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') markConnected();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') markDisconnected();
      });

    // Missing: teacher_student_links changes
    const linksChannel = supabase
      .channel('student-links-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teacher_student_links', filter: `student_id=eq.${profile.id}` },
        () => { debouncedFetchLinkedTeachers(); debouncedFetchQuizzes(); markUpdated(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') markConnected();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') markDisconnected();
      });

    // Missing: subject_students changes (for subjects count)
    const subjectStudentsChannel = supabase
      .channel('student-subject-students-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subject_students', filter: `student_id=eq.${profile.id}` },
        () => { debouncedFetchSubjectsCount(); markUpdated(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') markConnected();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') markDisconnected();
      });

    return () => {
      supabase.removeChannel(summariesChannel);
      supabase.removeChannel(quizzesChannel);
      supabase.removeChannel(scoresChannel);
      supabase.removeChannel(linksChannel);
      supabase.removeChannel(subjectStudentsChannel);
    };
  }, [profile.id, debouncedFetchSummaries, debouncedFetchQuizzes, debouncedFetchScores, debouncedFetchLinkedTeachers, debouncedFetchSubjectsCount, markConnecting, markUpdated, markConnected, markDisconnected]);

  // -------------------------------------------------------
  // Section change handler
  // -------------------------------------------------------
  const handleSectionChange = (section: string) => {
    setActiveSection(section as StudentSection);
    // Reset subject detail when navigating away
    if (section !== 'subjects') {
      setViewingSubjectId(null);
    }
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

    // Subscribe to notification changes to update badge
    const channel = supabase
      .channel('notifications-count')
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
      // Count messages sent to this user (private) that they haven't read
      // + Count messages in their enrolled subjects that are not from them
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

      // 2. Subject messages from enrolled subjects (not sent by me)
      const { data: enrollments } = await supabase
        .from('subject_students')
        .select('subject_id')
        .eq('student_id', profile.id);

      if (enrollments && enrollments.length > 0) {
        const subjectIds = enrollments.map(e => e.subject_id);
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

    // Poll every 15 seconds as a fallback + subscribe to realtime changes
    const interval = setInterval(fetchUnreadMessages, 15000);

    const channel = supabase
      .channel('student-unread-messages')
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

  // -------------------------------------------------------
  // Computed: check which quizzes are completed
  // -------------------------------------------------------
  const completedQuizIds = new Set(scores.map((s) => s.quiz_id));

  // -------------------------------------------------------
  // Render: Dashboard Section
  // -------------------------------------------------------
  const renderDashboard = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4 sm:space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-start justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">لوحة التحكم</h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">مرحباً بك في منصة إكسامي التعليمية</p>
        </div>
        <RealtimeStatus
          status={rtStatusValue}
          lastUpdated={rtLastUpdated}
          onRefresh={refreshAllData}
        />
      </motion.div>

      {/* Stats row */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <StatCard
          icon={<BookOpen className="h-6 w-6" />}
          label="المقررات"
          value={subjectsCount}
          color="emerald"
        />
        <StatCard
          icon={<FileText className="h-6 w-6" />}
          label="ملخصات"
          value={summaries.length}
          color="teal"
        />
        <StatCard
          icon={<ClipboardList className="h-6 w-6" />}
          label="اختبارات"
          value={quizzes.length}
          color="amber"
        />
        <StatCard
          icon={<FolderOpen className="h-6 w-6" />}
          label="عدد الملفات"
          value={myFilesCount}
          color="rose"
        />
      </motion.div>

      {/* Two columns: recent summaries & recent scores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* أحدث الملخصات */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b p-3 sm:p-4">
              <h3 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
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
                      className="flex w-full items-start gap-2 sm:gap-3 p-3 sm:p-4 text-right transition-colors"
                    >
                      <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                        <FileText className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-foreground line-clamp-2">{summary.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {summary.summary_content?.slice(0, 80) || ''}...
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
            <div className="flex items-center justify-between border-b p-3 sm:p-4">
              <h3 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
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
                      <div key={score.id} className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
                        <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                          <Award className="h-4 w-4 text-amber-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-medium text-foreground line-clamp-2">{score.quiz_title}</p>
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
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4 sm:space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">الملخصات</h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">جميع ملخصاتك الدراسية في مكان واحد</p>
        </div>
        <button
          onClick={() => setNewSummaryOpen(true)}
          className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-emerald-600 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
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
              <div className="group relative rounded-xl border bg-card p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow">
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
                    <h3 className="text-sm sm:text-base font-semibold text-foreground line-clamp-2">{summary.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {summary.summary_content?.slice(0, 120) || ''}...
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
  const [studentQuizTab, setStudentQuizTab] = useState<'open' | 'completed'>('open');

  const renderQuizzes = () => {
    // Only show quizzes that belong to subjects the student is enrolled in
    const enrolledSubjectIds = new Set(enrolledSubjects.map(s => s.id));
    const enrolledQuizzes = quizzes.filter(q => !q.subject_id || enrolledSubjectIds.has(q.subject_id));

    // Separate into open and completed
    const openStudentQuizzes = enrolledQuizzes.filter(q => !completedQuizIds.has(q.id));
    const completedStudentQuizzes = enrolledQuizzes.filter(q => completedQuizIds.has(q.id));

    const displayedQuizzes = studentQuizTab === 'open' ? openStudentQuizzes : completedStudentQuizzes;

    // Group by subject
    const quizzesBySubject = new Map<string, Quiz[]>();
    const noSubjectQuizzes: Quiz[] = [];

    displayedQuizzes.forEach(q => {
      if (q.subject_id && q.subject_name) {
        const existing = quizzesBySubject.get(q.subject_id) || [];
        existing.push(q);
        quizzesBySubject.set(q.subject_id, existing);
      } else if (q.subject_id) {
        const subj = enrolledSubjects.find(s => s.id === q.subject_id);
        if (subj) {
          const existing = quizzesBySubject.get(q.subject_id) || [];
          existing.push(q);
          quizzesBySubject.set(q.subject_id, existing);
        } else {
          noSubjectQuizzes.push(q);
        }
      } else {
        noSubjectQuizzes.push(q);
      }
    });

    const renderQuizCard = (quiz: Quiz) => {
      const isCompleted = completedQuizIds.has(quiz.id);
      const score = scores.find((s) => s.quiz_id === quiz.id);
      const pct = score ? scorePercentage(score.score, score.total) : null;

      const isScheduledFuture = (() => {
        if (!quiz.scheduled_date) return false;
        try {
          const scheduledDateTime = quiz.scheduled_time
            ? new Date(`${quiz.scheduled_date}T${quiz.scheduled_time}`)
            : new Date(quiz.scheduled_date);
          return scheduledDateTime.getTime() > Date.now();
        } catch { return false; }
      })();

      const formattedSchedule = (() => {
        if (!quiz.scheduled_date) return null;
        try {
          const scheduledDateTime = quiz.scheduled_time
            ? new Date(`${quiz.scheduled_date}T${quiz.scheduled_time}`)
            : new Date(quiz.scheduled_date);
          return scheduledDateTime.toLocaleDateString('ar-SA', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
            ...(quiz.scheduled_time ? { hour: '2-digit', minute: '2-digit' } : {}),
          });
        } catch { return `${quiz.scheduled_date}${quiz.scheduled_time ? ` ${quiz.scheduled_time}` : ''}`; }
      })();

      return (
        <motion.div key={quiz.id} variants={itemVariants} {...cardHover}>
          <div className="group rounded-xl border bg-card p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 transition-transform group-hover:scale-110">
                <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5 text-teal-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-semibold text-foreground line-clamp-2">{quiz.title}</h3>
                <div className="flex items-center gap-2 sm:gap-3 mt-1.5 sm:mt-2 text-xs text-muted-foreground flex-wrap">
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
                    <span className={`flex items-center gap-1 ${isScheduledFuture ? 'text-amber-600' : ''}`}>
                      <Calendar className="h-3 w-3" />
                      {formattedSchedule}
                    </span>
                  )}
                </div>
              </div>

              {/* Status badge */}
              {isCompleted && pct !== null && (
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                  pct >= 80 ? 'text-emerald-700 bg-emerald-100'
                    : pct >= 60 ? 'text-amber-700 bg-amber-100'
                    : 'text-rose-700 bg-rose-100'
                }`}>
                  {pct}%
                </span>
              )}
              {isScheduledFuture && !isCompleted && (
                <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-amber-700 bg-amber-100">
                  لم يبدأ بعد
                </span>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              {isCompleted ? (
                <button
                  onClick={() => { setViewingQuizId(quiz.id); setReviewScoreId(score?.id || null); setCurrentPage('quiz'); }}
                  className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <Eye className="h-3.5 w-3.5" />
                  عرض النتائج
                </button>
              ) : isScheduledFuture ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                  <Calendar className="h-3.5 w-3.5" />
                  سيبدأ في الموعد المحدد
                </div>
              ) : (
                <button
                  onClick={() => { setViewingQuizId(quiz.id); setReviewScoreId(null); setCurrentPage('quiz'); }}
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
    };

    return (
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4 sm:space-y-6">
        {/* Header */}
        <motion.div variants={itemVariants}>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">الاختبارات</h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">اختبارات المقررات المسجل بها</p>
        </motion.div>

        {/* Tabs */}
        <motion.div variants={itemVariants}>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setStudentQuizTab('open')}
              className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-all ${
                studentQuizTab === 'open'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <Play className="h-4 w-4" />
              اختبارات مفتوحة
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                studentQuizTab === 'open' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {openStudentQuizzes.length}
              </span>
            </button>
            <button
              onClick={() => setStudentQuizTab('completed')}
              className={`flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-all ${
                studentQuizTab === 'completed'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'border text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              اختبارات مكتملة
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                studentQuizTab === 'completed' ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-700'
              }`}>
                {completedStudentQuizzes.length}
              </span>
            </button>
          </div>
        </motion.div>

        {/* Content */}
        {enrolledQuizzes.length === 0 ? (
          <motion.div
            variants={itemVariants}
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-teal-300 bg-teal-50/30 py-16"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 mb-4">
              <ClipboardList className="h-8 w-8 text-teal-600" />
            </div>
            <p className="text-lg font-semibold text-foreground mb-1">لا توجد اختبارات</p>
            <p className="text-sm text-muted-foreground mb-4">
              ستجد اختباراتك هنا عند تسجيلك في مقررات دراسية
            </p>
          </motion.div>
        ) : displayedQuizzes.length === 0 ? (
          <motion.div
            variants={itemVariants}
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-teal-300 bg-teal-50/30 py-12"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 mb-3">
              {studentQuizTab === 'open' ? <Play className="h-6 w-6 text-teal-600" /> : <CheckCircle2 className="h-6 w-6 text-teal-600" />}
            </div>
            <p className="text-sm font-medium text-foreground">
              {studentQuizTab === 'open' ? 'لا توجد اختبارات مفتوحة' : 'لا توجد اختبارات مكتملة'}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-4 sm:space-y-8">
            {/* Quizzes grouped by subject */}
            {Array.from(quizzesBySubject.entries()).map(([subjectId, subjectQuizList]) => {
              const subj = enrolledSubjects.find(s => s.id === subjectId);
              if (!subj) return null;
              const subjectName = subj.name;
              const subjectColor = subj.color || '#10b981';

              return (
                <motion.div key={subjectId} variants={itemVariants}>
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white text-sm font-bold"
                      style={{ backgroundColor: subjectColor }}
                    >
                      {subjectName.charAt(0)}
                    </div>
                    <h3 className="text-lg font-bold text-foreground">{subjectName}</h3>
                    <Badge variant="outline" className="text-xs" style={{ color: subjectColor, borderColor: subjectColor + '40' }}>
                      {subjectQuizList.length} اختبار
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {subjectQuizList.map(renderQuizCard)}
                  </div>
                </motion.div>
              );
            })}

            {/* Quizzes without subject */}
            {noSubjectQuizzes.length > 0 && (
              <motion.div variants={itemVariants}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 text-slate-600 text-sm font-bold">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">اختبارات عامة</h3>
                  <Badge variant="outline" className="text-xs">{noSubjectQuizzes.length} اختبار</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {noSubjectQuizzes.map(renderQuizCard)}
                </div>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>
    );
  };

  // -------------------------------------------------------
  // Render: Teachers Section
  // -------------------------------------------------------
  const renderTeachers = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4 sm:space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">المعلمون</h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">معلموك المسجلون في المنصة</p>
        </div>
        <button
          onClick={() => setLinkTeacherOpen(true)}
          className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-emerald-600 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <UserPlus className="h-4 w-4" />
          <span className="hidden sm:inline">ربط معلم جديد</span><span className="sm:hidden">ربط معلم</span>
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
        <motion.div variants={containerVariants} className="space-y-4">
          {linkedTeachers.map((teacher) => {
            const initials = teacher.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2);
            const subjects = teacherSubjects[teacher.id] || [];
            const isExpanded = expandedTeacherId === teacher.id;
            return (
              <motion.div key={teacher.id} variants={itemVariants}>
                <div className="group rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  {/* Teacher header - clickable to expand */}
                  <div
                    className="flex items-center justify-between p-3 sm:p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedTeacherId(isExpanded ? null : teacher.id)}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs sm:text-sm">
                        {initials || 'م'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm sm:text-base font-semibold text-foreground line-clamp-2">{teacher.name}</h3>
                        <p className="text-xs text-muted-foreground break-all">{teacher.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {subjects.length > 0 && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                          {subjects.length} مقرر
                        </Badge>
                      )}
                      <ChevronLeft className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? '-rotate-90' : ''}`} />
                    </div>
                  </div>

                  {/* Expanded: Teacher's subjects + unlink */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t bg-muted/10 px-4 py-3 space-y-3">
                          {/* Subjects list */}
                          {subjects.length > 0 ? (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                                <BookOpen className="h-3.5 w-3.5" />
                                المقررات المسجلة
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {subjects.map((subject) => {
                                  const color = subject.color || '#10B981';
                                  return (
                                    <button
                                      key={subject.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveSection('subjects');
                                        setViewingSubjectId(subject.id);
                                      }}
                                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:shadow-sm"
                                      style={{
                                        backgroundColor: color + '15',
                                        color: color,
                                        border: `1px solid ${color}30`,
                                      }}
                                    >
                                      <BookOpen className="h-3 w-3" />
                                      <span className="line-clamp-2">{subject.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground text-center py-2">لا توجد مقررات مسجلة مع هذا المعلم</p>
                          )}

                          {/* Unlink button */}
                          <div className="pt-2 border-t">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnlinkTeacher(teacher.id);
                              }}
                              disabled={deletingLinkId === teacher.id}
                              className="flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 transition-all hover:bg-rose-100 disabled:opacity-60"
                            >
                              {deletingLinkId === teacher.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <X className="h-3.5 w-3.5" />
                                  إلغاء الربط مع المعلم
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
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
  // Render: Lectures Section (placeholder)
  // -------------------------------------------------------
  const renderLectures = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4 sm:space-y-6">
      <motion.div variants={itemVariants}>
        <h2 className="text-2xl font-bold text-foreground">المحاضرات</h2>
        <p className="text-muted-foreground mt-1">محاضراتك المسجلة والبث المباشر</p>
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 py-20"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mb-5">
          <Video className="h-10 w-10 text-emerald-600" />
        </div>
        <p className="text-xl font-semibold text-foreground mb-2">سيتم إضافة المحاضرات قريباً</p>
        <p className="text-sm text-muted-foreground max-w-sm text-center">
          نعمل على إضافة ميزة المحاضرات المسجلة والبث المباشر. ترقب التحديثات القادمة!
        </p>
      </motion.div>
    </motion.div>
  );

  // -------------------------------------------------------
  // Render: Files Section
  // -------------------------------------------------------
  const renderFiles = () => {
    // Group files by type
    const documents = studentFiles.filter((f) => ['pdf', 'document', 'spreadsheet', 'presentation'].includes(f.file_type || ''));
    const images = studentFiles.filter((f) => f.file_type === 'image');
    const videos = studentFiles.filter((f) => f.file_type === 'video');
    const other = studentFiles.filter((f) => !['pdf', 'document', 'spreadsheet', 'presentation', 'image', 'video'].includes(f.file_type || ''));

    // Get subject name for a file
    const getSubjectName = (subjectId: string) => {
      return enrolledSubjects.find((s) => s.id === subjectId)?.name || '';
    };

    // File icon based on type
    const getFileIcon = (fileType?: string) => {
      switch (fileType) {
        case 'pdf':
        case 'document':
          return <FileText className="h-5 w-5 text-rose-500" />;
        case 'image':
          return <FileUp className="h-5 w-5 text-emerald-500" />;
        case 'video':
          return <Video className="h-5 w-5 text-teal-500" />;
        case 'spreadsheet':
          return <BarChart3 className="h-5 w-5 text-amber-500" />;
        default:
          return <FileText className="h-5 w-5 text-muted-foreground" />;
      }
    };

    // File size formatter
    const formatFileSize = (bytes?: number) => {
      if (!bytes) return '';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Render a file group section
    const renderFileGroup = (title: string, files: SubjectFile[], icon: React.ReactNode) => {
      if (files.length === 0) return null;
      return (
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b p-4">
              {icon}
              <h3 className="font-semibold text-foreground">{title}</h3>
              <Badge className="bg-muted text-muted-foreground text-[10px]">{files.length}</Badge>
            </div>
            <div className="max-h-96 overflow-y-auto custom-scrollbar divide-y">
              {files.map((file) => (
                <div key={file.id} className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                    {getFileIcon(file.file_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground line-clamp-2">{file.file_name}</p>
                      {file.visibility === 'private' && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[9px]">خاص</Badge>
                      )}
                      {file.visibility === 'public' && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px]">عام</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {getSubjectName(file.subject_id)}
                      </span>
                      {file.file_size && <span>{formatFileSize(file.file_size)}</span>}
                      <span>{formatDate(file.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={file.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
                      title="تحميل"
                    >
                      <Eye className="h-4 w-4" />
                    </a>
                    {file.uploaded_by === profile.id && (
                      <button
                        onClick={() => handleDeleteFile(file)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50 transition-colors"
                        title="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      );
    };

    return (
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4 sm:space-y-6">
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">الملفات</h2>
            <p className="text-muted-foreground mt-1">ملفاتك والمفات المشتركة في مقرراتك</p>
          </div>
        </motion.div>

        {/* Upload section */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="border-b p-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Upload className="h-4 w-4 text-emerald-600" />
                رفع ملف جديد
              </h3>
            </div>
            <div className="p-4 space-y-4">
              {/* Subject selector */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">المقرر <span className="text-rose-500">*</span></label>
                <select
                  value={uploadSubjectId || ''}
                  onChange={(e) => setUploadSubjectId(e.target.value || null)}
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors"
                  dir="rtl"
                  disabled={uploadingFile}
                >
                  <option value="">اختر المقرر</option>
                  {enrolledSubjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Visibility toggle */}
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">ظهور الملف</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {uploadVisibility === 'private' ? 'فقط أنت يمكن رؤية هذا الملف' : 'المعلم والطلاب يمكنهم رؤية هذا الملف'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setUploadVisibility('private')}
                    disabled={uploadingFile}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      uploadVisibility === 'private'
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-border text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    خاص
                  </button>
                  <button
                    onClick={() => setUploadVisibility('public')}
                    disabled={uploadingFile}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      uploadVisibility === 'public'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-border text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    عام
                  </button>
                </div>
              </div>

              {/* Drop zone */}
              <input
                ref={studentFileInputRef}
                type="file"
                accept=".pdf,image/*,video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                  e.target.value = '';
                }}
                className="hidden"
                disabled={uploadingFile || !uploadSubjectId}
              />
              <div
                onDragOver={(e) => { e.preventDefault(); setFileDragOver(true); }}
                onDragLeave={() => setFileDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => uploadSubjectId && studentFileInputRef.current?.click()}
                className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all cursor-pointer ${
                  fileDragOver
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : uploadingFile
                      ? 'border-muted-foreground/30 bg-muted/20 cursor-wait'
                      : !uploadSubjectId
                        ? 'border-muted-foreground/20 bg-muted/10 cursor-not-allowed opacity-60'
                        : 'border-emerald-300 bg-emerald-50/30 hover:border-emerald-400 hover:bg-emerald-50/50'
                }`}
              >
                {uploadingFile ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-700">جاري رفع الملف...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-emerald-400" />
                    <span className="text-sm text-muted-foreground">
                      {uploadSubjectId ? 'اسحب الملف هنا أو اضغط للاختيار' : 'اختر المقرر أولاً لرفع ملف'}
                    </span>
                    <span className="text-xs text-muted-foreground/60">PDF، صور، فيديو — الحد الأقصى 10 ميجابايت</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* File groups */}
        {studentFiles.length === 0 ? (
          <motion.div
            variants={itemVariants}
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 py-16"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
              <FileText className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="text-lg font-semibold text-foreground mb-1">لا توجد ملفات</p>
            <p className="text-sm text-muted-foreground">ارفع ملفاً جديداً أو انتظر حتى يشارك المعلم ملفات</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {renderFileGroup('المستندات', documents, <FileText className="h-4 w-4 text-rose-500" />)}
            {renderFileGroup('الصور', images, <FileUp className="h-4 w-4 text-emerald-500" />)}
            {renderFileGroup('الفيديوهات', videos, <Video className="h-4 w-4 text-teal-500" />)}
            {other.length > 0 && renderFileGroup('أخرى', other, <FileText className="h-4 w-4 text-muted-foreground" />)}
          </div>
        )}
      </motion.div>
    );
  };

  // -------------------------------------------------------
  // Render: Analytics Section
  // -------------------------------------------------------
  const renderAnalytics = () => {
    // Calculate average score
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + scorePercentage(s.score, s.total), 0) / scores.length)
      : null;

    // Group scores by category (using quiz_title prefix before colon as category)
    const categoryMap: Record<string, { total: number; count: number }> = {};
    scores.forEach((s) => {
      const category = s.quiz_title?.split(':')[0]?.trim() || 'أخرى';
      if (!categoryMap[category]) {
        categoryMap[category] = { total: 0, count: 0 };
      }
      categoryMap[category].total += scorePercentage(s.score, s.total);
      categoryMap[category].count += 1;
    });

    const categories = Object.entries(categoryMap).map(([name, data]) => ({
      name,
      avg: Math.round(data.total / data.count),
      count: data.count,
    }));

    return (
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4 sm:space-y-6">
        {/* Header */}
        <motion.div variants={itemVariants}>
          <h2 className="text-2xl font-bold text-foreground">تحليل الأداء</h2>
          <p className="text-muted-foreground mt-1">رؤى مفصلة حول أدائك الدراسي</p>
        </motion.div>

        {scores.length === 0 ? (
          <motion.div
            variants={itemVariants}
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 py-20"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mb-5">
              <BarChart3 className="h-10 w-10 text-emerald-600" />
            </div>
            <p className="text-xl font-semibold text-foreground mb-2">تحليل نقاط الضعف والقوة سيظهر هنا بعد إكمال اختبارات كافية</p>
            <p className="text-sm text-muted-foreground max-w-sm text-center">
              أكمل الاختبارات لتحصل على تحليل مفصل لأدائك الدراسي
            </p>
          </motion.div>
        ) : (
          <>
            {/* Overview cards */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                    <BarChart3 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">متوسط النتائج</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{avgScore}%</p>
              </div>
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100">
                    <ClipboardList className="h-5 w-5 text-teal-600" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">اختبارات منجزة</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{scores.length}</p>
              </div>
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                    <Award className="h-5 w-5 text-amber-600" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">أعلى نتيجة</span>
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {scores.length > 0 ? Math.max(...scores.map((s) => scorePercentage(s.score, s.total))) : 0}%
                </p>
              </div>
            </motion.div>

            {/* Category breakdown */}
            {categories.length > 0 && (
              <motion.div variants={itemVariants}>
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <div className="border-b p-4">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-emerald-600" />
                      تحليل حسب المقرر
                    </h3>
                  </div>
                  <div className="p-4 space-y-3">
                    {categories.map((cat) => (
                      <div key={cat.name} className="flex items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-foreground line-clamp-2">{cat.name}</span>
                            <span className="text-xs text-muted-foreground">{cat.count} اختبار</span>
                          </div>
                          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                cat.avg >= 80
                                  ? 'bg-emerald-500'
                                  : cat.avg >= 60
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                              }`}
                              style={{ width: `${cat.avg}%` }}
                            />
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                            cat.avg >= 80
                              ? 'text-emerald-700 bg-emerald-100'
                              : cat.avg >= 60
                                ? 'text-amber-700 bg-amber-100'
                                : 'text-rose-700 bg-rose-100'
                          }`}
                        >
                          {cat.avg}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    );
  };

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
      case 'subjects':
        if (viewingSubjectId) {
          return <SubjectDetail subjectId={viewingSubjectId} profile={profile} onBack={() => setViewingSubjectId(null)} />;
        }
        return <SubjectsSection profile={profile} role="student" />;
      case 'chat':
        return (
          <div className="h-[calc(100vh-8rem)] sm:h-[calc(100vh-7rem)] overflow-hidden rounded-xl border bg-card shadow-sm">
            <ChatPanel profile={profile} />
          </div>
        );
      case 'lectures':
        return renderLectures();
      case 'personal-files':
        return <PersonalFilesSection profile={profile} />;
      case 'notifications':
        return <NotificationsPanel profile={profile} onBack={() => setActiveSection('dashboard')} />;
      case 'analytics':
        return renderAnalytics();
      case 'settings':
        return <SettingsPage profile={profile} onBack={() => setActiveSection('dashboard')} />;
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

      {/* Main Content - offset for desktop sidebar */}
      <main className="md:mr-72">
        {/* Desktop: sticky top bar with notification bell */}
        {!isMobile && (
          <div className="sticky top-0 z-20 flex items-center justify-end gap-3 border-b bg-background/95 backdrop-blur-sm px-6 py-2">
            <NotificationBell
              profile={profile}
              onOpenPanel={() => setActiveSection('notifications')}
            />
          </div>
        )}
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
