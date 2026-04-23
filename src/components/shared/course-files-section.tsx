'use client';

// =====================================================
// CourseFilesSection — ملفات المقرر
// Displays course files with preview, download, share,
// visibility toggle, and delete actions.
// Files classified by type with auto-generated tabs.
// =====================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  Trash2,
  Eye,
  File,
  FileText,
  ImageIcon,
  FileSpreadsheet,
  FilePlus,
  FolderOpen,
  Loader2,
  Globe,
  Lock,
  Share2,
  Check,
  Search,
  Music,
  Video,
  Presentation,
  Clock,
  Headphones,
  MonitorPlay,
  FileVideo,
  MoreVertical,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import type { UserProfile, Subject, SubjectFile } from '@/lib/types';

// =====================================================
// Props
// =====================================================
interface CourseFilesSectionProps {
  subjectId: string;
  profile: UserProfile;
  isTeacher: boolean;
  subject: Subject;
}

// =====================================================
// File type category constants
// =====================================================
const FILE_CATEGORY_ALL = 'الكل';
const FILE_CATEGORY_DOCUMENTS = 'مستندات';
const FILE_CATEGORY_IMAGES = 'صور';
const FILE_CATEGORY_VIDEOS = 'فيديو';
const FILE_CATEGORY_AUDIO = 'صوتيات';
const FILE_CATEGORY_SPREADSHEETS = 'جداول';
const FILE_CATEGORY_PRESENTATIONS = 'عروض';
const FILE_CATEGORY_OTHER = 'أخرى';

// =====================================================
// Animation variants
// =====================================================
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

// =====================================================
// Helpers
// =====================================================

/** Detect file type category from MIME type and/or file name */
function getFileTypeCategory(fileType?: string | null, fileName?: string): string {
  const ext = fileName ? fileName.split('.').pop()?.toLowerCase() : '';

  if (fileType) {
    const t = fileType.toLowerCase();
    if (t.includes('pdf')) return FILE_CATEGORY_DOCUMENTS;
    if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('gif') || t.includes('webp'))
      return FILE_CATEGORY_IMAGES;
    if (t.includes('video') || t.includes('mp4') || t.includes('webm') || t.includes('mov'))
      return FILE_CATEGORY_VIDEOS;
    if (t.includes('audio') || t.includes('mp3') || t.includes('wav') || t.includes('ogg') || t.includes('m4a'))
      return FILE_CATEGORY_AUDIO;
    if (t.includes('sheet') || t.includes('excel') || t.includes('csv') || t.includes('spreadsheet'))
      return FILE_CATEGORY_SPREADSHEETS;
    if (t.includes('presentation') || t.includes('powerpoint') || t.includes('ppt'))
      return FILE_CATEGORY_PRESENTATIONS;
    if (t.includes('word') || t.includes('doc') || t.includes('text/plain') || t.includes('rtf'))
      return FILE_CATEGORY_DOCUMENTS;
  }

  if (ext) {
    const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
    const imgExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const vidExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const audExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
    const sheetExts = ['xls', 'xlsx', 'csv'];
    const presExts = ['ppt', 'pptx'];

    if (docExts.includes(ext)) return FILE_CATEGORY_DOCUMENTS;
    if (imgExts.includes(ext)) return FILE_CATEGORY_IMAGES;
    if (vidExts.includes(ext)) return FILE_CATEGORY_VIDEOS;
    if (audExts.includes(ext)) return FILE_CATEGORY_AUDIO;
    if (sheetExts.includes(ext)) return FILE_CATEGORY_SPREADSHEETS;
    if (presExts.includes(ext)) return FILE_CATEGORY_PRESENTATIONS;
  }

  return FILE_CATEGORY_OTHER;
}

