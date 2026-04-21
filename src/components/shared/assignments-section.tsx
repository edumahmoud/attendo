'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  ClipboardCheck,
  Clock,
  Calendar,
  Send,
  Download,
  Trash2,
  Pencil,
  Eye,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Upload,
  ChevronDown,
  ChevronUp,
  Users,
  FileUp,
  X,
  Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
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
import type {
  Assignment,
  AssignmentSubmission,
  UserProfile,
  Subject,
  SubjectStudent,
} from '@/lib/types';

// =====================================================
// Props
// =====================================================
interface AssignmentsSectionProps {
  subjectId: string;
  profile: UserProfile;
  isTeacher: boolean;
  subject: Subject;
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

/** Returns deadline info: status, remaining text, badge variant */
function getDeadlineInfo(deadline?: string | null): {
  isExpired: boolean;
  isApproaching: boolean;
  isUrgent: boolean;
  remainingText: string;
  badgeClass: string;
  badgeLabel: string;
  textClass: string;
} {
  if (!deadline) {
    return {
      isExpired: false,
      isApproaching: false,
      isUrgent: false,
      remainingText: 'بدون موعد نهائي',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      badgeLabel: 'بدون موعد نهائي',
      textClass: 'text-slate-500',
    };
  }

  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diffMs = deadlineDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const remainHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const remainMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffMs <= 0) {
    return {
      isExpired: true,
      isApproaching: false,
      isUrgent: false,
      remainingText: 'منتهي',
      badgeClass: 'bg-red-100 text-red-700 border-red-200',
      badgeLabel: 'منتهي',
      textClass: 'text-red-600',
    };
  }

  if (diffHours < 1) {
    const mins = Math.max(1, remainMinutes);
    return {
      isExpired: false,
      isApproaching: true,
      isUrgent: true,
      remainingText: `يتبقى ${mins} دقيقة`,
      badgeClass: 'bg-red-100 text-red-700 border-red-200',
      badgeLabel: `${mins} دقيقة`,
      textClass: 'text-red-600',
    };
  }

  if (diffHours < 24) {
    return {
      isExpired: false,
      isApproaching: true,
      isUrgent: false,
      remainingText: `يتبقى ${remainHours} ساعات ${remainMinutes} دقيقة`,
      badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
      badgeLabel: `${remainHours} ساعات`,
      textClass: 'text-amber-600',
    };
  }

  return {
    isExpired: false,
    isApproaching: false,
    isUrgent: false,
    remainingText: `يتبقى ${diffDays} أيام ${remainHours} ساعات`,
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    badgeLabel: `${diffDays} أيام`,
    textClass: 'text-emerald-600',
  };
}

