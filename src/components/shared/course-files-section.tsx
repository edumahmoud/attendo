'use client';

// =====================================================
// CourseFilesSection — ملفات المقرر
// Handles upload, categorization, preview, share, etc.
// Supports MULTI-FILE UPLOAD with CUSTOM NAMING per file.
// Files classified by type with auto-generated tabs.
// =====================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
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
  X,
  Check,
  Search,
  Music,
  Video,
  Presentation,
  Clock,
  Headphones,
  MonitorPlay,
  FileVideo,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
// Upload item interface (multi-file)
// =====================================================
interface UploadItem {
  id: string;
  file: File;
  customName: string;
  category: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  errorMsg?: string;
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

/** Auto-detect category from file extension */
function autoCategoryFromExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return FILE_CATEGORY_DOCUMENTS;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return FILE_CATEGORY_IMAGES;
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return FILE_CATEGORY_VIDEOS;
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return FILE_CATEGORY_AUDIO;
  if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return FILE_CATEGORY_DOCUMENTS;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FILE_CATEGORY_SPREADSHEETS;
  if (['ppt', 'pptx'].includes(ext)) return FILE_CATEGORY_PRESENTATIONS;
  return FILE_CATEGORY_OTHER;
}

/** Extract extension from original file name */
function extractExtension(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length > 1) return parts.pop()!.toLowerCase();
  return '';
}

/** Get file name without extension */
function nameWithoutExtension(fileName: string): string {
  const ext = extractExtension(fileName);
  if (!ext) return fileName;
  return fileName.slice(0, -(ext.length + 1));
}