/** Get tab icon for a file type category */
function getCategoryIcon(category: string, size: 'sm' | 'lg' = 'sm'): React.ReactNode {
  const sz = size === 'lg' ? 'h-7 w-7' : 'h-4 w-4';
  switch (category) {
    case FILE_CATEGORY_ALL:
      return <FolderOpen className={`${sz} text-emerald-600`} />;
    case FILE_CATEGORY_DOCUMENTS:
      return <FileText className={`${sz} text-rose-500`} />;
    case FILE_CATEGORY_IMAGES:
      return <ImageIcon className={`${sz} text-purple-500`} />;
    case FILE_CATEGORY_VIDEOS:
      return <Video className={`${sz} text-sky-500`} />;
    case FILE_CATEGORY_AUDIO:
      return <Headphones className={`${sz} text-orange-500`} />;
    case FILE_CATEGORY_SPREADSHEETS:
      return <FileSpreadsheet className={`${sz} text-emerald-500`} />;
    case FILE_CATEGORY_PRESENTATIONS:
      return <Presentation className={`${sz} text-amber-600`} />;
    case FILE_CATEGORY_OTHER:
    default:
      return <File className={`${sz} text-muted-foreground`} />;
  }
}

/** Legacy category mapping for DB-stored categories */
function mapLegacyCategory(cat?: string | null): string {
  if (!cat) return FILE_CATEGORY_OTHER;
  if (cat === 'PDF') return FILE_CATEGORY_DOCUMENTS;
  if (cat === 'عام' || cat === 'محاضرات' || cat === 'ملخصات' || cat === 'تمارين' || cat === 'اختبارات' || cat === 'مشاريع' || cat === 'مراجع' || cat === 'ملاحظات')
    return FILE_CATEGORY_DOCUMENTS;
  if (cat === FILE_CATEGORY_DOCUMENTS || cat === FILE_CATEGORY_IMAGES || cat === FILE_CATEGORY_VIDEOS ||
      cat === FILE_CATEGORY_AUDIO || cat === FILE_CATEGORY_SPREADSHEETS || cat === FILE_CATEGORY_PRESENTATIONS ||
      cat === FILE_CATEGORY_OTHER)
    return cat;
  return FILE_CATEGORY_OTHER;
}

