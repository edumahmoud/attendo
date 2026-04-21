'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  BookOpen,
  Users,
  CalendarDays,
  Trash2,
  Pencil,
  LogOut,
  GraduationCap,
  Loader2,
  Palette,
  ChevronLeft,
  X,
  Copy,
  Hash,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { UserProfile, Subject, SubjectStudent } from '@/lib/types';

// =====================================================
// Props
// =====================================================
interface SubjectsSectionProps {
  profile: UserProfile;
  role: 'teacher' | 'student';
}

// =====================================================
// Constants
// =====================================================
const COLOR_PRESETS = [
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#EF4444',
  '#06B6D4',
  '#84CC16',
  '#F97316',
  '#6366F1',
];

// =====================================================
// Animation variants
// =====================================================
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
  whileHover: { scale: 1.02, y: -3 },
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

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Generate a random 6-character alphanumeric subject code (no ambiguous chars) */
function generateSubjectCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// =====================================================
// Main Component
// =====================================================
export default function SubjectsSection({ profile, role }: SubjectsSectionProps) {
  const isTeacher = role === 'teacher';

  // ─── Store ───
  const { setViewingSubjectId } = useAppStore();

  // ─── Data state ───
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [subjectCodeMissing, setSubjectCodeMissing] = useState(false);
  const [showMigrationBanner, setShowMigrationBanner] = useState(false);

  // ─── Search ───
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Create / Edit dialog ───
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState(COLOR_PRESETS[0]);
  const [submitting, setSubmitting] = useState(false);

  // ─── Delete confirmation ───
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);

  // ─── Unenroll confirmation (student) ───
  const [unenrollTarget, setUnenrollTarget] = useState<Subject | null>(null);

  // ─── Enroll dialog (student) ───
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [searchingSubject, setSearchingSubject] = useState(false);
  const [foundSubject, setFoundSubject] = useState<Subject | null>(null);

  // ─── Copy code feedback ───
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // ─── Initial mount tracking ───
  const isInitialMount = useRef(true);

  // =====================================================
  // Data fetching
  // =====================================================
  const fetchSubjects = useCallback(async () => {
    // Only show loading skeleton on the very first load
    if (isInitialMount.current) setLoading(true);
    setDbError(null);
    try {
      // Verify session is valid before querying
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('[SubjectsSection] No active session');
        setSubjects([]);
        return;
      }

      if (isTeacher) {
        // Teacher: fetch subjects they created
        const { data, error } = await supabase
          .from('subjects')
          .select('*')
          .eq('teacher_id', profile.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[SubjectsSection] Teacher subjects error:', JSON.stringify({ code: error.code, message: error.message, details: error.details, hint: error.hint }));
          // Infinite recursion in RLS policies
          if (error.code === '42P17' || (error.message || '').includes('infinite recursion')) {
            setDbError('recursion');
          } else if (error.code === '42501' || (error.message || '').includes('policy') || (error.message || '').includes('RLS')) {
            setDbError('permissions');
          } else {
            setDbError('unknown');
          }
          setSubjects([]);
        } else {
          const subjectsList = (data as Subject[]) || [];

          // Render subjects immediately without counts so the UI appears faster
          setSubjects(subjectsList.map((s) => ({ ...s, student_count: 0 })));

          // Fetch student counts in the background and update
          if (subjectsList.length > 0) {
            const subjectIds = subjectsList.map((s) => s.id);
            // Run student count query — don't await blocking the render
            supabase
              .from('subject_students')
              .select('subject_id')
              .in('subject_id', subjectIds)
              .then(({ data: studentCounts }) => {
                const countMap: Record<string, number> = {};
                (studentCounts as { subject_id: string }[])?.forEach((s) => {
                  countMap[s.subject_id] = (countMap[s.subject_id] || 0) + 1;
                });
                setSubjects((prev) =>
                  prev.map((s) => ({
                    ...s,
                    student_count: countMap[s.id] || 0,
                  })),
                );
              });
          }
        }
      } else {
        // Student: fetch enrolled subjects via subject_students
        const { data: enrollments, error: enrollError } = await supabase
          .from('subject_students')
          .select('subject_id, enrolled_at')
          .eq('student_id', profile.id);

        if (enrollError) {
          console.error('[SubjectsSection] Student enrollments error:', JSON.stringify({ code: enrollError.code, message: enrollError.message, details: enrollError.details, hint: enrollError.hint }));
          if (enrollError.code === '42P17' || (enrollError.message || '').includes('infinite recursion')) {
            setDbError('recursion');
          } else if (enrollError.code === '42501' || (enrollError.message || '').includes('policy') || (enrollError.message || '').includes('RLS')) {
            setDbError('permissions');
          } else {
            setDbError('unknown');
          }
          setSubjects([]);
        } else if (enrollments && enrollments.length > 0) {
          const subjectIds = enrollments.map((e: { subject_id: string }) => e.subject_id);

          const { data: subjectsData, error: subjectsError } = await supabase
            .from('subjects')
            .select('*')
            .in('id', subjectIds)
            .order('created_at', { ascending: false });

          if (subjectsError) {
            console.error('[SubjectsSection] Student subjects error:', JSON.stringify({ code: subjectsError.code, message: subjectsError.message, details: subjectsError.details, hint: subjectsError.hint }));
            if (subjectsError.code === '42P17' || (subjectsError.message || '').includes('infinite recursion')) {
              setDbError('recursion');
            } else if (subjectsError.code === '42501' || (subjectsError.message || '').includes('policy') || (subjectsError.message || '').includes('RLS')) {
              setDbError('permissions');
            } else {
              setDbError('unknown');
            }
            setSubjects([]);
          } else {
            // Fetch teacher names
            const teacherIds = [
              ...new Set((subjectsData as Subject[])?.map((s) => s.teacher_id) || []),
            ];

            let teacherMap: Record<string, string> = {};
            if (teacherIds.length > 0) {
              const { data: teachers } = await supabase
                .from('users')
                .select('id, name')
                .in('id', teacherIds);

              (teachers as { id: string; name: string }[])?.forEach((t) => {
                teacherMap[t.id] = t.name;
              });
            }

            const enrollmentMap = new Map(
              enrollments.map((e: { subject_id: string; enrolled_at: string }) => [
                e.subject_id,
                e.enrolled_at,
              ]),
            );

            const enriched = ((subjectsData as Subject[]) || []).map((s) => ({
              ...s,
              teacher_name: teacherMap[s.teacher_id] || 'معلم',
              _enrolled_at: enrollmentMap.get(s.id) || s.created_at,
            }));
            setSubjects(enriched);
          }
        } else {
          setSubjects([]);
        }
      }
    } catch (err) {
      console.error('[SubjectsSection] Unexpected error:', err);
      setDbError('unknown');
      setSubjects([]);
    } finally {
      if (isInitialMount.current) {
        setLoading(false);
        isInitialMount.current = false;
      }
    }
  }, [profile.id, isTeacher]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  // ─── Realtime subscription ───
  useEffect(() => {
    const channel = supabase
      .channel('subjects-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subjects' },
        () => fetchSubjects(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subject_students' },
        () => fetchSubjects(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSubjects]);

  // ─── Check if subject_code column exists (cached in localStorage) ───
  useEffect(() => {
    const checkSubjectCodeColumn = async () => {
      // Check localStorage cache first to avoid redundant API calls
      const cached = localStorage.getItem('subject_code_missing');
      if (cached !== null) {
        const isMissing = cached === 'true';
        setSubjectCodeMissing(isMissing);
        if (isMissing && isTeacher) setShowMigrationBanner(true);
        return;
      }

      try {
        const { error } = await supabase
          .from('subjects')
          .select('subject_code')
          .limit(1);

        if (error && (error.code === '42703' || (error.message || '').includes('subject_code') || (error.message || '').includes('does not exist'))) {
          setSubjectCodeMissing(true);
          localStorage.setItem('subject_code_missing', 'true');
          if (isTeacher) setShowMigrationBanner(true);
        } else {
          setSubjectCodeMissing(false);
          localStorage.setItem('subject_code_missing', 'false');
        }
      } catch {
        // Column might not exist
        setSubjectCodeMissing(true);
        localStorage.setItem('subject_code_missing', 'true');
        if (isTeacher) setShowMigrationBanner(true);
      }
    };

    checkSubjectCodeColumn();
  }, [isTeacher]);

  // =====================================================
  // Filtered subjects
  // =====================================================
  const filteredSubjects = subjects.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.teacher_name || '').toLowerCase().includes(q)
    );
  });

  // =====================================================
  // Handlers
  // =====================================================

  // ─── Open create dialog ───
  const handleOpenCreate = () => {
    setEditingSubject(null);
    setFormName('');
    setFormDescription('');
    setFormColor(COLOR_PRESETS[0]);
    setDialogOpen(true);
  };

  // ─── Open edit dialog ───
  const handleOpenEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setFormName(subject.name);
    setFormDescription(subject.description || '');
    setFormColor(subject.color || COLOR_PRESETS[0]);
    setDialogOpen(true);
  };

  // ─── Submit create / edit ───
  const handleSubmitSubject = async () => {
    const name = formName.trim();
    if (!name) {
      toast.error('يرجى إدخال اسم المقرر');
      return;
    }

    setSubmitting(true);
    try {
      if (editingSubject) {
        // Update
        const { error } = await supabase
          .from('subjects')
          .update({
            name,
            description: formDescription.trim() || null,
            color: formColor,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingSubject.id);

        if (error) {
          console.error('Subject update error:', error);
          toast.error(`حدث خطأ أثناء تعديل المقرر: ${error.message || 'خطأ غير معروف'}`);
        } else {
          toast.success('تم تعديل المقرر بنجاح');
          setDialogOpen(false);
          fetchSubjects();
        }
      } else {
        // Create with auto-generated subject code (if column exists)
        const insertData: Record<string, unknown> = {
          teacher_id: profile.id,
          name,
          description: formDescription.trim() || null,
          color: formColor,
          is_active: true,
        };

        if (!subjectCodeMissing) {
          insertData.subject_code = generateSubjectCode();
        }

        const { error } = await supabase.from('subjects').insert(insertData);

        if (error) {
          // If subject_code column doesn't exist, retry without it
          if (!subjectCodeMissing && error.message && (error.message.includes('subject_code') || error.message.includes('column') || error.code === '42703')) {
            setSubjectCodeMissing(true);
            const { error: retryError } = await supabase.from('subjects').insert({
              teacher_id: profile.id,
              name,
              description: formDescription.trim() || null,
              color: formColor,
              is_active: true,
            });

            if (retryError) {
              console.error('Subject create error (retry):', retryError);
              toast.error(`حدث خطأ أثناء إنشاء المقرر: ${retryError.message || 'خطأ غير معروف'}`);
            } else {
              toast.success('تم إنشاء المقرر بنجاح');
              setDialogOpen(false);
              fetchSubjects();
            }
          } else {
            console.error('Subject create error:', error);
            toast.error(`حدث خطأ أثناء إنشاء المقرر: ${error.message || 'خطأ غير معروف'}`);
          }
        } else {
          toast.success('تم إنشاء المقرر بنجاح');
          setDialogOpen(false);
          fetchSubjects();
        }
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Delete subject (teacher) ───
  const handleDeleteSubject = async () => {
    if (!deleteTarget) return;

    try {
      const { error } = await supabase.from('subjects').delete().eq('id', deleteTarget.id);
      if (error) {
        toast.error('حدث خطأ أثناء حذف المقرر');
      } else {
        toast.success('تم حذف المقرر بنجاح');
        fetchSubjects();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setDeleteTarget(null);
    }
  };

  // ─── Unenroll from subject (student) ───
  const handleUnenroll = async () => {
    if (!unenrollTarget) return;

    try {
      const { error } = await supabase
        .from('subject_students')
        .delete()
        .eq('subject_id', unenrollTarget.id)
        .eq('student_id', profile.id);

      if (error) {
        toast.error('حدث خطأ أثناء إلغاء التسجيل');
      } else {
        toast.success('تم إلغاء التسجيل بنجاح');
        fetchSubjects();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setUnenrollTarget(null);
    }
  };

  // ─── Search subject by subject code (student enroll) ───
  const handleSearchSubject = async () => {
    const code = enrollCode.trim().toUpperCase();
    if (!code) {
      toast.error('يرجى إدخال رمز المقرر');
      return;
    }

    setSearchingSubject(true);
    setFoundSubject(null);
    try {
      // Find subject by subject_code
      const { data: subjectData, error: subjectError } = await supabase
        .from('subjects')
        .select('*')
        .eq('subject_code', code)
        .eq('is_active', true)
        .single();

      if (subjectError || !subjectData) {
        toast.error('لم يتم العثور على مقرر بهذا الرمز');
        setSearchingSubject(false);
        return;
      }

      const subject = subjectData as Subject;

      // Check if already enrolled
      const enrolledIds = new Set(subjects.map((s) => s.id));
      if (enrolledIds.has(subject.id)) {
        toast.error('أنت مسجل بالفعل في هذا المقرر');
        setSearchingSubject(false);
        return;
      }

      // Fetch teacher name
      const { data: teacherData } = await supabase
        .from('users')
        .select('id, name')
        .eq('id', subject.teacher_id)
        .single();

      subject.teacher_name = (teacherData as { id: string; name: string })?.name || 'معلم';
      setFoundSubject(subject);
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setSearchingSubject(false);
    }
  };

  // ─── Enroll in found subject ───
  const handleEnroll = async () => {
    if (!foundSubject) return;

    setEnrolling(true);
    try {
      const { error } = await supabase.from('subject_students').insert({
        subject_id: foundSubject.id,
        student_id: profile.id,
      });

      if (error) {
        if (error.code === '23505') {
          toast.error('أنت مسجل بالفعل في هذا المقرر');
        } else {
          toast.error('حدث خطأ أثناء التسجيل في المقرر');
        }
      } else {
        toast.success('تم التسجيل في المقرر بنجاح');
        setFoundSubject(null);
        setEnrollCode('');
        setEnrollOpen(false);
        fetchSubjects();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setEnrolling(false);
    }
  };

  // ─── Navigate to subject detail ───
  const handleSubjectClick = (subjectId: string) => {
    setViewingSubjectId(subjectId);
  };

  // ─── Copy subject code ───
  const handleCopyCode = (code: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success('تم نسخ رمز المقرر');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // =====================================================
  // Render: Loading Skeletons
  // =====================================================
  const renderLoading = () => (
    <div className="space-y-6" dir="rtl">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-44" />
      </div>
      {/* Search skeleton */}
      <Skeleton className="h-10 w-full max-w-sm" />
      {/* Cards grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-52 rounded-xl" />
        ))}
      </div>
    </div>
  );

  // =====================================================
  // Render: Database Error state
  // =====================================================
  const renderDbError = () => (
    <motion.div
      variants={itemVariants}
      className="flex flex-col items-center justify-center rounded-xl border border-amber-300 bg-amber-50/30 py-20"
      dir="rtl"
    >
      <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-amber-100 mb-4 sm:mb-5">
        <BookOpen className="h-8 w-8 sm:h-10 sm:w-10 text-amber-600" />
      </div>
      <p className="text-lg sm:text-xl font-semibold text-foreground mb-2">
        {dbError === 'recursion'
          ? 'يحتاج قسم المقررات إعداد قاعدة البيانات'
          : 'خطأ في الوصول إلى البيانات'}
      </p>
      <p className="text-sm text-muted-foreground mb-6 max-w-md text-center">
        {dbError === 'recursion'
          ? 'يوجد تعارض في سياسات الأمان بقاعدة البيانات. يرجى تشغيل سكريبت الإصلاح في محرر SQL في Supabase.'
          : dbError === 'permissions'
            ? 'خطأ في صلاحيات الوصول. يرجى تشغيل سكريبت إعداد قاعدة البيانات.'
            : 'حدث خطأ غير متوقع أثناء تحميل المقررات.'}
      </p>
      <Button
        onClick={() => fetchSubjects()}
        className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
      >
        إعادة المحاولة
      </Button>
    </motion.div>
  );

  // =====================================================
  // Render: Empty state
  // =====================================================
  const renderEmpty = () => (
    <motion.div
      variants={itemVariants}
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 py-20"
      dir="rtl"
    >
      <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-emerald-100 mb-4 sm:mb-5">
        <BookOpen className="h-8 w-8 sm:h-10 sm:w-10 text-emerald-600" />
      </div>
      <p className="text-lg sm:text-xl font-semibold text-foreground mb-2">
        {isTeacher ? 'لا توجد مقررات بعد' : 'لم تسجل في أي مقرر بعد'}
      </p>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm text-center">
        {isTeacher
          ? 'ابدأ بإنشاء مقررك الأول لإدارة الطلاب والمحتوى التعليمي'
          : subjectCodeMissing
            ? 'قم بربط حسابك مع معلمك أو استخدم رمز المقرر للتسجيل'
            : 'استخدم رمز المقرر للتسجيل والوصول إلى المحتوى التعليمي'}
      </p>
      {isTeacher ? (
        <Button
          onClick={handleOpenCreate}
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
        >
          <Plus className="h-4 w-4" />
          إنشاء مقرر جديد
        </Button>
      ) : (
        <Button
          onClick={() => setEnrollOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
        >
          <GraduationCap className="h-4 w-4" />
          التسجيل في مقرر
        </Button>
      )}
    </motion.div>
  );

  // =====================================================
  // Render: Subject Card
  // =====================================================
  const renderSubjectCard = (subject: Subject) => {
    const color = subject.color || '#10B981';
    const enrolledAt = (subject as Subject & { _enrolled_at?: string })._enrolled_at;

    return (
      <motion.div key={subject.id} variants={itemVariants} {...cardHover}>
        <Card
          className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow duration-200 cursor-pointer group"
          dir="rtl"
          onClick={() => handleSubjectClick(subject.id)}
        >
          {/* Color bar header */}
          <div
            className="relative h-24 sm:h-28"
            style={{
              background: `linear-gradient(135deg, ${color}, ${hexToRgba(color, 0.7)})`,
            }}
          >
            <div className="absolute inset-0 bg-black/5" />
            {/* Subject icon */}
            <div className="absolute top-3 right-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
              <BookOpen className="h-5 w-5 text-white" />
            </div>

            {/* Action buttons */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              {isTeacher ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-white/20 text-white hover:bg-white/30 hover:text-white backdrop-blur-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(subject);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-white/20 text-white hover:bg-red-400/60 hover:text-white backdrop-blur-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(subject);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg bg-white/20 text-white hover:bg-red-400/60 hover:text-white backdrop-blur-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUnenrollTarget(subject);
                  }}
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Active badge + Subject code */}
            <div className="absolute bottom-2 sm:bottom-3 right-3 sm:right-4 left-3 sm:left-4 flex items-end justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <Badge
                  className="bg-white/20 text-white border-white/30 backdrop-blur-sm text-[10px]"
                >
                  {subject.is_active ? 'نشطة' : 'غير نشطة'}
                </Badge>
                {isTeacher && subject.subject_code && (
                  <button
                    onClick={(e) => handleCopyCode(subject.subject_code || '', e)}
                    className="flex items-center gap-1 rounded-md bg-black/30 text-white/90 backdrop-blur-sm px-1.5 sm:px-2 py-0.5 text-[10px] font-mono tracking-wider hover:bg-black/50 transition-colors"
                    title="انقر للنسخ"
                  >
                    <Hash className="h-3 w-3" />
                    {subject.subject_code}
                    <Copy className="h-2.5 w-2.5 opacity-60" />
                  </button>
                )}
              </div>
              {/* Chevron */}
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <ChevronLeft className="h-4 w-4 text-white" />
              </div>
            </div>
          </div>

          {/* Content */}
          <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
            {/* Name */}
            <h3 className="font-bold text-foreground text-sm sm:text-base leading-tight line-clamp-2">
              {subject.name}
            </h3>

            {/* Description */}
            {subject.description && (
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                {subject.description}
              </p>
            )}

            {/* Meta info */}
            <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
              {isTeacher ? (
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground">
                  <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span>{subject.student_count ?? 0} طالب</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground min-w-0">
                  <GraduationCap className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                  <span className="line-clamp-1">{subject.teacher_name || 'معلم'}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground shrink-0">
                <CalendarDays className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span>{formatDate(isTeacher ? subject.created_at : (enrolledAt || subject.created_at))}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  // =====================================================
  // Render: Create / Edit Dialog
  // =====================================================
  const renderSubjectDialog = () => (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">
            {editingSubject ? 'تعديل المقرر' : 'إنشاء مقرر جديد'}
          </DialogTitle>
          <DialogDescription className="text-right">
            {editingSubject
              ? 'قم بتعديل بيانات المقرر'
              : 'أدخل بيانات المقرر الجديد'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              اسم المقرر <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="مثال: الرياضيات - المستوى الثالث"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              maxLength={100}
              className="text-right"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              الوصف <span className="text-muted-foreground text-xs">(اختياري)</span>
            </label>
            <Textarea
              placeholder="وصف مختصر للمقرر الدراسي..."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="text-right resize-none"
            />
          </div>

          {/* Color picker */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              لون المقرر
            </label>
            <div className="grid grid-cols-5 gap-2">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormColor(color)}
                  className={`relative h-10 w-full rounded-lg transition-all duration-150 ${
                    formColor === color
                      ? 'ring-2 ring-offset-2 ring-offset-background scale-110 shadow-md'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color, ringColor: color }}
                >
                  {formColor === color && (
                    <motion.div
                      layoutId="color-check"
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <svg
                        className="h-4 w-4 text-white drop-shadow-sm"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </motion.div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setDialogOpen(false)}
            disabled={submitting}
          >
            إلغاء
          </Button>
          <Button
            onClick={handleSubmitSubject}
            disabled={submitting || !formName.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 min-w-[100px]"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : editingSubject ? (
              'تعديل'
            ) : (
              <>
                <Plus className="h-4 w-4" />
                إنشاء
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // =====================================================
  // Render: Delete Confirmation Dialog
  // =====================================================
  const renderDeleteDialog = () => (
    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-right">حذف المقرر</AlertDialogTitle>
          <AlertDialogDescription className="text-right">
            هل أنت متأكد من حذف مقرر &quot;{deleteTarget?.name}&quot;؟ سيتم حذف جميع البيانات
            المرتبطة بالمقرر بما في ذلك الطلاب المسجلين والملفات والملاحظات. لا يمكن التراجع عن هذا
            الإجراء.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteSubject}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            حذف
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // =====================================================
  // Render: Unenroll Confirmation Dialog
  // =====================================================
  const renderUnenrollDialog = () => (
    <AlertDialog open={!!unenrollTarget} onOpenChange={(open) => !open && setUnenrollTarget(null)}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-right">إلغاء التسجيل</AlertDialogTitle>
          <AlertDialogDescription className="text-right">
            هل أنت متأكد من إلغاء التسجيل في مقرر &quot;{unenrollTarget?.name}&quot;؟ لن تتمكن من
            الوصول إلى محتوى المقرر بعد الآن.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleUnenroll}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            إلغاء التسجيل
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // =====================================================
  // Render: Enroll Dialog (Student)
  // =====================================================
  const renderEnrollDialog = () => (
    <Dialog open={enrollOpen} onOpenChange={(open) => {
      setEnrollOpen(open);
      if (!open) {
        setFoundSubject(null);
        setEnrollCode('');
      }
    }}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">التسجيل في مقرر</DialogTitle>
          <DialogDescription className="text-right">
            أدخل رمز المقرر للتسجيل فيه
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {subjectCodeMissing ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 text-center space-y-2">
              <Hash className="h-8 w-8 text-amber-500 mx-auto" />
              <p className="text-sm font-medium text-amber-800">ميزة الاشتراك عبر رمز المقرر غير مفعّلة بعد</p>
              <p className="text-xs text-amber-600">يرجى التواصل مع المعلم أو المشرف لتفعيل هذه الميزة في قاعدة البيانات</p>
            </div>
          ) : (
          <>
          {/* Subject code input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              رمز المقرر <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="أدخل رمز المقرر..."
                value={enrollCode}
                onChange={(e) => setEnrollCode(e.target.value)}
                maxLength={50}
                className="text-right flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearchSubject();
                }}
              />
              <Button
                onClick={handleSearchSubject}
                disabled={searchingSubject || !enrollCode.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 gap-2"
              >
                {searchingSubject ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                بحث
              </Button>
            </div>
          </div>

          {/* Found subject */}
          <AnimatePresence mode="wait">
            {foundSubject && (
              <motion.div
                key="found-subject"
                initial={{ opacity: 0, y: 10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Card className="overflow-hidden border-0 shadow-md" dir="rtl">
                  <div
                    className="h-16"
                    style={{
                      background: `linear-gradient(135deg, ${foundSubject.color || '#10B981'}, ${hexToRgba(foundSubject.color || '#10B981', 0.7)})`,
                    }}
                  />
                  <CardContent className="p-4 space-y-2">
                    <h4 className="font-bold text-foreground">{foundSubject.name}</h4>
                    {foundSubject.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {foundSubject.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <GraduationCap className="h-3.5 w-3.5" />
                      <span>{foundSubject.teacher_name || 'معلم'}</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
          </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => {
              setEnrollOpen(false);
              setFoundSubject(null);
              setEnrollCode('');
            }}
            disabled={enrolling}
          >
            إلغاء
          </Button>
          {foundSubject && (
            <Button
              onClick={handleEnroll}
              disabled={enrolling}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 min-w-[120px]"
            >
              {enrolling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <GraduationCap className="h-4 w-4" />
                  تسجيل
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // =====================================================
  // Main Render
  // =====================================================
  if (loading) {
    return renderLoading();
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* ─── Migration Banner (when subject_code column missing) ─── */}
      {showMigrationBanner && isTeacher && subjectCodeMissing && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-amber-300 bg-amber-50/50 p-3 sm:p-4 shadow-sm"
          dir="rtl"
        >
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
              <Hash className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <h3 className="font-semibold text-amber-800">رمز الاشتراك غير مفعّل</h3>
              <p className="text-sm text-amber-700">
                لتفعيل ميزة الاشتراك عبر رمز المقرر، يجب تشغيل سكريبت SQL في قاعدة البيانات.
                انتقل إلى Supabase Dashboard ← SQL Editor والصق الكود التالي:
              </p>
              <div className="relative">
                <pre className="rounded-lg bg-amber-900/10 p-3 text-xs text-amber-900 overflow-x-auto max-h-32 overflow-y-auto custom-scrollbar" dir="ltr">
{`ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS subject_code TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_subjects_code
  ON public.subjects(subject_code)
  WHERE subject_code IS NOT NULL;

DROP FUNCTION IF EXISTS public.generate_subject_code();

CREATE OR REPLACE FUNCTION public.generate_subject_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    PERFORM 1 FROM public.subjects WHERE subject_code = result;
    IF NOT FOUND THEN RETURN result; END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE subj RECORD; new_code TEXT;
BEGIN
  FOR subj IN SELECT id FROM public.subjects WHERE subject_code IS NULL LOOP
    new_code := public.generate_subject_code();
    UPDATE public.subjects SET subject_code = new_code WHERE id = subj.id;
  END LOOP;
END;
$$;

ALTER TABLE public.subjects
  ALTER COLUMN subject_code SET NOT NULL;

DROP POLICY IF EXISTS "Students can look up subjects by code" ON public.subjects;
CREATE POLICY "Students can look up subjects by code" ON public.subjects
  FOR SELECT USING (true);

GRANT SELECT, INSERT, UPDATE ON public.subjects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;`}
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 left-2 bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-700"
                  onClick={() => {
                    navigator.clipboard.writeText(`ALTER TABLE public.subjects\n  ADD COLUMN IF NOT EXISTS subject_code TEXT UNIQUE;\n\nCREATE INDEX IF NOT EXISTS idx_subjects_code ON public.subjects(subject_code) WHERE subject_code IS NOT NULL;\n\nDROP FUNCTION IF EXISTS public.generate_subject_code();\n\nCREATE OR REPLACE FUNCTION public.generate_subject_code()\nRETURNS TEXT AS $$\nDECLARE\n  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';\n  result TEXT := '';\n  i INTEGER;\nBEGIN\n  LOOP\n    result := '';\n    FOR i IN 1..6 LOOP\n      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);\n    END LOOP;\n    PERFORM 1 FROM public.subjects WHERE subject_code = result;\n    IF NOT FOUND THEN RETURN result; END IF;\n  END LOOP;\nEND;\n$$ LANGUAGE plpgsql;\n\nDO $$\nDECLARE subj RECORD; new_code TEXT;\nBEGIN\n  FOR subj IN SELECT id FROM public.subjects WHERE subject_code IS NULL LOOP\n    new_code := public.generate_subject_code();\n    UPDATE public.subjects SET subject_code = new_code WHERE id = subj.id;\n  END LOOP;\nEND;\n$$;\n\nALTER TABLE public.subjects ALTER COLUMN subject_code SET NOT NULL;\n\nDROP POLICY IF EXISTS "Students can look up subjects by code" ON public.subjects;\nCREATE POLICY "Students can look up subjects by code" ON public.subjects FOR SELECT USING (true);\n\nGRANT SELECT, INSERT, UPDATE ON public.subjects TO anon;\nGRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;`);
                    toast.success('تم نسخ كود SQL');
                  }}
                >
                  <Copy className="h-3.5 w-3.5 ml-1" />
                  نسخ
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-amber-600 hover:text-amber-700 hover:bg-amber-100"
                onClick={() => {
                  setSubjectCodeMissing(false);
                  // Re-check and update localStorage cache
                  supabase.from('subjects').select('subject_code').limit(1).then(({ error }) => {
                    if (error && (error.code === '42703' || error.message?.includes('subject_code'))) {
                      setSubjectCodeMissing(true);
                      localStorage.setItem('subject_code_missing', 'true');
                      toast.error('العمود لم يُضاف بعد. يرجى تشغيل السكريبت أولاً');
                    } else {
                      setSubjectCodeMissing(false);
                      localStorage.setItem('subject_code_missing', 'false');
                      setShowMigrationBanner(false);
                      toast.success('تم تفعيل رمز الاشتراك بنجاح! 🎉');
                      fetchSubjects();
                    }
                  });
                }}
              >
                <CheckCircle2 className="h-4 w-4 ml-1" />
                  تم تشغيل السكريبت — تحقق
              </Button>
            </div>
            <button
              onClick={() => setShowMigrationBanner(false)}
              className="shrink-0 rounded-md p-1 text-amber-500 hover:bg-amber-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}

      {/* ─── Header ─── */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h2 className="text-lg sm:text-2xl font-bold text-foreground">
            {isTeacher ? 'المقررات الدراسية' : 'مقرراتي'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isTeacher
              ? `${subjects.length} مقرر — إدارة المحتوى والطلاب`
              : `${subjects.length} مقرر مسجل`}
          </p>
        </div>

        {isTeacher ? (
          <Button
            onClick={handleOpenCreate}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shrink-0"
          >
            <Plus className="h-4 w-4" />
            إنشاء مقرر جديد
          </Button>
        ) : (
          <Button
            onClick={() => setEnrollOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shrink-0"
          >
            <GraduationCap className="h-4 w-4" />
            التسجيل في مقرر
          </Button>
        )}
      </motion.div>

      {/* ─── Search ─── */}
      {subjects.length > 0 && (
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          className="relative w-full sm:max-w-sm"
        >
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="البحث في المقررات..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9 text-right"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </motion.div>
      )}

      {/* ─── Content ─── */}
      {dbError ? (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {renderDbError()}
        </motion.div>
      ) : subjects.length === 0 ? (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {renderEmpty()}
        </motion.div>
      ) : filteredSubjects.length === 0 ? (
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 py-16"
        >
          <Search className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-base font-medium text-muted-foreground">لا توجد نتائج</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            جرب البحث بكلمات مختلفة
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
        >
          {filteredSubjects.map((subject) => renderSubjectCard(subject))}
        </motion.div>
      )}

      {/* ─── Dialogs ─── */}
      {renderSubjectDialog()}
      {renderDeleteDialog()}
      {renderUnenrollDialog()}
      {renderEnrollDialog()}
    </div>
  );
}
