'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Users,
  FileText,
  StickyNote,
  ClipboardList,
  Video,
  MessageCircle,
  GraduationCap,
  Plus,
  Upload,
  Download,
  Trash2,
  Eye,
  Send,
  QrCode,
  ScanLine,
  Maximize2,
  Play,
  Square,
  Clock,
  Calendar,
  Hash,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  Search,
  BookOpen,
  FolderOpen,
  File,
  ImageIcon,
  FileSpreadsheet,
  FilePlus,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  UserCheck,
  MapPin,
  Volume2,
  Copy,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/lib/supabase';
import StatCard from '@/components/shared/stat-card';
import QrScanner from '@/components/shared/qr-scanner';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import type {
  UserProfile,
  Subject,
  SubjectStudent,
  SubjectFile,
  SubjectNote,
  Lecture,
  LectureAttendance,
  LectureNote,
  Quiz,
  Score,
  Message,
  SubjectSection,
} from '@/lib/types';
import { useAppStore } from '@/stores/app-store';

// =====================================================
// Props
// =====================================================
interface SubjectDetailProps {
  subjectId: string;
  profile: UserProfile;
  onBack: () => void;
}

// =====================================================
// Animation variants
// =====================================================
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

const cardHover = {
  whileHover: { scale: 1.01, y: -2 },
  whileTap: { scale: 0.98 },
  transition: { type: 'spring', stiffness: 400, damping: 25 },
};