// =====================================================
// Main Component
// =====================================================
export default function AssignmentsSection({
  subjectId,
  profile,
  isTeacher,
  subject,
}: AssignmentsSectionProps) {
  // ─── Data state ───
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Teacher: Create dialog ───
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createDeadline, setCreateDeadline] = useState('');
  const [creating, setCreating] = useState(false);

  // ─── Teacher: Edit dialog ───
  const [editOpen, setEditOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editActive, setEditActive] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // ─── Teacher: Delete confirmation ───
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);

  // ─── Teacher: Toggle active ───
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ─── Teacher: Submissions view ───
  const [viewingAssignmentId, setViewingAssignmentId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [students, setStudents] = useState<SubjectStudent[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  // ─── Student: Submit dialog ───
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submittingAssignmentId, setSubmittingAssignmentId] = useState<string | null>(null);
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitNotes, setSubmitNotes] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // =====================================================
  // Data fetching
  // =====================================================
  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAssignments([]);
        return;
      }

      const response = await fetch(`/api/subjects/${subjectId}/assignments`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setAssignments(result.data as Assignment[]);
      } else {
        setAssignments([]);
      }
    } catch (err) {
      console.error('Error fetching assignments:', err);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  const fetchSubmissions = useCallback(async (assignmentId: string) => {
    setLoadingSubmissions(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSubmissions([]);
        return;
      }

      const response = await fetch(
        `/api/subjects/${subjectId}/assignments/submit?assignmentId=${assignmentId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setSubmissions(result.data as AssignmentSubmission[]);
      } else {
        setSubmissions([]);
      }
    } catch (err) {
      console.error('Error fetching submissions:', err);
      setSubmissions([]);
    } finally {
      setLoadingSubmissions(false);
    }
  }, [subjectId]);

  const fetchStudents = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStudents([]);
        return;
      }

      const response = await fetch(`/api/subjects/${subjectId}/students`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setStudents(result.data as SubjectStudent[]);
      } else {
        setStudents([]);
      }
    } catch {
      setStudents([]);
    }
  }, [subjectId]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  // Fetch students when teacher views submissions
  useEffect(() => {
    if (isTeacher && viewingAssignmentId) {
      fetchStudents();
      fetchSubmissions(viewingAssignmentId);
    }
  }, [isTeacher, viewingAssignmentId, fetchStudents, fetchSubmissions]);

  // ─── Realtime subscription ───
  useEffect(() => {
    const channel = supabase
      .channel(`subject-assignments-${subjectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assignments', filter: `subject_id=eq.${subjectId}` },
        () => fetchAssignments()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assignment_submissions', filter: `assignment_id=in.(${assignments.map(a => a.id).join(',') || 'none'})` },
        () => fetchAssignments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [subjectId, fetchAssignments, assignments]);

  // =====================================================
  // Filtered assignments for students (exclude expired)
  // =====================================================
  const visibleAssignments = useMemo(() => {
    if (isTeacher) return assignments;

    const now = new Date();
    return assignments.filter((a) => {
      if (!a.is_active) return false;
      if (a.deadline && new Date(a.deadline) < now) return false;
      return true;
    });
  }, [assignments, isTeacher]);

  // =====================================================
  // Handlers
  // =====================================================

  // ─── Create assignment (teacher) ───
  const handleCreateAssignment = async () => {
    if (!createTitle.trim()) {
      toast.error('يرجى إدخال عنوان المهمة');
      return;
    }

    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      const body: Record<string, unknown> = {
        title: createTitle.trim(),
        description: createDescription.trim() || '',
        deadline: createDeadline || null,
      };

      const response = await fetch(`/api/subjects/${subjectId}/assignments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        toast.error(result.error || 'حدث خطأ أثناء إنشاء المهمة');
        return;
      }

      toast.success('تم إنشاء المهمة بنجاح');
      setCreateTitle('');
      setCreateDescription('');
      setCreateDeadline('');
      setCreateOpen(false);
      fetchAssignments();
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setCreating(false);
    }
  };

  // ─── Update assignment (teacher) ───
  const handleUpdateAssignment = async () => {
    if (!editingAssignment || !editTitle.trim()) return;

    setSavingEdit(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      const body: Record<string, unknown> = {
        assignmentId: editingAssignment.id,
        title: editTitle.trim(),
        description: editDescription.trim() || '',
        deadline: editDeadline || null,
        is_active: editActive,
      };

      const response = await fetch(`/api/subjects/${subjectId}/assignments`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        toast.error(result.error || 'حدث خطأ أثناء تعديل المهمة');
        return;
      }

      toast.success('تم تعديل المهمة بنجاح');
      setEditOpen(false);
      setEditingAssignment(null);
      fetchAssignments();
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setSavingEdit(false);
    }
  };

  // ─── Delete assignment (teacher) ───
  const handleDeleteAssignment = async () => {
    if (!deleteTarget) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      const response = await fetch(
        `/api/subjects/${subjectId}/assignments?assignmentId=${deleteTarget.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        toast.error(result.error || 'حدث خطأ أثناء حذف المهمة');
        return;
      }

      toast.success('تم حذف المهمة بنجاح');
      fetchAssignments();
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setDeleteTarget(null);
    }
  };

  // ─── Toggle active/inactive (teacher) ───
  const handleToggleActive = async (assignment: Assignment) => {
    setTogglingId(assignment.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      const response = await fetch(`/api/subjects/${subjectId}/assignments`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignmentId: assignment.id,
          is_active: !assignment.is_active,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        toast.error(result.error || 'حدث خطأ أثناء تغيير حالة المهمة');
        return;
      }

      toast.success(assignment.is_active ? 'تم إلغاء تفعيل المهمة' : 'تم تفعيل المهمة');
      fetchAssignments();
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setTogglingId(null);
    }
  };

  // ─── Open edit dialog ───
  const handleOpenEdit = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setEditTitle(assignment.title);
    setEditDescription(assignment.description || '');
    // Convert deadline to datetime-local format
    if (assignment.deadline) {
      const d = new Date(assignment.deadline);
      const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setEditDeadline(localIso);
    } else {
      setEditDeadline('');
    }
    setEditActive(assignment.is_active);
    setEditOpen(true);
  };

  // ─── View submissions (teacher) ───
  const handleViewSubmissions = (assignmentId: string) => {
    setViewingAssignmentId(assignmentId);
  };

  // ─── Submit assignment (student) using XHR for progress ───
  const handleSubmitAssignment = async () => {
    if (!submitFile) {
      toast.error('يرجى اختيار ملف للتسليم');
      return;
    }

    if (submitFile.size > 20 * 1024 * 1024) {
      toast.error('حجم الملف يتجاوز 20 ميجابايت');
      return;
    }

    setSubmitting(true);
    setUploadProgress(0);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        setSubmitting(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', submitFile);
      formData.append('assignmentId', submittingAssignmentId || '');
      if (submitNotes.trim()) {
        formData.append('notes', submitNotes.trim());
      }

      // Use XMLHttpRequest for upload progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(pct);
          }
        });

        xhr.addEventListener('load', () => {
          try {
            const result = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && result.success) {
              resolve();
            } else {
              reject(new Error(result.error || 'حدث خطأ أثناء التسليم'));
            }
          } catch {
            reject(new Error('حدث خطأ غير متوقع'));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('حدث خطأ في الاتصال'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('تم إلغاء التسليم'));
        });

        xhr.open('POST', `/api/subjects/${subjectId}/assignments/submit`);
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        xhr.send(formData);
      });

      toast.success('تم تسليم المهمة بنجاح');
      setSubmitOpen(false);
      setSubmitFile(null);
      setSubmitNotes('');
      setUploadProgress(0);
      fetchAssignments();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Open submit dialog ───
  const handleOpenSubmit = (assignmentId: string) => {
    setSubmittingAssignmentId(assignmentId);
    setSubmitFile(null);
    setSubmitNotes('');
    setUploadProgress(0);
    setSubmitOpen(true);
  };

  // ─── Download submitted file ───
  const handleDownloadFile = (fileUrl: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName || 'file';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // =====================================================
  // Render: Loading Skeletons
  // =====================================================
  const renderLoading = () => (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        {isTeacher && <Skeleton className="h-10 w-40" />}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  );

  // =====================================================
  // Render: Empty state
  // =====================================================
  const renderEmpty = () => (
    <motion.div
      variants={itemVariants}
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 py-16"
      dir="rtl"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mb-5">
        <ClipboardCheck className="h-10 w-10 text-emerald-600" />
      </div>
      <p className="text-xl font-semibold text-foreground mb-2">
        {isTeacher ? 'لا توجد مهام بعد' : 'لا توجد مهام متاحة'}
      </p>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm text-center">
        {isTeacher
          ? 'ابدأ بإنشاء مهمة جديدة للطلاب'
          : 'لم يتم إضافة مهام بعد أو انتهت مهام جميع المواعيد النهائية'}
      </p>
      {isTeacher && (
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
        >
          <Plus className="h-4 w-4" />
          إنشاء مهمة جديدة
        </Button>
      )}
    </motion.div>
  );

  // =====================================================
  // Render: Deadline Badge
  // =====================================================
  const renderDeadlineBadge = (deadline?: string | null) => {
    const info = getDeadlineInfo(deadline);
    return (
      <Badge
        variant="outline"
        className={`${info.badgeClass} text-xs font-medium gap-1`}
      >
        {info.isExpired && <XCircle className="h-3 w-3" />}
        {info.isApproaching && !info.isExpired && <AlertTriangle className="h-3 w-3" />}
        {!info.isApproaching && !info.isExpired && deadline && <Clock className="h-3 w-3" />}
        {info.badgeLabel}
      </Badge>
    );
  };

  // =====================================================
  // Render: Deadline Countdown (for student view)
  // =====================================================
  const renderDeadlineCountdown = (deadline?: string | null) => {
    const info = getDeadlineInfo(deadline);
    if (!deadline) {
      return (
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <Clock className="h-4 w-4" />
          <span>بدون موعد نهائي</span>
        </div>
      );
    }

    return (
      <div className={`flex items-center gap-1.5 text-sm font-medium ${info.textClass}`}>
        <Clock className="h-4 w-4" />
        <span className={info.isUrgent ? 'animate-pulse' : ''}>
          {info.remainingText}
        </span>
      </div>
    );
  };

  // =====================================================
  // Render: Teacher Assignment Card
  // =====================================================
  const renderTeacherAssignmentCard = (assignment: Assignment) => {
    const deadlineInfo = getDeadlineInfo(assignment.deadline);

    return (
      <motion.div key={assignment.id} variants={itemVariants} {...cardHover}>
        <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow duration-200" dir="rtl">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <CardTitle className="text-base font-bold truncate">
                    {assignment.title}
                  </CardTitle>
                  {renderDeadlineBadge(assignment.deadline)}
                  <Badge
                    variant="outline"
                    className={
                      assignment.is_active
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200 text-xs'
                        : 'bg-slate-100 text-slate-500 border-slate-200 text-xs'
                    }
                  >
                    {assignment.is_active ? 'نشطة' : 'غير نشطة'}
                  </Badge>
                </div>
                {assignment.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {assignment.description}
                  </p>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0 space-y-3">
            {/* Meta info */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                <span>{assignment.submission_count ?? 0} تسليم</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>{formatDate(assignment.created_at)}</span>
              </div>
              {assignment.deadline && (
                <div className={`flex items-center gap-1.5 font-medium ${deadlineInfo.textClass}`}>
                  <Clock className="h-3.5 w-3.5" />
                  <span>{deadlineInfo.remainingText}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 h-8"
                onClick={() => handleViewSubmissions(assignment.id)}
              >
                <Eye className="h-3.5 w-3.5" />
                التسليمات
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={`text-xs gap-1.5 h-8 ${
                  assignment.is_active
                    ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                    : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                }`}
                onClick={() => handleToggleActive(assignment)}
                disabled={togglingId === assignment.id}
              >
                {togglingId === assignment.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : assignment.is_active ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {assignment.is_active ? 'إلغاء التفعيل' : 'تفعيل'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 h-8"
                onClick={() => handleOpenEdit(assignment)}
              >
                <Pencil className="h-3.5 w-3.5" />
                تعديل
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 h-8 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setDeleteTarget(assignment)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                حذف
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  // =====================================================
  // Render: Student Assignment Card
  // =====================================================
  const renderStudentAssignmentCard = (assignment: Assignment) => {
    const hasSubmitted = assignment.student_submitted ?? false;

    return (
      <motion.div key={assignment.id} variants={itemVariants} {...cardHover}>
        <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow duration-200" dir="rtl">
          <CardContent className="p-5 space-y-3">
            {/* Title + Submitted badge */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-bold text-foreground text-base truncate">
                    {assignment.title}
                  </h3>
                  {hasSubmitted ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs gap-1" variant="outline">
                      <CheckCircle2 className="h-3 w-3" />
                      تم التسليم
                    </Badge>
                  ) : (
                    renderDeadlineBadge(assignment.deadline)
                  )}
                </div>
                {assignment.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {assignment.description}
                  </p>
                )}
              </div>
            </div>

            {/* Deadline countdown */}
            {!hasSubmitted && renderDeadlineCountdown(assignment.deadline)}

            {/* Submit button */}
            {!hasSubmitted && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 w-full sm:w-auto"
                onClick={() => handleOpenSubmit(assignment.id)}
              >
                <Upload className="h-4 w-4" />
                تسليم المهمة
              </Button>
            )}

            {hasSubmitted && (
              <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium pt-1">
                <CheckCircle2 className="h-4 w-4" />
                <span>تم تسليم المهمة بنجاح</span>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  // =====================================================
  // Render: Submissions View (Teacher)
  // =====================================================
  const renderSubmissionsView = () => {
    const assignment = assignments.find((a) => a.id === viewingAssignmentId);
    if (!assignment) return null;

    const submittedStudentIds = new Set(submissions.map((s) => s.student_id));
    const notSubmitted = students.filter((s) => !submittedStudentIds.has(s.student_id));

    return (
      <Dialog open={!!viewingAssignmentId} onOpenChange={(open) => !open && setViewingAssignmentId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-emerald-600" />
              تسليمات: {assignment.title}
            </DialogTitle>
            <DialogDescription className="text-right">
              {submissions.length} من {students.length} طالب قاموا بالتسليم
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-1">
            {loadingSubmissions ? (
              <div className="space-y-3 py-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Submitted students */}
                {submissions.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      الطلاب الذين سلموا ({submissions.length})
                    </h4>
                    {submissions.map((sub) => (
                      <div
                        key={sub.id}
                        className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">
                                {(sub.student_name || 'ط').charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {sub.student_name || 'طالب'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {sub.student_email || ''}
                              </p>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground text-left">
                            <div>{formatDate(sub.submitted_at)}</div>
                            <div>{formatTime(sub.submitted_at)}</div>
                          </div>
                        </div>

                        {/* File info */}
                        {sub.file_name && (
                          <div className="flex items-center justify-between rounded-md bg-white/60 px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                              <span className="text-sm truncate">{sub.file_name}</span>
                              {sub.file_size && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                  ({formatFileSize(sub.file_size)})
                                </span>
                              )}
                            </div>
                            {sub.file_url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleDownloadFile(sub.file_url!, sub.file_name || 'file')}
                              >
                                <Download className="h-3.5 w-3.5" />
                                تحميل
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Notes */}
                        {sub.notes && (
                          <div className="rounded-md bg-white/60 px-3 py-2">
                            <p className="text-xs text-muted-foreground mb-0.5">ملاحظات:</p>
                            <p className="text-sm text-foreground">{sub.notes}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Not submitted students */}
                {notSubmitted.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
                      <XCircle className="h-4 w-4" />
                      الطلاب الذين لم يسلموا ({notSubmitted.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {notSubmitted.map((student) => (
                        <div
                          key={student.id}
                          className="flex items-center gap-2.5 rounded-lg border border-red-100 bg-red-50/40 p-2.5"
                        >
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="bg-red-100 text-red-600 text-[10px]">
                              {(student.student_name || 'ط').charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {student.student_name || 'طالب'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {student.student_email || ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {submissions.length === 0 && notSubmitted.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    لا يوجد طلاب مسجلين في المادة
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    );
  };

  // =====================================================
  // Render: Create Assignment Dialog (Teacher)
  // =====================================================
  const renderCreateDialog = () => (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Plus className="h-5 w-5 text-emerald-600" />
            إنشاء مهمة جديدة
          </DialogTitle>
          <DialogDescription className="text-right">
            أضف مهمة جديدة لطلاب المادة
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              عنوان المهمة <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="مثال: بحث عن الذكاء الاصطناعي"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              maxLength={200}
              className="text-right"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              الوصف <span className="text-muted-foreground text-xs">(اختياري)</span>
            </Label>
            <Textarea
              placeholder="وصف المهمة وتفاصيلها..."
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              maxLength={2000}
              rows={4}
              className="text-right resize-none"
            />
          </div>

          {/* Deadline */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              الموعد النهائي <span className="text-muted-foreground text-xs">(اختياري)</span>
            </Label>
            <Input
              type="datetime-local"
              value={createDeadline}
              onChange={(e) => setCreateDeadline(e.target.value)}
              className="text-right"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setCreateOpen(false)}
            disabled={creating}
          >
            إلغاء
          </Button>
          <Button
            onClick={handleCreateAssignment}
            disabled={creating || !createTitle.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 min-w-[100px]"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
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
  // Render: Edit Assignment Dialog (Teacher)
  // =====================================================
  const renderEditDialog = () => (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Pencil className="h-5 w-5 text-emerald-600" />
            تعديل المهمة
          </DialogTitle>
          <DialogDescription className="text-right">
            قم بتعديل بيانات المهمة
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              عنوان المهمة <span className="text-red-500">*</span>
            </Label>
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={200}
              className="text-right"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">الوصف</Label>
            <Textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              maxLength={2000}
              rows={4}
              className="text-right resize-none"
            />
          </div>

          {/* Deadline */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              الموعد النهائي
            </Label>
            <Input
              type="datetime-local"
              value={editDeadline}
              onChange={(e) => setEditDeadline(e.target.value)}
              className="text-right"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium">حالة التفعيل</Label>
            <Badge
              variant="outline"
              className={
                editActive
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200 cursor-pointer'
                  : 'bg-slate-100 text-slate-500 border-slate-200 cursor-pointer'
              }
              onClick={() => setEditActive(!editActive)}
            >
              {editActive ? 'نشطة' : 'غير نشطة'}
            </Badge>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setEditOpen(false)}
            disabled={savingEdit}
          >
            إلغاء
          </Button>
          <Button
            onClick={handleUpdateAssignment}
            disabled={savingEdit || !editTitle.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 min-w-[100px]"
          >
            {savingEdit ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                حفظ التعديلات
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // =====================================================
  // Render: Delete Confirmation Dialog (Teacher)
  // =====================================================
  const renderDeleteDialog = () => (
    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-right">حذف المهمة</AlertDialogTitle>
          <AlertDialogDescription className="text-right">
            هل أنت متأكد من حذف المهمة &quot;{deleteTarget?.title}&quot;؟ سيتم حذف جميع التسليمات
            المرتبطة بها. لا يمكن التراجع عن هذا الإجراء.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteAssignment}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            حذف
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // =====================================================
  // Render: Submit Assignment Dialog (Student)
  // =====================================================
  const renderSubmitDialog = () => {
    const assignment = assignments.find((a) => a.id === submittingAssignmentId);

    return (
      <Dialog
        open={submitOpen}
        onOpenChange={(open) => {
          if (!open && !submitting) {
            setSubmitOpen(false);
            setSubmitFile(null);
            setSubmitNotes('');
            setUploadProgress(0);
          }
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <FileUp className="h-5 w-5 text-emerald-600" />
              تسليم المهمة
            </DialogTitle>
            <DialogDescription className="text-right">
              {assignment ? `تسليم: ${assignment.title}` : 'قم برفع ملف التسليم'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* File picker */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                الملف <span className="text-red-500">*</span>
              </Label>
              <div
                className="relative rounded-lg border-2 border-dashed border-emerald-200 bg-emerald-50/30 p-6 text-center hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 20 * 1024 * 1024) {
                        toast.error('حجم الملف يتجاوز 20 ميجابايت');
                        return;
                      }
                      setSubmitFile(f);
                    }
                  }}
                />
                {submitFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-600" />
                    <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
                      {submitFile.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({formatFileSize(submitFile.size)})
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full hover:bg-red-100 hover:text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSubmitFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-8 w-8 text-emerald-400 mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      انقر لاختيار ملف أو اسحبه هنا
                    </p>
                    <p className="text-xs text-muted-foreground">
                      الحد الأقصى 20 ميجابايت
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                ملاحظات <span className="text-muted-foreground text-xs">(اختياري)</span>
              </Label>
              <Textarea
                placeholder="أضف ملاحظاتك هنا..."
                value={submitNotes}
                onChange={(e) => setSubmitNotes(e.target.value)}
                maxLength={1000}
                rows={3}
                className="text-right resize-none"
              />
            </div>

            {/* Upload progress */}
            {submitting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>جاري الرفع...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                if (!submitting) {
                  setSubmitOpen(false);
                  setSubmitFile(null);
                  setSubmitNotes('');
                  setUploadProgress(0);
                }
              }}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSubmitAssignment}
              disabled={submitting || !submitFile}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 min-w-[100px]"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  تسليم
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // =====================================================
  // Main Render
  // =====================================================
  if (loading) {
    return renderLoading();
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
            <ClipboardCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">المهام</h2>
            <p className="text-xs text-muted-foreground">
              {isTeacher
                ? `${assignments.length} مهمة`
                : `${visibleAssignments.length} مهمة متاحة`}
            </p>
          </div>
        </div>
        {isTeacher && (
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            إنشاء مهمة
          </Button>
        )}
      </div>

      {/* Assignments List */}
      {visibleAssignments.length === 0 ? (
        renderEmpty()
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {isTeacher
            ? visibleAssignments.map(renderTeacherAssignmentCard)
            : visibleAssignments.map(renderStudentAssignmentCard)}
        </motion.div>
      )}

      {/* Dialogs */}
      {isTeacher && renderCreateDialog()}
      {isTeacher && renderEditDialog()}
      {isTeacher && renderDeleteDialog()}
      {isTeacher && renderSubmissionsView()}
      {!isTeacher && renderSubmitDialog()}
    </div>
  );
}