/** Build display name: customName + original extension */
function buildDisplayName(customName: string, originalFileName: string): string {
  const ext = extractExtension(originalFileName);
  if (!ext) return customName;
  if (customName.endsWith('.' + ext)) return customName;
  return customName + '.' + ext;
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

  // ─── Upload state (multi-file) ───
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadVisibility, setUploadVisibility] = useState<'public' | 'private'>('public');
  const [uploading, setUploading] = useState(false);
  const [uploadOverallProgress, setUploadOverallProgress] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  // ─── Counter for generating unique IDs ───
  const itemIdCounter = useRef(0);

  // =====================================================
  // Upload item helpers
  // =====================================================
  const updateUploadItem = useCallback((id: string, updates: Partial<UploadItem>) => {
    setUploadItems((prev) => prev.map((item) => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const removeUploadItem = useCallback((id: string) => {
    setUploadItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

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
  // Multi-file upload handler (sequential, XHR progress)
  // =====================================================
  const handleMultiUpload = useCallback(async () => {
    const pendingItems = uploadItems.filter((item) => item.status === 'pending');
    if (pendingItems.length === 0) return;

    for (const item of pendingItems) {
      if (item.file.size > 10 * 1024 * 1024) {
        toast.error(`حجم الملف "${item.file.name}" يتجاوز 10 ميجابايت`);
        updateUploadItem(item.id, { status: 'error', errorMsg: 'حجم الملف يتجاوز 10 ميجابايت' });
        return;
      }
    }

    setUploading(true);
    setTotalCount(pendingItems.length);
    setCompletedCount(0);
    setUploadOverallProgress(0);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      const uploadUrl = isTeacher
        ? `/api/subjects/${subjectId}/files`
        : `/api/subjects/${subjectId}/files/upload`;

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < pendingItems.length; i++) {
        const item = pendingItems[i];
        const displayName = buildDisplayName(item.customName, item.file.name);

        updateUploadItem(item.id, { status: 'uploading', progress: 0 });

        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('name', displayName);
        formData.append('category', item.category);
        formData.append('description', uploadDescription);
        formData.append('visibility', uploadVisibility);

        try {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                updateUploadItem(item.id, { progress: pct });
                const overallPct = Math.round(((i + pct / 100) / pendingItems.length) * 100);
                setUploadOverallProgress(overallPct);
              }
            });

            xhr.addEventListener('load', () => {
              try {
                const result = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300 && result.success) {
                  updateUploadItem(item.id, { status: 'done', progress: 100 });
                  successCount++;
                  setCompletedCount(successCount);
                  toast.success(`تم رفع "${displayName}" بنجاح`);
                  fetchFiles();
                  resolve();
                } else {
                  const errMsg = result.error || `حدث خطأ أثناء رفع الملف (${xhr.status})`;
                  updateUploadItem(item.id, { status: 'error', errorMsg: errMsg });
                  errorCount++;
                  toast.error(errMsg);
                  reject(new Error(errMsg));
                }
              } catch {
                updateUploadItem(item.id, { status: 'error', errorMsg: 'حدث خطأ غير متوقع' });
                errorCount++;
                reject(new Error('Parse error'));
              }
            });

            xhr.addEventListener('error', () => {
              updateUploadItem(item.id, { status: 'error', errorMsg: 'خطأ في الاتصال' });
              errorCount++;
              reject(new Error('Network error'));
            });

            xhr.addEventListener('abort', () => {
              updateUploadItem(item.id, { status: 'error', errorMsg: 'تم الإلغاء' });
              errorCount++;
              reject(new Error('Aborted'));
            });

            xhr.open('POST', uploadUrl);
            xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
            xhr.send(formData);
          });
        } catch {
          // Error already handled
        }
      }

      if (successCount > 0 && errorCount === 0) {
        toast.success(`تم رفع جميع الملفات بنجاح (${successCount} ملف)`);
      } else if (successCount > 0 && errorCount > 0) {
        toast.warning(`تم رفع ${successCount} ملف بنجاح، وفشل رفع ${errorCount} ملف`);
      } else if (errorCount > 0) {
        toast.error(`فشل رفع جميع الملفات (${errorCount} ملف)`);
      }
    } catch {
      // Auth error already handled
    } finally {
      setUploading(false);
      setUploadOverallProgress(0);
      setCompletedCount(0);
      setTotalCount(0);
      const allDone = uploadItems.every((item) => item.status === 'done' || item.status === 'error');
      if (allDone) {
        setTimeout(() => {
          setUploadItems([]);
          setUploadDescription('');
          setUploadVisibility('public');
          setUploadDialogOpen(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }, 1500);
      }
    }
  }, [uploadItems, uploadDescription, uploadVisibility, isTeacher, subjectId, fetchFiles, updateUploadItem]);

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
        <Skeleton className="h-10 w-28" />
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
                  <p className="text-sm font-medium text-foreground truncate" title={file.file_name}>
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

              {/* Desktop actions */}
              <div className="hidden sm:flex items-center gap-0.5 shrink-0">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => { setPreviewFile(file); setPreviewOpen(true); }} title="معاينة">
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-teal-600 hover:text-teal-700 hover:bg-teal-50" onClick={() => handleFileDownload(file)} title="تحميل">
                  <Download className="h-4 w-4" />
                </Button>
                {isTeacher && (
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => { setSharingFile(file); setShareEmail(''); setLookupResult(null); setShareDialogOpen(true); }} title="مشاركة">
                    <Share2 className="h-4 w-4" />
                  </Button>
                )}
                {isTeacher && file.uploaded_by === subject.teacher_id && (
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-emerald-50" onClick={() => handleToggleVisibility(file)} disabled={isToggling} title={file.visibility === 'public' ? 'جعل خاصاً' : 'جعل عاماً'}>
                    {isToggling ? (
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    ) : file.visibility === 'public' ? (
                      <Lock className="h-4 w-4 text-amber-500" />
                    ) : (
                      <Globe className="h-4 w-4 text-emerald-500" />
                    )}
                  </Button>
                )}
                {(isTeacher || file.uploaded_by === profile.id) && (
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleFileDelete(file.id)} disabled={isDeleting} title="حذف">
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Mobile actions row */}
            <div className="flex sm:hidden items-center gap-1 mt-2 pt-2 border-t border-border/40 flex-wrap">
              <Button variant="ghost" size="sm" className="gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 text-xs h-7 px-2" onClick={() => { setPreviewFile(file); setPreviewOpen(true); }}>
                <Eye className="h-3.5 w-3.5" />
                معاينة
              </Button>
              <Button variant="ghost" size="sm" className="gap-1 text-teal-600 hover:text-teal-700 hover:bg-teal-50 text-xs h-7 px-2" onClick={() => handleFileDownload(file)}>
                <Download className="h-3.5 w-3.5" />
                تحميل
              </Button>
              {isTeacher && (
                <Button variant="ghost" size="sm" className="gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs h-7 px-2" onClick={() => { setSharingFile(file); setShareEmail(''); setLookupResult(null); setShareDialogOpen(true); }}>
                  <Share2 className="h-3.5 w-3.5" />
                  مشاركة
                </Button>
              )}
              {isTeacher && file.uploaded_by === subject.teacher_id && (
                <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2 hover:bg-emerald-50" onClick={() => handleToggleVisibility(file)} disabled={isToggling}>
                  {isToggling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : file.visibility === 'public' ? (
                    <>
                      <Lock className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-amber-600">خاص</span>
                    </>
                  ) : (
                    <>
                      <Globe className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-emerald-600">عام</span>
                    </>
                  )}
                </Button>
              )}
              {(isTeacher || file.uploaded_by === profile.id) && (
                <Button variant="ghost" size="sm" className="gap-1 text-rose-500 hover:text-rose-600 hover:bg-rose-50 text-xs h-7 px-2 mr-auto" onClick={() => handleFileDelete(file.id)} disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  حذف
                </Button>
              )}
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
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => {
                const fileList = e.target.files;
                if (!fileList || fileList.length === 0) return;

                const newItems: UploadItem[] = [];
                for (let i = 0; i < fileList.length; i++) {
                  const f = fileList[i];
                  itemIdCounter.current += 1;
                  newItems.push({
                    id: `upload-${itemIdCounter.current}`,
                    file: f,
                    customName: nameWithoutExtension(f.name),
                    category: autoCategoryFromExtension(f.name),
                    status: 'pending',
                    progress: 0,
                  });
                }
                setUploadItems((prev) => [...prev, ...newItems]);
                setUploadDialogOpen(true);
              }}
              className="hidden"
              disabled={uploading}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              size="sm"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading
                ? totalCount > 1
                  ? `جاري الرفع... ${completedCount}/${totalCount}`
                  : 'جاري الرفع...'
                : 'رفع ملفات'}
            </Button>
          </div>
        </motion.div>

        {/* ─── Upload progress ─── */}
        <AnimatePresence>
          {uploading && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card className="shadow-sm border-emerald-200 bg-emerald-50/30">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-700">
                      جاري رفع الملفات... ({completedCount}/{totalCount})
                    </span>
                    <span className="text-sm font-bold text-emerald-700 mr-auto">{uploadOverallProgress}%</span>
                  </div>
                  <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-emerald-200">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadOverallProgress}%` }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

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
            'لم يتم رفع أي ملفات بعد',
            isTeacher ? (
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 mt-2"
                size="sm"
              >
                <Upload className="h-4 w-4" />
                رفع أول ملف
              </Button>
            ) : undefined
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
              <span className="truncate">{previewFile?.file_name}</span>
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
                <span className="text-sm truncate">{sharingFile.file_name}</span>
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
                    <p className="text-sm font-medium truncate">{lookupResult.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{lookupResult.email}</p>
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

      {/* =====================================================
          Multi-File Upload Dialog
          ===================================================== */}
      <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
        if (!uploading) {
          setUploadDialogOpen(open);
          if (!open) {
            setUploadItems([]);
            setUploadDescription('');
            setUploadVisibility('public');
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        }
      }}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-emerald-600" />
              رفع ملفات ({uploadItems.length})
            </DialogTitle>
            <DialogDescription className="sr-only">رفع ملفات جديدة للمقرر</DialogDescription>
          </DialogHeader>

          {uploadItems.length > 0 && (
            <div className="space-y-4">
              {/* ─── Scrollable file list ─── */}
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {uploadItems.map((item) => {
                  const ext = extractExtension(item.file.name);

                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col gap-2 p-3 rounded-lg border transition-colors ${
                        item.status === 'done'
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : item.status === 'error'
                          ? 'bg-rose-50/50 border-rose-200'
                          : item.status === 'uploading'
                          ? 'bg-amber-50/50 border-amber-200'
                          : 'bg-muted/30 border-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100">
                          {item.status === 'done' ? (
                            <Check className="h-4 w-4 text-emerald-600" />
                          ) : item.status === 'uploading' ? (
                            <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
                          ) : item.status === 'error' ? (
                            <X className="h-4 w-4 text-rose-500" />
                          ) : (
                            getFileIcon(item.file.type)
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate text-muted-foreground" title={item.file.name}>
                            {item.file.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{formatFileSize(item.file.size)}</p>
                        </div>
                        {!uploading && item.status === 'pending' && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => removeUploadItem(item.id)}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>

                      {/* Custom name input */}
                      {item.status === 'pending' && (
                        <Input
                          value={item.customName}
                          onChange={(e) => updateUploadItem(item.id, { customName: e.target.value })}
                          placeholder="اسم الملف"
                          className="text-xs h-7"
                          dir="rtl"
                        />
                      )}

                      {item.status === 'uploading' && (
                        <Progress value={item.progress} className="h-1.5" />
                      )}

                      {item.status === 'error' && item.errorMsg && (
                        <p className="text-[10px] text-rose-500">{item.errorMsg}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Description */}
              <Textarea
                placeholder="وصف الملفات (اختياري)"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                className="text-sm"
                rows={2}
              />

              {/* Visibility */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setUploadVisibility('public')}
                  disabled={uploading}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 p-2.5 text-sm font-medium transition-all ${
                    uploadVisibility === 'public'
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : 'border-muted bg-background text-muted-foreground hover:border-muted-foreground/30'
                  }`}
                >
                  <Globe className="h-4 w-4" />
                  عام
                </button>
                <button
                  type="button"
                  onClick={() => setUploadVisibility('private')}
                  disabled={uploading}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 p-2.5 text-sm font-medium transition-all ${
                    uploadVisibility === 'private'
                      ? 'border-amber-400 bg-amber-50 text-amber-700'
                      : 'border-muted bg-background text-muted-foreground hover:border-muted-foreground/30'
                  }`}
                >
                  <Lock className="h-4 w-4" />
                  خاص
                </button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadDialogOpen(false); setUploadItems([]); setUploadDescription(''); setUploadVisibility('public'); }} size="sm" disabled={uploading}>
              إلغاء
            </Button>
            <Button onClick={handleMultiUpload} disabled={uploading || uploadItems.filter((i) => i.status === 'pending').length === 0} className="bg-emerald-600 hover:bg-emerald-700" size="sm">
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 ml-1.5 animate-spin" />
                  جاري الرفع...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 ml-1.5" />
                  رفع ({uploadItems.filter((i) => i.status === 'pending').length})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