// =====================================================
// Helpers
// =====================================================
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

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type?: string | null): React.ReactNode {
  if (!type) return <File className="h-5 w-5 text-muted-foreground" />;
  const t = type.toLowerCase();
  if (t.includes('pdf')) return <FileText className="h-5 w-5 text-rose-500" />;
  if (t.includes('image') || t.includes('png') || t.includes('jpg')) return <ImageIcon className="h-5 w-5 text-purple-500" />;
  if (t.includes('sheet') || t.includes('excel') || t.includes('csv')) return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
  if (t.includes('word') || t.includes('doc')) return <FilePlus className="h-5 w-5 text-blue-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
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

// =====================================================
// Tab config
// =====================================================
interface TabConfig {
  id: SubjectSection;
  label: string;
  icon: React.ReactNode;
}

const teacherTabs: TabConfig[] = [
  { id: 'overview', label: 'نظرة عامة', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'files', label: 'الملفات', icon: <FolderOpen className="h-4 w-4" /> },
  { id: 'notes', label: 'الملاحظات', icon: <StickyNote className="h-4 w-4" /> },
  { id: 'quizzes', label: 'الاختبارات', icon: <ClipboardList className="h-4 w-4" /> },
  { id: 'lectures', label: 'المحاضرات', icon: <Video className="h-4 w-4" /> },
  { id: 'chat', label: 'المحادثة', icon: <MessageCircle className="h-4 w-4" /> },
  { id: 'students', label: 'الطلاب', icon: <Users className="h-4 w-4" /> },
];

const studentTabs: TabConfig[] = [
  { id: 'overview', label: 'نظرة عامة', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'files', label: 'الملفات', icon: <FolderOpen className="h-4 w-4" /> },
  { id: 'notes', label: 'الملاحظات', icon: <StickyNote className="h-4 w-4" /> },
  { id: 'quizzes', label: 'الاختبارات', icon: <ClipboardList className="h-4 w-4" /> },
  { id: 'lectures', label: 'المحاضرات', icon: <Video className="h-4 w-4" /> },
  { id: 'chat', label: 'المحادثة', icon: <MessageCircle className="h-4 w-4" /> },
];

// =====================================================
// Main Component
// =====================================================
export default function SubjectDetail({ subjectId, profile, onBack }: SubjectDetailProps) {
  const isTeacher = profile.role === 'teacher';
  const tabs = isTeacher ? teacherTabs : studentTabs;

  // ─── Read subjectSection from store (for notification navigation) ───
  const { subjectSection, setSubjectSection, setViewingQuizId, setCurrentPage, setReviewScoreId } = useAppStore();

  // ─── Active tab ───
  const [activeTab, setActiveTab] = useState<SubjectSection>('overview');

  // Sync with store: when subjectSection changes (e.g. from notification click), update activeTab
  useEffect(() => {
    if (subjectSection && subjectSection !== 'overview') {
      setActiveTab(subjectSection);
      // Reset after applying so it doesn't keep overriding
      setSubjectSection('overview');
    }
  }, [subjectSection, setSubjectSection]);

  // ─── Data state ───
  const [subject, setSubject] = useState<Subject | null>(null);
  const [students, setStudents] = useState<SubjectStudent[]>([]);
  const [files, setFiles] = useState<SubjectFile[]>([]);
  const [notes, setNotes] = useState<SubjectNote[]>([]);
  const [noteViews, setNoteViews] = useState<Record<string, number>>({});
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [lectureAttendance, setLectureAttendance] = useState<Record<string, LectureAttendance[]>>({});
  const [myAttendanceIds, setMyAttendanceIds] = useState<Set<string>>(new Set()); // lecture IDs where student attended
  const [messages, setMessages] = useState<Message[]>([]);
  const [teacherProfile, setTeacherProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // ─── UI state ───
  const [uploadingFile, setUploadingFile] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [createNoteOpen, setCreateNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [creatingNote, setCreatingNote] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [createLectureOpen, setCreateLectureOpen] = useState(false);
  const [lectureTitle, setLectureTitle] = useState('');
  const [lectureDesc, setLectureDesc] = useState('');
  const [creatingLecture, setCreatingLecture] = useState(false);
  const [togglingLectureId, setTogglingLectureId] = useState<string | null>(null);
  const [attendanceLectureId, setAttendanceLectureId] = useState<string | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrLecture, setQrLecture] = useState<Lecture | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLecture, setScannerLecture] = useState<Lecture | null>(null);
  const [submittingAttendance, setSubmittingAttendance] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [removingStudentId, setRemovingStudentId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [lectureDetailOpen, setLectureDetailOpen] = useState(false);
  const [lectureDetailData, setLectureDetailData] = useState<Lecture | null>(null);
  const [lectureNotes, setLectureNotes] = useState<Record<string, LectureNote[]>>({});
  const [lectureNote, setLectureNote] = useState('');
  const [savingLectureNote, setSavingLectureNote] = useState(false);
  const [lectureDetailSearch, setLectureDetailSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // =====================================================
  // Data fetching
  // =====================================================
  const fetchSubject = useCallback(async () => {
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('id', subjectId)
      .single();

    if (error) {
      console.error('Error fetching subject:', error);
      toast.error('حدث خطأ أثناء تحميل بيانات المادة');
    } else {
      setSubject(data as Subject);
    }
  }, [subjectId]);

  const fetchTeacherProfile = useCallback(async (teacherId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', teacherId)
      .single();

    if (!error && data) {
      setTeacherProfile(data as UserProfile);
    }
  }, []);

  const fetchStudents = useCallback(async () => {
    const { data, error } = await supabase
      .from('subject_students')
      .select('id, subject_id, student_id, enrolled_at')
      .eq('subject_id', subjectId);

    if (error) {
      console.error('Error fetching students:', error);
      return;
    }

    if (data && data.length > 0) {
      const studentIds = data.map((s: { student_id: string }) => s.student_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', studentIds);

      if (profilesError) {
        console.error('Error fetching student profiles:', profilesError);
      } else {
        const enriched = data.map((s: { id: string; subject_id: string; student_id: string; enrolled_at: string }) => {
          const p = (profiles as { id: string; name: string; email: string }[])?.find((pr) => pr.id === s.student_id);
          return {
            ...s,
            student_name: p?.name || 'طالب',
            student_email: p?.email || '',
          } as SubjectStudent;
        });
        setStudents(enriched);
      }
    } else {
      setStudents([]);
    }
  }, [subjectId]);

  const fetchFiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('subject_files')
      .select('*')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching files:', error);
    } else {
      setFiles((data as SubjectFile[]) || []);
    }
  }, [subjectId]);

  const fetchNotes = useCallback(async () => {
    const { data, error } = await supabase
      .from('subject_notes')
      .select('*')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notes:', error);
    } else {
      setNotes((data as SubjectNote[]) || []);
    }
  }, [subjectId]);

  const fetchNoteViews = useCallback(async (noteIds?: string[]) => {
    const ids = noteIds || notes.map((n) => n.id);
    if (ids.length === 0) {
      setNoteViews({});
      return;
    }

    // Fetch view counts for each note
    const viewCountMap: Record<string, number> = {};
    const { data: viewsData } = await supabase
      .from('note_views')
      .select('note_id')
      .in('note_id', ids);

    if (viewsData) {
      (viewsData as { note_id: string }[]).forEach((v) => {
        viewCountMap[v.note_id] = (viewCountMap[v.note_id] || 0) + 1;
      });
    }
    setNoteViews(viewCountMap);
  }, [subjectId]);

  const fetchQuizzes = useCallback(async () => {
    const teacherId = subject?.teacher_id;
    if (!teacherId) return;

    const { data, error } = await supabase
      .from('quizzes')
      .select('*')
      .eq('user_id', teacherId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching quizzes:', error);
    } else {
      setQuizzes((data as Quiz[]) || []);
    }
  }, [subject?.teacher_id]);

  const fetchScores = useCallback(async () => {
    if (isTeacher) {
      const { data, error } = await supabase
        .from('scores')
        .select('*')
        .eq('teacher_id', profile.id)
        .order('completed_at', { ascending: false });

      if (!error) {
        setScores((data as Score[]) || []);
      }
    } else {
      const { data, error } = await supabase
        .from('scores')
        .select('*')
        .eq('student_id', profile.id)
        .order('completed_at', { ascending: false });

      if (!error) {
        setScores((data as Score[]) || []);
      }
    }
  }, [subjectId, profile.id, isTeacher]);

  const fetchLectures = useCallback(async () => {
    const { data, error } = await supabase
      .from('lectures')
      .select('*')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching lectures:', error);
    } else {
      setLectures((data as Lecture[]) || []);
    }
  }, [subjectId]);

  const fetchLectureAttendance = useCallback(async (lectureId: string) => {
    const { data, error } = await supabase
      .from('lecture_attendance')
      .select('id, lecture_id, student_id, student_latitude, student_longitude, distance_meters, is_within_range, attended_at')
      .eq('lecture_id', lectureId);

    if (error) {
      console.error('Error fetching attendance:', error);
      return;
    }

    if (data && data.length > 0) {
      const studentIds = data.map((a: { student_id: string }) => a.student_id);
      const { data: profiles } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', studentIds);

      const enriched = data.map((a: { id: string; lecture_id: string; student_id: string; student_latitude?: number; student_longitude?: number; distance_meters?: number; is_within_range?: boolean; attended_at: string }) => {
        const p = (profiles as { id: string; name: string; email: string }[])?.find((pr) => pr.id === a.student_id);
        return {
          ...a,
          student_name: p?.name || 'طالب',
          student_email: p?.email || '',
        } as LectureAttendance;
      });

      setLectureAttendance((prev) => ({ ...prev, [lectureId]: enriched }));
    } else {
      setLectureAttendance((prev) => ({ ...prev, [lectureId]: [] }));
    }
  }, []);

  const fetchLectureNotes = useCallback(async (lectureId: string) => {
    const { data, error } = await supabase
      .from('lecture_notes')
      .select('*')
      .eq('lecture_id', lectureId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching lecture notes:', error);
    } else {
      setLectureNotes((prev) => ({ ...prev, [lectureId]: (data as LectureNote[]) || [] }));
    }
  }, []);

  // Fetch student's own attendance records for all lectures in this subject
  const fetchMyAttendance = useCallback(async () => {
    if (isTeacher) return; // Only for students
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/attendance?student_id=' + profile.id, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();

      if (result.success && result.data) {
        const attendedLectureIds = new Set(
          (result.data as { lecture_id: string }[]).map((a) => a.lecture_id)
        );
        setMyAttendanceIds(attendedLectureIds);
      }
    } catch (err) {
      console.error('Error fetching my attendance:', err);
    }
  }, [isTeacher, profile.id]);

  // Fetch attendance counts for all lectures (for both teacher and student views)
  const fetchAttendanceCounts = useCallback(async (lectureIds?: string[]) => {
    try {
      // Use provided IDs or get current lecture IDs from state
      const ids = lectureIds || lectures.map((l) => l.id);
      if (ids.length === 0) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lecture_ids: ids }),
      });
      const result = await response.json();

      if (result.success && result.data) {
        const countMap = result.data as Record<string, number>;
        setLectures((prev) =>
          prev.map((l) => ({
            ...l,
            attendance_count: countMap[l.id] || 0,
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching attendance counts:', err);
    }
  }, [lectures]);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
    } else {
      const enriched = (data as Message[]) || [];
      // Fetch sender names if needed
      if (enriched.length > 0) {
        const senderIds = [...new Set(enriched.map((m) => m.sender_id))];
        const { data: profiles } = await supabase
          .from('users')
          .select('id, name, email')
          .in('id', senderIds);

        const profileMap = new Map(
          (profiles as { id: string; name: string; email: string }[])?.map((p) => [p.id, p]) || []
        );

        const final = enriched.map((m) => ({
          ...m,
          sender_name: profileMap.get(m.sender_id)?.name || 'مستخدم',
          sender_email: profileMap.get(m.sender_id)?.email || '',
        }));

        setMessages(final);
      } else {
        setMessages([]);
      }
    }
  }, [subjectId]);

  // ─── Load all data ───
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    await fetchSubject();
    setLoading(false);
  }, [fetchSubject]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // After subject loads, fetch related data
  useEffect(() => {
    if (subject) {
      fetchTeacherProfile(subject.teacher_id);
      Promise.all([
        fetchStudents(),
        fetchFiles(),
        fetchNotes(),
        fetchQuizzes(),
        fetchScores(),
        fetchLectures(),
        fetchMessages(),
        fetchMyAttendance(),
      ]);
    }
  }, [subject, fetchStudents, fetchFiles, fetchNotes, fetchQuizzes, fetchScores, fetchLectures, fetchMessages, fetchTeacherProfile, fetchMyAttendance]);

  // After lectures load, fetch attendance counts
  useEffect(() => {
    if (lectures.length > 0) {
      const ids = lectures.map((l) => l.id);
      fetchAttendanceCounts(ids);
    }
  }, [lectures.length, fetchAttendanceCounts]);

  // Fetch note views after notes load
  useEffect(() => {
    if (notes.length > 0) {
      const noteIds = notes.map((n) => n.id);
      fetchNoteViews(noteIds);
    }
  }, [notes, fetchNoteViews]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // =====================================================
  // Realtime subscriptions
  // =====================================================
  useEffect(() => {
    const filesChannel = supabase
      .channel(`subject-files-${subjectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subject_files', filter: `subject_id=eq.${subjectId}` },
        () => fetchFiles()
      )
      .subscribe();

    const notesChannel = supabase
      .channel(`subject-notes-${subjectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subject_notes', filter: `subject_id=eq.${subjectId}` },
        () => fetchNotes()
      )
      .subscribe();

    const studentsChannel = supabase
      .channel(`subject-students-${subjectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subject_students', filter: `subject_id=eq.${subjectId}` },
        () => fetchStudents()
      )
      .subscribe();

    const lecturesChannel = supabase
      .channel(`subject-lectures-${subjectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lectures', filter: `subject_id=eq.${subjectId}` },
        () => fetchLectures()
      )
      .subscribe();

    const messagesChannel = supabase
      .channel(`subject-messages-${subjectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `subject_id=eq.${subjectId}` },
        () => fetchMessages()
      )
      .subscribe();

    const quizzesChannel = supabase
      .channel(`subject-quizzes-${subjectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quizzes', filter: `subject_id=eq.${subjectId}` },
        () => fetchQuizzes()
      )
      .subscribe();

    const scoresChannel = supabase
      .channel(`subject-scores-${subjectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores' },
        () => fetchScores()
      )
      .subscribe();

    const attendanceChannel = supabase
      .channel(`subject-attendance-${subjectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lecture_attendance' },
        () => {
          fetchLectures();
          fetchAttendanceCounts();
          if (!isTeacher) {
            fetchMyAttendance();
          }
          // Refresh specific lecture attendance if viewing
          if (attendanceLectureId) {
            fetchLectureAttendance(attendanceLectureId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(filesChannel);
      supabase.removeChannel(notesChannel);
      supabase.removeChannel(studentsChannel);
      supabase.removeChannel(lecturesChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(quizzesChannel);
      supabase.removeChannel(scoresChannel);
      supabase.removeChannel(attendanceChannel);
    };
  }, [subjectId, fetchFiles, fetchNotes, fetchStudents, fetchLectures, fetchMessages, fetchQuizzes, fetchScores, fetchAttendanceCounts, fetchMyAttendance, isTeacher, attendanceLectureId, fetchLectureAttendance]);

  // =====================================================
  // Handlers
  // =====================================================

  // ─── File upload ───
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('حجم الملف يتجاوز 10 ميجابايت');
      return;
    }

    setUploadingFile(true);
    try {
      // Get the current session token for API authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      // Use the API route for file upload (server-side with service key)
      // This avoids client-side storage RLS issues
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/subjects/${subjectId}/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('[FILE UPLOAD] Error:', response.status, result);
        toast.error(result.error || `حدث خطأ أثناء رفع الملف (${response.status})`);
        return;
      }

      toast.success('تم رفع الملف بنجاح');
      fetchFiles();
    } catch {
      toast.error('حدث خطأ غير متوقع أثناء رفع الملف');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ─── File download ───
  const handleFileDownload = (file: SubjectFile) => {
    window.open(file.file_url, '_blank');
  };

  // ─── File delete ───
  const handleFileDelete = async (fileId: string) => {
    setDeletingFileId(fileId);
    try {
      // Get the current session token for API authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      const response = await fetch(`/api/subjects/${subjectId}/files?fileId=${fileId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        toast.error(result.error || 'حدث خطأ أثناء حذف الملف');
      } else {
        toast.success('تم حذف الملف بنجاح');
        fetchFiles();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setDeletingFileId(null);
    }
  };

  // ─── Create note ───
  const handleCreateNote = async () => {
    if (!noteTitle.trim()) {
      toast.error('يرجى إدخال عنوان الملاحظة');
      return;
    }
    if (!noteContent.trim()) {
      toast.error('يرجى إدخال محتوى الملاحظة');
      return;
    }

    setCreatingNote(true);
    try {
      const { error } = await supabase.from('subject_notes').insert({
        subject_id: subjectId,
        teacher_id: profile.id,
        title: noteTitle.trim(),
        content: noteContent.trim(),
      });

      if (error) {
        toast.error('حدث خطأ أثناء إنشاء الملاحظة');
      } else {
        toast.success('تم إنشاء الملاحظة بنجاح');
        setNoteTitle('');
        setNoteContent('');
        setCreateNoteOpen(false);
        fetchNotes();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setCreatingNote(false);
    }
  };

  // ─── Delete note ───
  const handleDeleteNote = async (noteId: string) => {
    setDeletingNoteId(noteId);
    try {
      const { error } = await supabase.from('subject_notes').delete().eq('id', noteId);
      if (error) {
        toast.error('حدث خطأ أثناء حذف الملاحظة');
      } else {
        toast.success('تم حذف الملاحظة بنجاح');
        fetchNotes();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setDeletingNoteId(null);
    }
  };

  // ─── View note (track) ───
  const handleViewNote = async (noteId: string) => {
    if (expandedNoteId === noteId) {
      setExpandedNoteId(null);
      return;
    }
    setExpandedNoteId(noteId);

    // Track view for students
    if (!isTeacher) {
      try {
        await supabase.from('note_views').insert({
          note_id: noteId,
          user_id: profile.id,
        });
        fetchNoteViews();
      } catch {
        // Silently fail for view tracking
      }
    }
  };

  // ─── Create lecture ───
  const handleCreateLecture = async () => {
    if (!lectureTitle.trim()) {
      toast.error('يرجى إدخال عنوان المحاضرة');
      return;
    }

    setCreatingLecture(true);
    try {
      const { error } = await supabase.from('lectures').insert({
        subject_id: subjectId,
        teacher_id: profile.id,
        title: lectureTitle.trim(),
        description: lectureDesc.trim() || null,
        is_active: false,
        max_distance_meters: 100,
      });

      if (error) {
        toast.error('حدث خطأ أثناء إنشاء المحاضرة');
      } else {
        toast.success('تم إنشاء المحاضرة بنجاح');
        setLectureTitle('');
        setLectureDesc('');
        setCreateLectureOpen(false);
        fetchLectures();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setCreatingLecture(false);
    }
  };

  // ─── Toggle lecture ───
  const handleToggleLecture = async (lecture: Lecture) => {
    setTogglingLectureId(lecture.id);
    try {
      if (lecture.is_active) {
        // Stop lecture
        const { error } = await supabase
          .from('lectures')
          .update({ is_active: false, ended_at: new Date().toISOString() })
          .eq('id', lecture.id);
        if (error) {
          toast.error('حدث خطأ أثناء إيقاف المحاضرة');
          return;
        }
        toast.success('تم إيقاف المحاضرة');
      } else {
        // Check if another lecture is already active in this subject
        const activeInSubject = lectures.find((l) => l.is_active && l.id !== lecture.id);
        if (activeInSubject) {
          toast.error(`لا يمكن بدء أكثر من محاضرة في نفس الوقت. المحاضرة "${activeInSubject.title}" جارية حالياً`);
          return;
        }

        // Start lecture - generate QR code
        const qrData = JSON.stringify({ lectureId: lecture.id, subjectId, teacherId: profile.id, timestamp: Date.now() });
        const { error } = await supabase
          .from('lectures')
          .update({
            is_active: true,
            started_at: new Date().toISOString(),
            ended_at: null,
            qr_code: qrData,
          })
          .eq('id', lecture.id);
        if (error) {
          toast.error('حدث خطأ أثناء بدء المحاضرة');
          return;
        }
        toast.success('تم بدء المحاضرة');
      }
      await fetchLectures();
      await fetchAttendanceCounts();
      if (!isTeacher) {
        await fetchMyAttendance();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setTogglingLectureId(null);
    }
  };

  // ─── Handle QR scan result (student attendance) ───
  const handleQrScanResult = async (scannedData: string) => {
    if (!scannerLecture) return;

    setSubmittingAttendance(true);
    try {
      // Parse the QR data
      let parsed: { lectureId?: string; subjectId?: string; teacherId?: string; timestamp?: number };
      try {
        parsed = JSON.parse(scannedData);
      } catch {
        toast.error('رمز QR غير صالح');
        return;
      }

      // Verify the scanned lecture matches the current lecture
      if (parsed.lectureId !== scannerLecture.id) {
        toast.error('رمز QR لا يخص هذه المحاضرة');
        return;
      }

      // Verify the lecture is still active
      const { data: currentLecture } = await supabase
        .from('lectures')
        .select('is_active')
        .eq('id', scannerLecture.id)
        .single();

      if (!currentLecture?.is_active) {
        toast.error('المحاضرة لم تعد نشطة');
        return;
      }

      // Try to get geolocation (optional, best-effort)
      let latitude: number | null = null;
      let longitude: number | null = null;
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
            enableHighAccuracy: false,
          });
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      } catch {
        // Geolocation not available or denied - continue without it
      }

      // Record attendance
      const { error } = await supabase.from('lecture_attendance').insert({
        lecture_id: scannerLecture.id,
        student_id: profile.id,
        student_latitude: latitude,
        student_longitude: longitude,
        distance_meters: null,
        is_within_range: true, // QR scan is considered valid
      });

      if (error) {
        if (error.code === '23505') {
          toast.error('تم تسجيل حضورك بالفعل في هذه المحاضرة');
          // Still update local state to show the indicator
          setMyAttendanceIds((prev) => new Set(prev).add(scannerLecture.id));
        } else {
          toast.error('حدث خطأ أثناء تسجيل الحضور');
          console.error('Attendance error:', error);
        }
      } else {
        toast.success('تم تسجيل الحضور بنجاح! ✅');
        // Update local state immediately
        setMyAttendanceIds((prev) => new Set(prev).add(scannerLecture.id));
        // Refresh attendance count and lectures
        fetchAttendanceCounts();
        fetchLectures();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع أثناء تسجيل الحضور');
    } finally {
      setSubmittingAttendance(false);
    }
  };

  // ─── Send message ───
  const handleSendMessage = async () => {
    const content = chatInput.trim();
    if (!content) return;

    setSendingMessage(true);
    try {
      const { error } = await supabase.from('messages').insert({
        subject_id: subjectId,
        sender_id: profile.id,
        content,
        message_type: 'text',
      });

      if (error) {
        toast.error('حدث خطأ أثناء إرسال الرسالة');
      } else {
        setChatInput('');
        fetchMessages();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setSendingMessage(false);
    }
  };

  // ─── Remove student ───
  const handleRemoveStudent = async (studentId: string) => {
    setRemovingStudentId(studentId);
    try {
      const { error } = await supabase
        .from('subject_students')
        .delete()
        .eq('subject_id', subjectId)
        .eq('student_id', studentId);

      if (error) {
        toast.error('حدث خطأ أثناء إزالة الطالب');
      } else {
        toast.success('تم إزالة الطالب بنجاح');
        fetchStudents();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setRemovingStudentId(null);
    }
  };

  // ─── Save lecture note ───
  const handleSaveLectureNote = async () => {
    if (!lectureDetailData) return;
    setSavingLectureNote(true);
    try {
      const { error } = await supabase
        .from('lectures')
        .update({ description: lectureNote.trim() || null })
        .eq('id', lectureDetailData.id);
      if (error) {
        toast.error('حدث خطأ أثناء حفظ الملاحظة');
      } else {
        toast.success('تم حفظ الملاحظة بنجاح');
        fetchLectures();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setSavingLectureNote(false);
    }
  };

  // ─── Export attendance Excel ───
  const handleExportAttendanceExcel = () => {
    if (!lectureDetailData || !subject) return;

    const attendance = lectureAttendance[lectureDetailData.id] || [];

    // Build rows for all enrolled students
    const rows = students.map((student, index) => {
      const att = attendance.find(a => a.student_id === student.student_id);
      return {
        'الرقم': index + 1,
        'اسم الطالب': student.student_name || 'طالب',
        'البريد الإلكتروني': student.student_email || '',
        'حالة الحضور': att ? 'حاضر' : 'غائب',
        'وقت التسجيل': att ? formatTime(att.attended_at) : '—',
        'التاريخ': att ? formatDate(att.attended_at) : '—',
        'ضمن النطاق': att?.is_within_range ? 'نعم' : att ? 'لا' : '—',
        'المسافة (م)': att?.distance_meters ? Math.round(att.distance_meters) : '—',
      };
    });

    // Import xlsx and create workbook
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);

    // Set column widths
    ws['!cols'] = [
      { wch: 6 },   // الرقم
      { wch: 25 },  // اسم الطالب
      { wch: 30 },  // البريد الإلكتروني
      { wch: 12 },  // حالة الحضور
      { wch: 12 },  // وقت التسجيل
      { wch: 14 },  // التاريخ
      { wch: 12 },  // ضمن النطاق
      { wch: 12 },  // المسافة
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الحضور');

    const fileName = `حضور_${lectureDetailData.title}_${subject.name}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success('تم تحميل ملف الإكسيل بنجاح');
  };

  // ─── Open lecture detail ───
  const openLectureDetail = (lecture: Lecture) => {
    setLectureDetailData(lecture);
    setLectureNote(lecture.description || '');
    setLectureDetailSearch('');
    setLectureDetailOpen(true);
    fetchLectureAttendance(lecture.id);
  };

  // =====================================================
  // Computed
  // =====================================================
  const filteredStudents = students.filter(
    (s) =>
      (s.student_name || '').toLowerCase().includes(studentSearch.toLowerCase()) ||
      (s.student_email || '').toLowerCase().includes(studentSearch.toLowerCase())
  );

  const completedQuizIds = new Set(scores.map((s) => s.quiz_id));

  // =====================================================
  // Render: Loading
  // =====================================================
  const renderLoading = () => (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );

  // =====================================================
  // Render: Empty state
  // =====================================================
  const renderEmpty = (icon: React.ReactNode, title: string, subtitle: string, action?: React.ReactNode) => (
    <motion.div
      variants={itemVariants}
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 py-16"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
        {icon}
      </div>
      <p className="text-lg font-semibold text-foreground mb-1">{title}</p>
      <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>
      {action}
    </motion.div>
  );

  // =====================================================
  // Render: Overview Tab
  // =====================================================
  const renderOverview = () => {
    if (!subject) return null;

    return (
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        {/* Subject Header */}
        <motion.div variants={itemVariants}>
          <Card className="overflow-hidden border-0 shadow-lg">
            <div
              className="relative h-32 sm:h-40"
              style={{
                background: `linear-gradient(135deg, ${subject.color || '#10b981'}, ${subject.color ? subject.color + '99' : '#05966999'})`,
              }}
            >
              <div className="absolute inset-0 bg-black/10" />
              <div className="absolute bottom-4 right-6 left-6 flex items-end gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm shadow-lg">
                  <BookOpen className="h-7 w-7 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl font-bold text-white truncate">{subject.name}</h2>
                  {subject.description && (
                    <p className="text-white/80 text-sm mt-1 line-clamp-1">{subject.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isTeacher && subject.subject_code && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(subject.subject_code || '');
                        toast.success('تم نسخ رمز المقرر');
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-black/30 text-white/90 backdrop-blur-sm px-3 py-1.5 text-xs font-mono tracking-wider hover:bg-black/50 transition-colors"
                      title="انقر للنسخ"
                    >
                      <Hash className="h-3.5 w-3.5" />
                      {subject.subject_code}
                      <Copy className="h-3 w-3 opacity-60" />
                    </button>
                  )}
                  <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
                    {subject.is_active ? 'نشطة' : 'غير نشطة'}
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Stats */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            icon={<Users className="h-6 w-6" />}
            label="الطلاب"
            value={students.length}
            color="emerald"
          />
          <StatCard
            icon={<FolderOpen className="h-6 w-6" />}
            label="الملفات"
            value={files.length}
            color="teal"
          />
          <StatCard
            icon={<StickyNote className="h-6 w-6" />}
            label="الملاحظات"
            value={notes.length}
            color="amber"
          />
          <StatCard
            icon={<ClipboardList className="h-6 w-6" />}
            label="الاختبارات"
            value={quizzes.length}
            color="rose"
          />
        </motion.div>

        {/* Quick actions - Teacher only */}
        {isTeacher && (
          <motion.div variants={itemVariants}>
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-teal-600" />
                  إجراءات سريعة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Button
                    variant="outline"
                    className="h-auto py-3 flex flex-col gap-1.5 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                    onClick={() => setActiveTab('files')}
                  >
                    <Upload className="h-4 w-4" />
                    <span className="text-xs">رفع ملف</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto py-3 flex flex-col gap-1.5 border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                    onClick={() => setCreateNoteOpen(true)}
                  >
                    <StickyNote className="h-4 w-4" />
                    <span className="text-xs">ملاحظة جديدة</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto py-3 flex flex-col gap-1.5 border-amber-200 hover:bg-amber-50 hover:text-amber-700"
                    onClick={() => setActiveTab('quizzes')}
                  >
                    <ClipboardList className="h-4 w-4" />
                    <span className="text-xs">اختبار جديد</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto py-3 flex flex-col gap-1.5 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => setCreateLectureOpen(true)}
                  >
                    <Video className="h-4 w-4" />
                    <span className="text-xs">محاضرة جديدة</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Recent activity summary */}
        <motion.div variants={itemVariants}>
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                آخر النشاطات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {files.slice(0, 2).map((f) => (
                  <div key={f.id} className="flex items-center gap-3 text-sm">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                      {getFileIcon(f.file_type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate">تم رفع: {f.file_name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(f.created_at)}</p>
                    </div>
                  </div>
                ))}
                {notes.slice(0, 2).map((n) => (
                  <div key={n.id} className="flex items-center gap-3 text-sm">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                      <StickyNote className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate">ملاحظة: {n.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(n.created_at)}</p>
                    </div>
                  </div>
                ))}
                {files.length === 0 && notes.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">لا توجد نشاطات بعد</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    );
  };

  // =====================================================
  // Render: Files Tab
  // =====================================================
  const renderFiles = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-foreground">ملفات المادة</h3>
          <p className="text-muted-foreground text-sm mt-1">جميع الملفات المرفوعة لهذه المادة</p>
        </div>
        {isTeacher && (
          <div>
            <input
              ref={(el) => { (fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el; }}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploadingFile}
            />
            <Button
              onClick={() => (fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current?.click()}
              disabled={uploadingFile}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              {uploadingFile ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploadingFile ? 'جاري الرفع...' : 'رفع ملف'}
            </Button>
          </div>
        )}
      </motion.div>

      {/* Files grid */}
      {files.length === 0 ? (
        renderEmpty(
          <FolderOpen className="h-8 w-8 text-emerald-600" />,
          'لا توجد ملفات',
          'لم يتم رفع أي ملفات بعد'
        )
      ) : (
        <motion.div variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map((file) => (
            <motion.div key={file.id} variants={itemVariants} {...cardHover}>
              <Card className="group shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-200 transition-transform group-hover:scale-110">
                      {getFileIcon(file.file_type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground text-sm truncate" title={file.file_name}>
                        {file.file_name}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {file.file_type?.split('/').pop() || 'ملف'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatFileSize(file.file_size)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">{formatDate(file.created_at)}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 text-xs h-8"
                      onClick={() => handleFileDownload(file)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      تحميل
                    </Button>
                    {isTeacher && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs h-8 mr-auto"
                        onClick={() => handleFileDelete(file.id)}
                        disabled={deletingFileId === file.id}
                      >
                        {deletingFileId === file.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        حذف
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );

  // =====================================================
  // Render: Notes Tab
  // =====================================================
  const renderNotes = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-foreground">ملاحظات المادة</h3>
          <p className="text-muted-foreground text-sm mt-1">ملاحظات وتنبيهات من المعلم</p>
        </div>
        {isTeacher && (
          <Button
            onClick={() => setCreateNoteOpen(true)}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            ملاحظة جديدة
          </Button>
        )}
      </motion.div>

      {/* Notes list */}
      {notes.length === 0 ? (
        renderEmpty(
          <StickyNote className="h-8 w-8 text-amber-600" />,
          'لا توجد ملاحظات',
          'لم يتم إضافة أي ملاحظات بعد'
        )
      ) : (
        <motion.div variants={containerVariants} className="space-y-4">
          {notes.map((note) => {
            const isExpanded = expandedNoteId === note.id;
            const views = noteViews[note.id] || 0;

            return (
              <motion.div key={note.id} variants={itemVariants}>
                <Card className="shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  <CardContent className="p-0">
                    {/* Note header - clickable */}
                    <button
                      onClick={() => handleViewNote(note.id)}
                      className="w-full text-right p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                        <StickyNote className="h-5 w-5 text-amber-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-foreground truncate">{note.title}</h4>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </div>
                        {!isExpanded && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {note.content}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(note.created_at)}
                          </span>
                          {isTeacher && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              شاهد هذا {views} طالب{views !== 1 ? '' : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Delete button for teachers */}
                      {isTeacher && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8 text-muted-foreground hover:text-rose-600 hover:bg-rose-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNote(note.id);
                          }}
                          disabled={deletingNoteId === note.id}
                        >
                          {deletingNoteId === note.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </button>

                    {/* Expanded content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 border-t pt-3">
                            <div className="prose prose-sm max-w-none text-foreground/90 whitespace-pre-wrap leading-relaxed">
                              {note.content}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Create note dialog */}
      <Dialog open={createNoteOpen} onOpenChange={setCreateNoteOpen}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-5 w-5 text-emerald-600" />
              ملاحظة جديدة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">العنوان</label>
              <Input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="عنوان الملاحظة..."
                disabled={creatingNote}
                dir="rtl"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">المحتوى</label>
              <Textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="اكتب ملاحظتك هنا..."
                rows={6}
                disabled={creatingNote}
                dir="rtl"
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCreateNoteOpen(false)}
              disabled={creatingNote}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleCreateNote}
              disabled={creatingNote}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              {creatingNote ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {creatingNote ? 'جاري الإنشاء...' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );

  // =====================================================
  // Render: Quizzes Tab
  // =====================================================
  const renderQuizzes = () => {
    // Filter quizzes that belong to this subject's teacher
    const subjectQuizzes = quizzes;

    return (
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-foreground">اختبارات المادة</h3>
            <p className="text-muted-foreground text-sm mt-1">جميع الاختبارات المتاحة لهذه المادة</p>
          </div>
        </motion.div>

        {/* Quizzes grid */}
        {subjectQuizzes.length === 0 ? (
          renderEmpty(
            <ClipboardList className="h-8 w-8 text-teal-600" />,
            'لا توجد اختبارات',
            'لم يتم إنشاء أي اختبارات بعد'
          )
        ) : (
          <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {subjectQuizzes.map((quiz) => {
              const isCompleted = completedQuizIds.has(quiz.id);
              const score = scores.find((s) => s.quiz_id === quiz.id);
              const pct = score ? scorePercentage(score.score, score.total) : null;
              
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
              
              // Check if quiz is scheduled for the future
              const isScheduledFuture = (() => {
                if (!quiz.scheduled_date) return false;
                try {
                  const scheduledDateTime = quiz.scheduled_time
                    ? new Date(`${quiz.scheduled_date}T${quiz.scheduled_time}`)
                    : new Date(quiz.scheduled_date);
                  return scheduledDateTime.getTime() > Date.now();
                } catch {
                  return false;
                }
              })();

              return (
                <motion.div key={quiz.id} variants={itemVariants} {...cardHover}>
                  <Card className="shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 transition-transform group-hover:scale-110">
                          <ClipboardList className="h-5 w-5 text-teal-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-foreground truncate">{quiz.title}</h4>
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
                              <span className={`flex items-center gap-1 ${isScheduledFuture ? 'text-amber-600' : ''}`}>
                                <Calendar className="h-3 w-3" />
                                {formattedSchedule}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status */}
                        {isCompleted && pct !== null && (
                          <Badge className={`shrink-0 ${pctColorClass(pct)}`}>
                            {pct}%
                          </Badge>
                        )}
                        {isScheduledFuture && !isCompleted && !isTeacher && (
                          <Badge className="shrink-0 text-amber-700 bg-amber-100">
                            لم يبدأ بعد
                          </Badge>
                        )}
                      </div>

                      {/* Action */}
                      <div className="mt-3 pt-3 border-t">
                        {!isTeacher && (
                          isCompleted ? (
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 text-sm text-emerald-600">
                                <CheckCircle2 className="h-4 w-4" />
                                <span>مكتمل — {score?.score}/{score?.total}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs"
                                onClick={() => {
                                  setViewingQuizId(quiz.id);
                                  setReviewScoreId(score?.id || null);
                                  setCurrentPage('quiz');
                                }}
                              >
                                <Eye className="h-3 w-3" />
                                مراجعة الإجابات
                              </Button>
                            </div>
                          ) : isScheduledFuture ? (
                            <div className="flex items-center gap-2 text-sm text-amber-600">
                              <Calendar className="h-4 w-4" />
                              <span>سيبدأ في الموعد المحدد</span>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              className="gap-2 bg-teal-600 hover:bg-teal-700"
                              onClick={() => {
                                setViewingQuizId(quiz.id);
                                setReviewScoreId(null);
                                setCurrentPage('quiz');
                              }}
                            >
                              <Play className="h-3.5 w-3.5" />
                              بدء الاختبار
                            </Button>
                          )
                        )}
                        {isTeacher && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Users className="h-4 w-4" />
                            <span>{scores.filter((s) => s.quiz_id === quiz.id).length} طالب أكمل</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </motion.div>
    );
  };

  // =====================================================
  // Render: Lectures Tab
  // =====================================================
  const renderLectures = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-foreground">المحاضرات</h3>
          <p className="text-muted-foreground text-sm mt-1">محاضرات المادة والحضور</p>
        </div>
        {isTeacher && (
          <Button
            onClick={() => setCreateLectureOpen(true)}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            محاضرة جديدة
          </Button>
        )}
      </motion.div>

      {/* Lectures list */}
      {lectures.length === 0 ? (
        renderEmpty(
          <Video className="h-8 w-8 text-rose-600" />,
          'لا توجد محاضرات',
          'لم يتم إنشاء أي محاضرات بعد'
        )
      ) : (
        <motion.div variants={containerVariants} className="space-y-4">
          {lectures.map((lecture) => {
            const attendance = lectureAttendance[lecture.id] || [];
            const showAttendance = attendanceLectureId === lecture.id;
            const amAttending = myAttendanceIds.has(lecture.id);
            const attendanceCount = lecture.attendance_count ?? attendance.length;

            return (
              <motion.div key={lecture.id} variants={itemVariants}>
                <Card className={`shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
                  amAttending ? 'border-emerald-400 ring-2 ring-emerald-200 bg-emerald-50/30' :
                  lecture.is_active ? 'border-emerald-300 ring-1 ring-emerald-200' : ''
                }`} onClick={() => isTeacher && openLectureDetail(lecture)}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                        amAttending ? 'bg-emerald-200' :
                        lecture.is_active ? 'bg-emerald-100' : 'bg-rose-50'
                      }`}>
                        {amAttending ? (
                          <div className="relative">
                            <UserCheck className="h-5 w-5 text-emerald-600" />
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                            </span>
                          </div>
                        ) : lecture.is_active ? (
                          <div className="relative">
                            <Video className="h-5 w-5 text-emerald-600" />
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                            </span>
                          </div>
                        ) : (
                          <Video className="h-5 w-5 text-rose-400" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-foreground truncate">{lecture.title}</h4>
                          {amAttending ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px] gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              حاضر
                            </Badge>
                          ) : (
                            <Badge className={lecture.is_active
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]'
                              : 'bg-muted text-muted-foreground text-[10px]'
                            }>
                              {lecture.is_active ? 'جارية' : 'منتهية'}
                            </Badge>
                          )}
                        </div>
                        {lecture.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{lecture.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {lecture.started_at && (
                            <span className="flex items-center gap-1">
                              <Play className="h-3 w-3" />
                              بدأت: {formatDate(lecture.started_at)}
                            </span>
                          )}
                          {lecture.ended_at && (
                            <span className="flex items-center gap-1">
                              <Square className="h-3 w-3" />
                              انتهت: {formatDate(lecture.ended_at)}
                            </span>
                          )}
                          {isTeacher && (
                            <span className="flex items-center gap-1">
                              <UserCheck className="h-3 w-3" />
                              {attendanceCount} حاضر
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isTeacher ? (
                          <>
                            <Button
                              size="sm"
                              variant={lecture.is_active ? 'destructive' : 'default'}
                              className={lecture.is_active
                                ? 'gap-1.5'
                                : 'gap-1.5 bg-emerald-600 hover:bg-emerald-700'
                              }
                              onClick={(e) => { e.stopPropagation(); handleToggleLecture(lecture); }}
                              disabled={togglingLectureId === lecture.id}
                            >
                              {togglingLectureId === lecture.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : lecture.is_active ? (
                                <Square className="h-3.5 w-3.5" />
                              ) : (
                                <Play className="h-3.5 w-3.5" />
                              )}
                              {lecture.is_active ? 'إيقاف' : 'بدء'}
                            </Button>
                            {lecture.is_active && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 border-teal-200 text-teal-700 hover:bg-teal-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setQrLecture(lecture);
                                  setQrDialogOpen(true);
                                }}
                              >
                                <QrCode className="h-3.5 w-3.5" />
                                QR
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1.5 text-muted-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (showAttendance) {
                                  setAttendanceLectureId(null);
                                } else {
                                  fetchLectureAttendance(lecture.id);
                                  setAttendanceLectureId(lecture.id);
                                }
                              }}
                            >
                              <Users className="h-3.5 w-3.5" />
                              الحضور
                            </Button>
                          </>
                        ) : (
                          <>
                            {lecture.is_active && !amAttending && (
                              <Button
                                size="sm"
                                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                disabled={submittingAttendance}
                                onClick={() => {
                                  setScannerLecture(lecture);
                                  setScannerOpen(true);
                                }}
                              >
                                {submittingAttendance ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ScanLine className="h-3.5 w-3.5" />
                                )}
                                تسجيل حضور
                              </Button>
                            )}
                            {amAttending && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 gap-1.5 px-3 py-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                تم التسجيل
                              </Badge>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Attendance list (teacher) */}
                    <AnimatePresence>
                      {showAttendance && isTeacher && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 pt-3 border-t">
                            {attendance.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-3">لا يوجد حضور مسجل</p>
                            ) : (
                              <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-sm">
                                  <thead className="bg-muted/50 sticky top-0">
                                    <tr className="text-xs text-muted-foreground">
                                      <th className="text-right font-medium p-2">الطالب</th>
                                      <th className="text-right font-medium p-2">المسافة</th>
                                      <th className="text-right font-medium p-2">النطاق</th>
                                      <th className="text-right font-medium p-2">الوقت</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {attendance.map((a) => (
                                      <tr key={a.id} className="hover:bg-muted/30">
                                        <td className="p-2 text-foreground">{a.student_name || 'طالب'}</td>
                                        <td className="p-2 text-muted-foreground">
                                          {a.distance_meters ? `${Math.round(a.distance_meters)}م` : '—'}
                                        </td>
                                        <td className="p-2">
                                          {a.is_within_range ? (
                                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                          ) : (
                                            <XCircle className="h-4 w-4 text-rose-500" />
                                          )}
                                        </td>
                                        <td className="p-2 text-muted-foreground text-xs">
                                          {formatTime(a.attended_at)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Create lecture dialog */}
      <Dialog open={createLectureOpen} onOpenChange={setCreateLectureOpen}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-emerald-600" />
              محاضرة جديدة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">عنوان المحاضرة</label>
              <Input
                value={lectureTitle}
                onChange={(e) => setLectureTitle(e.target.value)}
                placeholder="مثال: المحاضرة الثالثة - الجبر"
                disabled={creatingLecture}
                dir="rtl"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">الوصف (اختياري)</label>
              <Textarea
                value={lectureDesc}
                onChange={(e) => setLectureDesc(e.target.value)}
                placeholder="وصف المحاضرة..."
                rows={3}
                disabled={creatingLecture}
                dir="rtl"
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCreateLectureOpen(false)}
              disabled={creatingLecture}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleCreateLecture}
              disabled={creatingLecture}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              {creatingLecture ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {creatingLecture ? 'جاري الإنشاء...' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-teal-600" />
              رمز QR للمحاضرة
            </DialogTitle>
          </DialogHeader>
          {qrLecture && (
            <div className="flex flex-col items-center gap-4 py-4">
              <p className="text-sm text-muted-foreground text-center">
                {qrLecture.title}
              </p>
              <div className="bg-white p-4 rounded-xl border shadow-sm">
                <QRCodeSVG
                  value={qrLecture.qr_code || JSON.stringify({ lectureId: qrLecture.id, subjectId, teacherId: profile.id, timestamp: Date.now() })}
                  size={220}
                  level="H"
                  includeMargin={false}
                  bgColor="#ffffff"
                  fgColor="#1a1a2e"
                />
              </div>
              <p className="text-xs text-muted-foreground text-center max-w-xs">
                اطلب من الطلاب مسح هذا الرمز لتسجيل الحضور
              </p>
              {qrLecture.qr_code && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={async () => {
                    // Refresh QR code with new timestamp
                    const newQrData = JSON.stringify({ lectureId: qrLecture.id, subjectId, teacherId: profile.id, timestamp: Date.now() });
                    const { error } = await supabase
                      .from('lectures')
                      .update({ qr_code: newQrData })
                      .eq('id', qrLecture.id);
                    if (!error) {
                      setQrLecture({ ...qrLecture, qr_code: newQrData });
                      fetchLectures();
                      toast.success('تم تحديث رمز QR');
                    }
                  }}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  تحديث الرمز
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR Scanner Dialog (Student) */}
      <QrScanner
        open={scannerOpen}
        onClose={() => {
          setScannerOpen(false);
          setScannerLecture(null);
        }}
        onScan={handleQrScanResult}
        title="مسح رمز QR لتسجيل الحضور"
      />

      {/* Lecture Detail Dialog (Teacher) */}
      <Dialog open={lectureDetailOpen} onOpenChange={(open) => {
        setLectureDetailOpen(open);
        if (!open) setLectureDetailData(null);
      }}>
        <DialogContent dir="rtl" className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          {lectureDetailData && (() => {
            const attendance = lectureAttendance[lectureDetailData.id] || [];
            const presentCount = attendance.length;
            const absentCount = students.length - presentCount;
            const attendancePercentage = students.length > 0 ? Math.round((presentCount / students.length) * 100) : 0;
            const filteredDetailStudents = students.filter(s =>
              (s.student_name || '').toLowerCase().includes(lectureDetailSearch.toLowerCase()) ||
              (s.student_email || '').toLowerCase().includes(lectureDetailSearch.toLowerCase())
            );

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      lectureDetailData.is_active ? 'bg-emerald-100' : 'bg-rose-50'
                    }`}>
                      {lectureDetailData.is_active ? (
                        <div className="relative">
                          <Video className="h-5 w-5 text-emerald-600" />
                          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                          </span>
                        </div>
                      ) : (
                        <Video className="h-5 w-5 text-rose-400" />
                      )}
                    </div>
                    <div>
                      <span>{lectureDetailData.title}</span>
                      <p className="text-sm font-normal text-muted-foreground mt-0.5">
                        {subject?.name} • {lectureDetailData.is_active ? 'جارية' : 'منتهية'}
                      </p>
                    </div>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-2">
                  {/* Stats Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg border bg-emerald-50 p-3 text-center">
                      <p className="text-2xl font-bold text-emerald-700">{presentCount}</p>
                      <p className="text-xs text-emerald-600">حاضر</p>
                    </div>
                    <div className="rounded-lg border bg-rose-50 p-3 text-center">
                      <p className="text-2xl font-bold text-rose-700">{absentCount}</p>
                      <p className="text-xs text-rose-600">غائب</p>
                    </div>
                    <div className="rounded-lg border bg-teal-50 p-3 text-center">
                      <p className="text-2xl font-bold text-teal-700">{students.length}</p>
                      <p className="text-xs text-teal-600">إجمالي</p>
                    </div>
                    <div className="rounded-lg border bg-amber-50 p-3 text-center">
                      <p className="text-2xl font-bold text-amber-700">{attendancePercentage}%</p>
                      <p className="text-xs text-amber-600">نسبة الحضور</p>
                    </div>
                  </div>

                  {/* Lecture Info */}
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {lectureDetailData.started_at && (
                      <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                        <Play className="h-3.5 w-3.5" />
                        بدأت: {formatDate(lectureDetailData.started_at)} - {formatTime(lectureDetailData.started_at)}
                      </span>
                    )}
                    {lectureDetailData.ended_at && (
                      <span className="flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-rose-700">
                        <Square className="h-3.5 w-3.5" />
                        انتهت: {formatDate(lectureDetailData.ended_at)} - {formatTime(lectureDetailData.ended_at)}
                      </span>
                    )}
                  </div>

                  {/* Notes Section */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <StickyNote className="h-4 w-4 text-amber-500" />
                      ملاحظات المحاضرة
                    </label>
                    <Textarea
                      value={lectureNote}
                      onChange={(e) => setLectureNote(e.target.value)}
                      placeholder="أضف ملاحظة على المحاضرة..."
                      rows={3}
                      dir="rtl"
                      className="resize-none"
                      disabled={savingLectureNote}
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveLectureNote}
                      disabled={savingLectureNote}
                      className="gap-2 bg-amber-600 hover:bg-amber-700"
                    >
                      {savingLectureNote ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <StickyNote className="h-3.5 w-3.5" />
                      )}
                      حفظ الملاحظة
                    </Button>
                  </div>

                  <Separator />

                  {/* Attendance List Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h4 className="font-semibold text-foreground flex items-center gap-2">
                      <Users className="h-4 w-4 text-emerald-600" />
                      قائمة الحضور ({presentCount}/{students.length})
                    </h4>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={lectureDetailSearch}
                          onChange={(e) => setLectureDetailSearch(e.target.value)}
                          placeholder="بحث عن طالب..."
                          className="pr-8 h-9 text-sm w-48"
                          dir="rtl"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        onClick={handleExportAttendanceExcel}
                      >
                        <Download className="h-3.5 w-3.5" />
                        تحميل إكسيل
                      </Button>
                    </div>
                  </div>

                  {/* Attendance Table */}
                  <div className="rounded-lg border overflow-hidden">
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0 z-10">
                          <tr className="text-xs text-muted-foreground">
                            <th className="text-right font-medium p-3 w-10">#</th>
                            <th className="text-right font-medium p-3">الطالب</th>
                            <th className="text-right font-medium p-3 hidden sm:table-cell">البريد</th>
                            <th className="text-center font-medium p-3 w-20">الحالة</th>
                            <th className="text-right font-medium p-3 hidden md:table-cell">وقت التسجيل</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {filteredDetailStudents.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center py-8 text-muted-foreground">
                                لا يوجد طلاب مسجلين
                              </td>
                            </tr>
                          ) : (
                            filteredDetailStudents.map((student, index) => {
                              const att = attendance.find(a => a.student_id === student.student_id);
                              const isPresent = !!att;
                              return (
                                <tr key={student.student_id} className={`hover:bg-muted/30 ${isPresent ? 'bg-emerald-50/30' : ''}`}>
                                  <td className="p-3 text-muted-foreground">{index + 1}</td>
                                  <td className="p-3">
                                    <div className="flex items-center gap-2">
                                      <Avatar className="h-7 w-7">
                                        <AvatarFallback className="text-[10px] bg-muted">
                                          {(student.student_name || 'ط')[0]}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span className="font-medium text-foreground">{student.student_name || 'طالب'}</span>
                                    </div>
                                  </td>
                                  <td className="p-3 text-muted-foreground hidden sm:table-cell">{student.student_email || '—'}</td>
                                  <td className="p-3 text-center">
                                    {isPresent ? (
                                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                                        <CheckCircle2 className="h-3 w-3" />
                                        حاضر
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-rose-600 border-rose-200 gap-1">
                                        <XCircle className="h-3 w-3" />
                                        غائب
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="p-3 text-muted-foreground hidden md:table-cell">
                                    {att ? `${formatTime(att.attended_at)} - ${formatDate(att.attended_at)}` : '—'}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </motion.div>
  );

  // =====================================================
  // Render: Chat Tab
  // =====================================================
  const renderChat = () => (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-0">
      <motion.div variants={itemVariants}>
        <Card className="shadow-sm overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
          {/* Chat header */}
          <div className="flex items-center gap-3 border-b p-4 bg-emerald-50/50">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
              <MessageCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h4 className="font-semibold text-foreground text-sm">محادثة المادة</h4>
              <p className="text-xs text-muted-foreground">{students.length + 1} مشارك</p>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 mb-3">
                  <MessageCircle className="h-7 w-7 text-emerald-600" />
                </div>
                <p className="text-sm font-semibold text-foreground">ابدأ المحادثة</p>
                <p className="text-xs text-muted-foreground mt-1">كن أول من يرسل رسالة في هذه المادة</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, idx) => {
                  const isOwn = msg.sender_id === profile.id;
                  const showAvatar = idx === 0 || messages[idx - 1].sender_id !== msg.sender_id;

                  return (
                    <div key={msg.id} className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                      {showAvatar ? (
                        <Avatar className="h-8 w-8 shrink-0 border border-emerald-200">
                          <AvatarFallback className="bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                            {(msg.sender_name || 'م').charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <div className="w-8 shrink-0" />
                      )}
                      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                        {showAvatar && (
                          <p className={`text-xs text-muted-foreground mb-1 ${isOwn ? 'text-left' : 'text-right'}`}>
                            {msg.sender_name || 'مستخدم'}
                          </p>
                        )}
                        <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                          isOwn
                            ? 'bg-emerald-600 text-white rounded-tl-md'
                            : 'bg-muted text-foreground rounded-tr-md'
                        }`}>
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                        <p className={`text-[10px] text-muted-foreground mt-1 ${isOwn ? 'text-left' : 'text-right'}`}>
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="border-t p-3 bg-background">
            <div className="flex items-center gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="اكتب رسالة..."
                dir="rtl"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={sendingMessage}
              />
              <Button
                size="icon"
                onClick={handleSendMessage}
                disabled={sendingMessage || !chatInput.trim()}
                className="shrink-0 bg-emerald-600 hover:bg-emerald-700"
              >
                {sendingMessage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );

  // =====================================================
  // Render: Students Tab (teacher only)
  // =====================================================
  const renderStudents = () => {
    if (!isTeacher) return null;

    return (
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-foreground">طلاب المادة</h3>
            <p className="text-muted-foreground text-sm mt-1">{students.length} طالب مسجل</p>
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="بحث عن طالب..."
              className="pr-10 w-64"
              dir="rtl"
            />
          </div>
        </motion.div>

        {/* Students table */}
        {filteredStudents.length === 0 ? (
          renderEmpty(
            <Users className="h-8 w-8 text-emerald-600" />,
            studentSearch ? 'لا توجد نتائج' : 'لا يوجد طلاب',
            studentSearch ? 'جرّب البحث بكلمات مختلفة' : 'لم يتم تسجيل أي طلاب بعد'
          )
        ) : (
          <motion.div variants={itemVariants}>
            <Card className="shadow-sm overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-right font-medium p-3">الطالب</th>
                      <th className="text-right font-medium p-3">البريد الإلكتروني</th>
                      <th className="text-right font-medium p-3">تاريخ التسجيل</th>
                      <th className="text-right font-medium p-3">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredStudents.map((student) => (
                      <tr key={student.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                              {(student.student_name || 'ط').charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-foreground truncate">
                              {student.student_name || 'طالب'}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">{student.student_email || '—'}</td>
                        <td className="p-3 text-sm text-muted-foreground">{formatDate(student.enrolled_at)}</td>
                        <td className="p-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs h-8"
                            onClick={() => handleRemoveStudent(student.student_id)}
                            disabled={removingStudentId === student.student_id}
                          >
                            {removingStudentId === student.student_id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            إزالة
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </motion.div>
        )}
      </motion.div>
    );
  };

  // =====================================================
  // Main Render
  // =====================================================
  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto" dir="rtl">
        {renderLoading()}
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto" dir="rtl">
        <div className="flex flex-col items-center justify-center py-20">
          <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">لم يتم العثور على المادة</h3>
          <p className="text-muted-foreground mb-4 text-sm">قد تكون المادة محذوفة أو غير متاحة</p>
          <Button onClick={onBack} variant="outline" className="gap-2">
            <ArrowRight className="h-4 w-4" />
            العودة
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto" dir="rtl">
      {/* Back button + Subject title */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="shrink-0 hover:bg-emerald-50 hover:text-emerald-700"
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-foreground truncate">{subject.name}</h2>
          <p className="text-sm text-muted-foreground truncate">{subject.description || 'بدون وصف'}</p>
        </div>
        <Badge
          className="shrink-0"
          style={{
            backgroundColor: subject.color ? subject.color + '20' : '#10b98120',
            color: subject.color || '#10b981',
            borderColor: subject.color ? subject.color + '40' : '#10b98140',
          }}
        >
          {subject.is_active ? 'نشطة' : 'غير نشطة'}
        </Badge>
      </motion.div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SubjectSection)} dir="rtl">
        <TabsList className="w-full flex-wrap h-auto gap-1 p-1 bg-muted/50 mb-6">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 data-[state=active]:border-emerald-200"
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">{renderOverview()}</TabsContent>
        <TabsContent value="files">{renderFiles()}</TabsContent>
        <TabsContent value="notes">{renderNotes()}</TabsContent>
        <TabsContent value="quizzes">{renderQuizzes()}</TabsContent>
        <TabsContent value="lectures">{renderLectures()}</TabsContent>
        <TabsContent value="chat">{renderChat()}</TabsContent>
        {isTeacher && <TabsContent value="students">{renderStudents()}</TabsContent>}
      </Tabs>
    </div>
  );
}