/** Get the effective category for a file */
function getEffectiveCategory(file: SubjectFile): string {
  if (file.category && file.category !== 'PDF') {
    const mapped = mapLegacyCategory(file.category);
    if (mapped !== FILE_CATEGORY_OTHER) return mapped;
  }
  return getFileTypeCategory(file.file_type, file.file_name);
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Get a colored icon for a file type */
function getFileIcon(type?: string | null, size: 'sm' | 'lg' = 'sm'): React.ReactNode {
  const sz = size === 'lg' ? 'h-7 w-7' : 'h-5 w-5';
  if (!type) return <File className={`${sz} text-muted-foreground`} />;
  const t = type.toLowerCase();
  if (t.includes('pdf')) return <FileText className={`${sz} text-rose-500`} />;
  if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg'))
    return <ImageIcon className={`${sz} text-purple-500`} />;
  if (t.includes('video') || t.includes('mp4') || t.includes('webm') || t.includes('mov'))
    return <FileVideo className={`${sz} text-sky-500`} />;
  if (t.includes('audio') || t.includes('mp3') || t.includes('wav') || t.includes('ogg'))
    return <Music className={`${sz} text-orange-500`} />;
  if (t.includes('sheet') || t.includes('excel') || t.includes('csv'))
    return <FileSpreadsheet className={`${sz} text-emerald-500`} />;
  if (t.includes('presentation') || t.includes('powerpoint') || t.includes('ppt'))
    return <MonitorPlay className={`${sz} text-amber-600`} />;
  if (t.includes('word') || t.includes('doc'))
    return <FilePlus className={`${sz} text-blue-500`} />;
  return <File className={`${sz} text-muted-foreground`} />;
}

/** Get icon background class based on file type */
function getFileIconBg(type?: string | null): string {
  if (!type) return 'bg-slate-50 border-slate-200';
  const t = type.toLowerCase();
  if (t.includes('pdf')) return 'bg-rose-50 border-rose-200';
  if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg'))
    return 'bg-purple-50 border-purple-200';
  if (t.includes('video') || t.includes('mp4') || t.includes('webm') || t.includes('mov'))
    return 'bg-sky-50 border-sky-200';
  if (t.includes('audio') || t.includes('mp3') || t.includes('wav') || t.includes('ogg'))
    return 'bg-orange-50 border-orange-200';
  if (t.includes('sheet') || t.includes('excel') || t.includes('csv'))
    return 'bg-emerald-50 border-emerald-200';
  if (t.includes('presentation') || t.includes('powerpoint') || t.includes('ppt'))
    return 'bg-amber-50 border-amber-200';
  if (t.includes('word') || t.includes('doc'))
    return 'bg-blue-50 border-blue-200';
  return 'bg-slate-50 border-slate-200';
}

function isImageType(type?: string | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('gif') || t.includes('webp');
}

function isPdfType(type?: string | null): boolean {
  if (!type) return false;
  return type.toLowerCase().includes('pdf');
}

// =====================================================
// Main Component
// =====================================================
export default function CourseFilesSection({
  subjectId,
  profile,
  isTeacher,
  subject,
}: CourseFilesSectionProps) {
  // ─── Data state ───
  const [files, setFiles] = useState<SubjectFile[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Preview dialog ───
  const [previewFile, setPreviewFile] = useState<SubjectFile | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // ─── Share dialog ───
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [sharingFile, setSharingFile] = useState<SubjectFile | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [sharingInProgress, setSharingInProgress] = useState(false);
  const [lookupResult, setLookupResult] = useState<{ id: string; name: string; email: string; role: string } | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Delete state ───
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  // ─── Visibility toggle state ───
  const [togglingVisibilityId, setTogglingVisibilityId] = useState<string | null>(null);

  // ─── Active category tab ───
  const [activeCategory, setActiveCategory] = useState(FILE_CATEGORY_ALL);

  // ─── Search state ───
  const [searchQuery, setSearchQuery] = useState('');

  // =====================================================
  // Data fetching
  // =====================================================
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      if (isTeacher) {
        const { data, error } = await supabase
          .from('subject_files')
          .select('*')
          .eq('subject_id', subjectId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching files:', error);
          toast.error('فشل في تحميل الملفات');
        } else {
          setFiles((data as SubjectFile[]) || []);
        }
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setFiles([]);
          setLoading(false);
          return;
        }
        const response = await fetch(`/api/subjects/${subjectId}/files`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const result = await response.json();
        if (result.success && result.data) {
          setFiles(result.data as SubjectFile[]);
        } else {
          const { data, error } = await supabase
            .from('subject_files')
            .select('*')
            .eq('subject_id', subjectId)
            .or(`visibility.eq.public,visibility.is.null,uploaded_by.eq.${profile.id}`)
            .order('created_at', { ascending: false });
          if (!error) {
            setFiles((data as SubjectFile[]) || []);
          }
        }
      }
    } catch {
      toast.error('حدث خطأ أثناء تحميل الملفات');
    } finally {
      setLoading(false);
    }
  }, [subjectId, isTeacher, profile.id]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // ─── Realtime subscription ───
  useEffect(() => {
    const channel = supabase
      .channel(`course-files-${subjectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subject_files', filter: `subject_id=eq.${subjectId}` },
        () => fetchFiles()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [subjectId, fetchFiles]);

  // =====================================================
  // Computed: Category tabs and counts
  // =====================================================
  const categoryFileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    counts[FILE_CATEGORY_ALL] = files.length;

    const allCategories = [
      FILE_CATEGORY_DOCUMENTS,
      FILE_CATEGORY_IMAGES,
      FILE_CATEGORY_VIDEOS,
      FILE_CATEGORY_AUDIO,
      FILE_CATEGORY_SPREADSHEETS,
      FILE_CATEGORY_PRESENTATIONS,
      FILE_CATEGORY_OTHER,
    ];

    allCategories.forEach((cat) => { counts[cat] = 0; });

    files.forEach((f) => {
      const cat = getEffectiveCategory(f);
      counts[cat] = (counts[cat] || 0) + 1;
    });

    return counts;
  }, [files]);

  const visibleTabs = useMemo(() => {
    const tabs = [FILE_CATEGORY_ALL];
    const allCategories = [
      FILE_CATEGORY_DOCUMENTS,
      FILE_CATEGORY_IMAGES,
      FILE_CATEGORY_VIDEOS,
      FILE_CATEGORY_AUDIO,
      FILE_CATEGORY_SPREADSHEETS,
      FILE_CATEGORY_PRESENTATIONS,
      FILE_CATEGORY_OTHER,
    ];
    allCategories.forEach((cat) => {
      if ((categoryFileCounts[cat] || 0) > 0) {
        tabs.push(cat);
      }
    });
    return tabs;
  }, [categoryFileCounts]);

  const filteredFiles = useMemo(() => {
    let result = files;

    if (activeCategory !== FILE_CATEGORY_ALL) {
      result = result.filter((f) => getEffectiveCategory(f) === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((f) =>
        f.file_name.toLowerCase().includes(q) ||
        (f.description && f.description.toLowerCase().includes(q))
      );
    }

    return result;
  }, [files, activeCategory, searchQuery]);

  // =====================================================
  // Delete handler
  // =====================================================
  const handleFileDelete = useCallback(async (fileId: string) => {
    setDeletingFileId(fileId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      const response = await fetch(`/api/subjects/${subjectId}/files?fileId=${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
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
  }, [subjectId, fetchFiles]);

  // =====================================================
  // Visibility toggle
  // =====================================================
  const handleToggleVisibility = useCallback(async (file: SubjectFile) => {
    const newVisibility = file.visibility === 'public' ? 'private' : 'public';
    setTogglingVisibilityId(file.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }
      const response = await fetch(`/api/subjects/${subjectId}/files/visibility`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId: file.id, visibility: newVisibility }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        toast.error(result.error || 'حدث خطأ أثناء تغيير رؤية الملف');
      } else {
        toast.success(newVisibility === 'public' ? 'تم جعل الملف عاماً' : 'تم جعل الملف خاصاً');
        fetchFiles();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setTogglingVisibilityId(null);
    }
  }, [subjectId, fetchFiles]);

  // =====================================================
  // Share handler
  // =====================================================
  const handleShareFile = useCallback(async () => {
    if (!sharingFile || !shareEmail.trim()) return;
    setSharingInProgress(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }
      const response = await fetch(`/api/subjects/${subjectId}/files/share`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId: sharingFile.id, email: shareEmail.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        toast.error(result.error || 'حدث خطأ أثناء مشاركة الملف');
      } else {
        toast.success(`تمت مشاركة الملف مع ${result.sharedWith || shareEmail}`);
        setShareEmail('');
        setLookupResult(null);
        setShareDialogOpen(false);
        setSharingFile(null);
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setSharingInProgress(false);
    }
  }, [sharingFile, shareEmail, subjectId]);

  // ─── Email lookup with debounce ───
  const handleShareEmailChange = useCallback((email: string) => {
    setShareEmail(email);
    setLookupResult(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!email.trim() || !email.includes('@')) return;

    debounceRef.current = setTimeout(async () => {
      setLookupLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLookupLoading(false); return; }

        const response = await fetch(`/api/users/lookup?email=${encodeURIComponent(email.trim())}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const result = await response.json();
        if (result.success && result.data) {
          setLookupResult(result.data);
        } else {
          setLookupResult(null);
        }
      } catch {
        setLookupResult(null);
      } finally {
        setLookupLoading(false);
      }
    }, 500);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // =====================================================
  // Download handler
  // =====================================================
  const handleFileDownload = useCallback((file: SubjectFile) => {
    window.open(file.file_url, '_blank');
  }, []);

  // =====================================================
  // Render: Loading skeletons
  // =====================================================
  const renderLoading = () => (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full shrink-0" />
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="rounded-xl">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  // =====================================================
  // Render: Empty state
  // =====================================================
  const renderEmpty = (icon: React.ReactNode, title: string, subtitle: string) => (
    <motion.div
      variants={itemVariants}
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-emerald-50/30 py-16"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
        {icon}
      </div>
      <p className="text-lg font-semibold text-foreground mb-1">{title}</p>
      <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>
    </motion.div>
  );

  // =====================================================
  // Render: File card (Compact horizontal list-style)
  // =====================================================
  const renderFileCard = (file: SubjectFile) => {
    const isDeleting = deletingFileId === file.id;
    const isToggling = togglingVisibilityId === file.id;

    return (
      <motion.div variants={itemVariants} layout>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition-all duration-200 group border border-border/60">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              {/* File type icon */}
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${getFileIconBg(file.file_type)}`}>
                {getFileIcon(file.file_type)}
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground line-clamp-2" title={file.file_name}>
                    {file.file_name}
                  </p>
                  {/* Visibility badge */}
                  {file.visibility === 'private' ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-amber-100 text-amber-700 shrink-0 border-0">
                      <Lock className="h-2.5 w-2.5 ml-0.5" />
                      خاص
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-emerald-100 text-emerald-700 shrink-0 border-0">
                      <Globe className="h-2.5 w-2.5 ml-0.5" />
                      عام
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                  <span>{formatFileSize(file.file_size)}</span>
                  <span className="text-muted-foreground/40">•</span>
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {formatDate(file.created_at)}
                  </span>
                </div>
              </div>

              {/* Actions dropdown menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => { setPreviewFile(file); setPreviewOpen(true); }}>
                    <Eye className="h-4 w-4 ml-2 text-emerald-600" />
                    معاينة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleFileDownload(file)}>
                    <Download className="h-4 w-4 ml-2 text-teal-600" />
                    تحميل
                  </DropdownMenuItem>
                  {isTeacher && (
                    <DropdownMenuItem onClick={() => { setSharingFile(file); setShareEmail(''); setLookupResult(null); setShareDialogOpen(true); }}>
                      <Share2 className="h-4 w-4 ml-2 text-blue-600" />
                      مشاركة
                    </DropdownMenuItem>
                  )}
                  {isTeacher && file.uploaded_by === subject.teacher_id && (
                    <DropdownMenuItem onClick={() => handleToggleVisibility(file)} disabled={isToggling}>
                      {isToggling ? (
                        <Loader2 className="h-4 w-4 ml-2 animate-spin text-emerald-600" />
                      ) : file.visibility === 'public' ? (
                        <Lock className="h-4 w-4 ml-2 text-amber-500" />
                      ) : (
                        <Globe className="h-4 w-4 ml-2 text-emerald-500" />
                      )}
                      {isToggling ? 'جاري التغيير...' : file.visibility === 'public' ? 'جعل خاصاً' : 'جعل عاماً'}
                    </DropdownMenuItem>
                  )}
                  {(isTeacher || file.uploaded_by === profile.id) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleFileDelete(file.id)} disabled={isDeleting} className="text-rose-500 focus:text-rose-500">
                        {isDeleting ? (
                          <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 ml-2" />
                        )}
                        {isDeleting ? 'جاري الحذف...' : 'حذف'}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  // =====================================================
  // Main render
  // =====================================================
  if (loading) return renderLoading();

  return (
    <div className="space-y-4" dir="rtl">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
        {/* ─── Header ─── */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-foreground">ملفات المقرر</h3>
            <p className="text-muted-foreground text-sm mt-0.5">
              {files.length} ملف
            </p>
          </div>
        </motion.div>

        {/* ─── Search ─── */}
        {files.length > 0 && (
          <motion.div variants={itemVariants}>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث في الملفات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9 h-9 text-sm"
              />
            </div>
          </motion.div>
        )}

        {/* ─── Category tabs (pill buttons) ─── */}
        {files.length > 0 && (
          <motion.div variants={itemVariants}>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {visibleTabs.map((cat) => {
                const isActive = activeCategory === cat;
                const count = categoryFileCounts[cat] || 0;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50'
                    }`}
                  >
                    {getCategoryIcon(cat, 'sm')}
                    <span>{cat}</span>
                    {count > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        isActive ? 'bg-emerald-500 text-emerald-100' : 'bg-muted-foreground/10 text-muted-foreground'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ─── File list ─── */}
        {files.length > 0 && (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-2">
            {filteredFiles.length === 0 ? (
              renderEmpty(
                <FolderOpen className="h-8 w-8 text-emerald-600" />,
                'لا توجد ملفات',
                searchQuery ? 'لا توجد ملفات تطابق البحث' : 'لم يتم رفع أي ملفات في هذا التصنيف بعد'
              )
            ) : (
              filteredFiles.map(renderFileCard)
            )}
          </motion.div>
        )}

        {/* ─── Empty state when no files at all ─── */}
        {files.length === 0 && (
          renderEmpty(
            <FolderOpen className="h-8 w-8 text-emerald-600" />,
            'لا توجد ملفات',
            'لم يتم رفع أي ملفات بعد'
          )
        )}
      </motion.div>

      {/* =====================================================
          Preview Dialog
          ===================================================== */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              {previewFile && getFileIcon(previewFile.file_type)}
              <span className="line-clamp-2">{previewFile?.file_name}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              معاينة الملف
            </DialogDescription>
          </DialogHeader>

          {previewFile && (
            <>
              <div className="overflow-auto max-h-[55vh] rounded-lg border bg-muted/30">
                {isImageType(previewFile.file_type) && previewFile.file_url ? (
                  <div className="flex items-center justify-center p-4">
                    <img src={previewFile.file_url} alt={previewFile.file_name} className="max-w-full max-h-[50vh] object-contain rounded" />
                  </div>
                ) : isPdfType(previewFile.file_type) && previewFile.file_url ? (
                  <iframe src={previewFile.file_url} className="w-full h-[50vh] rounded" title={previewFile.file_name} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100">
                      {getFileIcon(previewFile.file_type, 'lg')}
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-sm font-medium text-foreground">{previewFile.file_name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(previewFile.file_size)}</p>
                    </div>
                    <Button onClick={() => handleFileDownload(previewFile)} className="bg-emerald-600 hover:bg-emerald-700" size="sm">
                      <Download className="h-4 w-4 ml-1.5" />
                      تحميل الملف
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-1">
                <span>الحجم: {formatFileSize(previewFile.file_size)}</span>
                {previewFile.visibility && (
                  <span className="flex items-center gap-1">
                    {previewFile.visibility === 'private' ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                    {previewFile.visibility === 'private' ? 'خاص' : 'عام'}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(previewFile.created_at)}
                </span>
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)} size="sm">إغلاق</Button>
            {previewFile && (
              <Button onClick={() => handleFileDownload(previewFile)} className="bg-emerald-600 hover:bg-emerald-700" size="sm">
                <Download className="h-4 w-4 ml-1.5" />
                تحميل
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =====================================================
          Share Dialog
          ===================================================== */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-emerald-600" />
              مشاركة الملف
            </DialogTitle>
            <DialogDescription className="sr-only">مشاركة الملف مع مستخدم آخر</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {sharingFile && (
              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                {getFileIcon(sharingFile.file_type)}
                <span className="text-sm line-clamp-2">{sharingFile.file_name}</span>
              </div>
            )}

            <div className="space-y-2">
              <Input
                placeholder="البريد الإلكتروني للمستخدم"
                value={shareEmail}
                onChange={(e) => handleShareEmailChange(e.target.value)}
                dir="ltr"
                className="text-left"
              />

              {lookupLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري البحث...
                </div>
              )}

              {lookupResult && (
                <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                    <span className="text-xs font-bold text-emerald-700">{lookupResult.name?.[0] || '?'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{lookupResult.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{lookupResult.email}</p>
                  </div>
                  <Check className="h-4 w-4 text-emerald-600" />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)} size="sm">إلغاء</Button>
            <Button
              onClick={handleShareFile}
              disabled={!shareEmail.trim() || sharingInProgress}
              className="bg-emerald-600 hover:bg-emerald-700"
              size="sm"
            >
              {sharingInProgress ? (
                <>
                  <Loader2 className="h-4 w-4 ml-1.5 animate-spin" />
                  جاري المشاركة...
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4 ml-1.5" />
                  مشاركة
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
