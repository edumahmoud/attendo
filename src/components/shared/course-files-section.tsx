'use client';

// =====================================================
// CourseFilesSection — ملفات المقرر
// Replaces the files tab in the subject detail view.
// Handles upload, categorization, preview, share, etc.
// Supports MULTI-FILE UPLOAD with CUSTOM NAMING per file.
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
  id: string;            // unique key for React
  file: File;            // the actual File object
  customName: string;    // display name WITHOUT extension
  category: string;      // per-file category
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;      // 0–100
  errorMsg?: string;
}

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
  if (t.includes('image') || t.includes('png') || t.includes('jpg'))
    return <ImageIcon className="h-5 w-5 text-purple-500" />;
  if (t.includes('sheet') || t.includes('excel') || t.includes('csv'))
    return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
  if (t.includes('word') || t.includes('doc'))
    return <FilePlus className="h-5 w-5 text-blue-500" />;
  if (t.includes('video')) return <Video className="h-5 w-5 text-sky-500" />;
  if (t.includes('audio') || t.includes('sound') || t.includes('music'))
    return <Music className="h-5 w-5 text-orange-500" />;
  if (t.includes('presentation') || t.includes('powerpoint'))
    return <Presentation className="h-5 w-5 text-amber-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

/** Auto-detect category from file extension */
function autoCategoryFromExtension(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return 'PDF';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'صور';
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'فيديو';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'صوتيات';
  if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return 'مستندات';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'جداول';
  if (['ppt', 'pptx'].includes(ext)) return 'عروض';
  return 'عام';
}

/** Auto-detect category from file type (stored in DB) */
function autoCategoryFromFileType(fileType?: string | null): string {
  if (!fileType) return 'أخرى';
  const t = fileType.toLowerCase();
  if (t === 'pdf') return 'PDF';
  if (t === 'image') return 'صور';
  if (t === 'video') return 'فيديو';
  if (t === 'audio') return 'صوتيات';
  if (t === 'document') return 'مستندات';
  if (t === 'spreadsheet') return 'جداول';
  if (t === 'presentation') return 'عروض';
  return 'أخرى';
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
  return fileName.slice(0, -(ext.length + 1)); // +1 for the dot
}

/** Build display name: customName + original extension */
function buildDisplayName(customName: string, originalFileName: string): string {
  const ext = extractExtension(originalFileName);
  if (!ext) return customName;
  if (customName.endsWith('.' + ext)) return customName;
  return customName + '.' + ext;
}

/** Category suggestions for the upload dialog */
const CATEGORY_SUGGESTIONS = [
  'عام',
  'محاضرات',
  'ملخصات',
  'تمارين',
  'اختبارات',
  'مشاريع',
  'مراجع',
  'ملاحظات',
];

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
  const [uploadOverallProgress, setUploadOverallProgress] = useState(0); // overall %
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
  const [activeCategory, setActiveCategory] = useState('الكل');

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
          // Fallback to direct query
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
  // Computed: Category tabs
  // =====================================================
  const categoryTabs = useMemo(() => {
    const cats = new Set<string>();
    files.forEach((f) => {
      const cat = f.category || autoCategoryFromFileType(f.file_type);
      cats.add(cat);
    });
    return ['الكل', ...Array.from(cats).sort()];
  }, [files]);

  const filteredFiles = useMemo(() => {
    if (activeCategory === 'الكل') return files;
    return files.filter((f) => {
      const cat = f.category || autoCategoryFromFileType(f.file_type);
      return cat === activeCategory;
    });
  }, [files, activeCategory]);

  // =====================================================
  // Multi-file upload handler (sequential, XHR progress)
  // =====================================================
  const handleMultiUpload = useCallback(async () => {
    const pendingItems = uploadItems.filter((item) => item.status === 'pending');
    if (pendingItems.length === 0) return;

    // Validate size for each file
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

        // Mark as uploading
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
                // Overall progress: completed files + current file progress
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
                toast.error(`حدث خطأ غير متوقع أثناء رفع "${displayName}"`);
                reject(new Error('Parse error'));
              }
            });

            xhr.addEventListener('error', () => {
              updateUploadItem(item.id, { status: 'error', errorMsg: 'خطأ في الاتصال' });
              errorCount++;
              toast.error(`حدث خطأ في الاتصال أثناء رفع "${displayName}"`);
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
          // Error already handled in XHR callbacks; continue to next file
        }
      }

      // Summary toast
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
      // Keep the dialog open so user can see results, but close after a short delay
      // Only close if ALL items are done
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

  // Cleanup debounce on unmount
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
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
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
  // Render: File card
  // =====================================================
  const renderFileCard = (file: SubjectFile) => {
    const category = file.category || autoCategoryFromFileType(file.file_type);

    return (
      <motion.div key={file.id} variants={itemVariants}>
        <Card className="group shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            {/* File info */}
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 border border-emerald-200 transition-transform group-hover:scale-110">
                {getFileIcon(file.file_type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground text-sm truncate" title={file.file_name}>
                    {file.file_name}
                  </p>
                  {/* Visibility badge */}
                  {file.visibility === 'private' ? (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-300 text-amber-700 bg-amber-50 shrink-0 gap-0.5">
                      <Lock className="h-2.5 w-2.5" />
                      خاص
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-300 text-emerald-700 bg-emerald-50 shrink-0 gap-0.5">
                      <Globe className="h-2.5 w-2.5" />
                      عام
                    </Badge>
                  )}
                </div>
                {/* Category badge + size + date */}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-teal-100 text-teal-700 hover:bg-teal-200">
                    {category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatFileSize(file.file_size)}</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{formatDate(file.created_at)}</span>
                </div>
                {/* Description */}
                {file.description && (
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 break-words" title={file.description}>
                    {file.description}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 mt-3 pt-3 border-t flex-wrap">
              {/* Preview */}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 text-xs h-8 px-2"
                onClick={() => {
                  setPreviewFile(file);
                  setPreviewOpen(true);
                }}
                title="معاينة"
              >
                <Eye className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">معاينة</span>
              </Button>

              {/* Download */}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 text-xs h-8 px-2"
                onClick={() => handleFileDownload(file)}
                title="تحميل"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">تحميل</span>
              </Button>

              {/* Share (teacher only) */}
              {isTeacher && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-teal-600 hover:text-teal-700 hover:bg-teal-50 text-xs h-8 px-2"
                  onClick={() => {
                    setSharingFile(file);
                    setShareEmail('');
                    setLookupResult(null);
                    setShareDialogOpen(true);
                  }}
                  title="مشاركة"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">مشاركة</span>
                </Button>
              )}

              {/* Visibility toggle (teacher on their own files) */}
              {isTeacher && file.uploaded_by === subject.teacher_id && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={`gap-1 text-xs h-8 px-2 ${file.visibility === 'public' ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50' : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'}`}
                  onClick={() => handleToggleVisibility(file)}
                  disabled={togglingVisibilityId === file.id}
                  title={file.visibility === 'public' ? 'جعل الملف خاصاً' : 'جعل الملف عاماً'}
                >
                  {togglingVisibilityId === file.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : file.visibility === 'public' ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <Globe className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{file.visibility === 'public' ? 'خاص' : 'عام'}</span>
                </Button>
              )}

              {/* Delete (teacher or uploader) */}
              {(isTeacher || file.uploaded_by === profile.id) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs h-8 px-2 mr-auto"
                  onClick={() => handleFileDelete(file.id)}
                  disabled={deletingFileId === file.id}
                  title="حذف"
                >
                  {deletingFileId === file.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">حذف</span>
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

  const pendingItems = uploadItems.filter((item) => item.status === 'pending');
  const hasPendingItems = pendingItems.length > 0;

  return (
    <div className="space-y-6" dir="rtl">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        {/* ─── Header with upload button ─── */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-foreground">ملفات المقرر</h3>
            <p className="text-muted-foreground text-sm mt-1">
              جميع الملفات المرفوعة لهذه المادة ({files.length} ملف)
            </p>
          </div>
          <div>
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

        {/* ─── Upload progress bar (multi-file) ─── */}
        <AnimatePresence>
          {uploading && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              variants={itemVariants}
            >
              <Card className="shadow-sm border-emerald-200 bg-emerald-50/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-700">
                      جاري رفع الملفات... ({completedCount}/{totalCount})
                    </span>
                    <span className="text-sm font-bold text-emerald-700 mr-auto">{uploadOverallProgress}%</span>
                  </div>
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-emerald-200">
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

        {/* ─── Category tabs ─── */}
        {files.length > 0 && (
          <motion.div variants={itemVariants}>
            <Tabs value={activeCategory} onValueChange={setActiveCategory} dir="rtl">
              <TabsList className="h-auto flex-wrap gap-1 bg-muted/50 p-1.5">
                {categoryTabs.map((cat) => (
                  <TabsTrigger
                    key={cat}
                    value={cat}
                    className="text-xs data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm rounded-full px-3 py-1"
                  >
                    {cat}
                    {cat !== 'الكل' && (
                      <span className="mr-1 text-[10px] opacity-60">
                        ({files.filter((f) => (f.category || autoCategoryFromFileType(f.file_type)) === cat).length})
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* We use a single TabsContent for simplicity and handle filtering ourselves */}
              {categoryTabs.map((cat) => (
                <TabsContent key={cat} value={cat} className="mt-4">
                  {/* File cards grid */}
                  {filteredFiles.length === 0 ? (
                    renderEmpty(
                      <FolderOpen className="h-8 w-8 text-emerald-600" />,
                      'لا توجد ملفات',
                      'لم يتم رفع أي ملفات في هذا التصنيف بعد'
                    )
                  ) : (
                    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredFiles.map(renderFileCard)}
                    </motion.div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </motion.div>
        )}

        {/* ─── Empty state when no files at all ─── */}
        {files.length === 0 && (
          renderEmpty(
            <FolderOpen className="h-8 w-8 text-emerald-600" />,
            'لا توجد ملفات',
            'لم يتم رفع أي ملفات بعد. اضغط على "رفع ملفات" لإضافة ملفات جديدة',
            isTeacher ? (
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 mt-2"
              >
                <Upload className="h-4 w-4" />
                رفع أول ملف
              </Button>
            ) : undefined
          )
        )}
      </motion.div>

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
          </DialogHeader>

          {uploadItems.length > 0 && (
            <div className="space-y-4">
              {/* ─── Scrollable file list ─── */}
              <div className="max-h-80 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {uploadItems.map((item) => {
                  const ext = extractExtension(item.file.name);
                  const displayName = item.customName + (ext ? '.' + ext : '');

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
                      {/* Row 1: File info + remove */}
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-100">
                          {getFileIcon(item.file.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate text-muted-foreground" title={item.file.name}>
                            {item.file.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{formatFileSize(item.file.size)}</p>
                        </div>
                        {/* Status indicator */}
                        {item.status === 'uploading' && (
                          <Loader2 className="h-4 w-4 animate-spin text-emerald-600 shrink-0" />
                        )}
                        {item.status === 'done' && (
                          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                        )}
                        {item.status === 'error' && (
                          <X className="h-4 w-4 text-rose-500 shrink-0" />
                        )}
                        {/* Remove button */}
                        {!uploading && item.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-rose-600"
                            onClick={() => removeUploadItem(item.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>

                      {/* Row 2: Custom name input */}
                      <div className="flex items-center gap-2">
                        <Input
                          value={item.customName}
                          onChange={(e) => updateUploadItem(item.id, { customName: e.target.value })}
                          placeholder="اسم الملف..."
                          className="text-xs h-8"
                          disabled={uploading || item.status !== 'pending'}
                        />
                        {ext && (
                          <span className="text-xs text-muted-foreground shrink-0 bg-muted/50 px-1.5 py-1 rounded">
                            .{ext}
                          </span>
                        )}
                      </div>

                      {/* Row 3: Category per file */}
                      <div className="flex flex-wrap gap-1">
                        {CATEGORY_SUGGESTIONS.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => updateUploadItem(item.id, { category: s })}
                            disabled={uploading || item.status !== 'pending'}
                            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                              item.category === s
                                ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                : 'bg-muted/50 border-muted text-muted-foreground hover:border-emerald-300 hover:text-emerald-600'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>

                      {/* Per-file progress bar (when uploading) */}
                      {item.status === 'uploading' && (
                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-emerald-200">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400"
                            initial={{ width: 0 }}
                            animate={{ width: `${item.progress}%` }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                          />
                        </div>
                      )}

                      {/* Error message */}
                      {item.status === 'error' && item.errorMsg && (
                        <p className="text-[10px] text-rose-600">{item.errorMsg}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add more files button */}
              {!uploading && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FilePlus className="h-3.5 w-3.5" />
                  إضافة ملفات أخرى
                </Button>
              )}

              {/* Description (shared) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">الوصف (اختياري — لجميع الملفات)</label>
                <Textarea
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="أضف وصفاً مشتركاً للملفات..."
                  rows={2}
                  className="text-sm resize-none"
                  disabled={uploading}
                />
              </div>

              {/* Visibility selector (teacher only, applies to all files) */}
              {isTeacher && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">الرؤية (لجميع الملفات)</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadVisibility('public')}
                      disabled={uploading}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                        uploadVisibility === 'public'
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                          : 'bg-muted/50 border-muted text-muted-foreground hover:border-emerald-300'
                      }`}
                    >
                      <Globe className="h-4 w-4" />
                      عام
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadVisibility('private')}
                      disabled={uploading}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                        uploadVisibility === 'private'
                          ? 'bg-amber-100 border-amber-300 text-amber-700'
                          : 'bg-muted/50 border-muted text-muted-foreground hover:border-amber-300'
                      }`}
                    >
                      <Lock className="h-4 w-4" />
                      خاص
                    </button>
                  </div>
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setUploadDialogOpen(false);
                    setUploadItems([]);
                    setUploadDescription('');
                    setUploadVisibility('public');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  disabled={uploading}
                >
                  إلغاء
                </Button>
                <Button
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleMultiUpload}
                  disabled={uploading || !hasPendingItems}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جاري الرفع... {completedCount}/{totalCount} ({uploadOverallProgress}%)
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      رفع {pendingItems.length} {pendingItems.length === 1 ? 'ملف' : 'ملفات'}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* =====================================================
          Preview Dialog
          ===================================================== */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewFile && getFileIcon(previewFile.file_type)}
              {previewFile?.file_name || 'معاينة الملف'}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[65vh]">
            {previewFile && (
              <>
                {/* Image preview */}
                {(previewFile.file_type === 'image' || (previewFile.file_url && /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(previewFile.file_url))) && (
                  <div className="flex items-center justify-center p-4">
                    <img
                      src={previewFile.file_url}
                      alt={previewFile.file_name}
                      className="max-w-full max-h-[60vh] object-contain rounded-lg"
                    />
                  </div>
                )}

                {/* PDF preview */}
                {previewFile.file_type === 'pdf' && (
                  <iframe
                    src={previewFile.file_url}
                    className="w-full h-[60vh] rounded-lg border"
                    title={previewFile.file_name}
                  />
                )}

                {/* Other files: show metadata */}
                {previewFile.file_type !== 'image' && previewFile.file_type !== 'pdf' && !(previewFile.file_url && /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(previewFile.file_url)) && (
                  <div className="space-y-4 p-4">
                    <div className="flex items-center justify-center p-8 bg-muted/50 rounded-xl">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                          {getFileIcon(previewFile.file_type)}
                        </div>
                        <p className="text-sm text-muted-foreground">لا يمكن معاينة هذا الملف مباشرة</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-muted-foreground text-xs mb-1">اسم الملف</p>
                        <p className="font-medium truncate" title={previewFile.file_name}>{previewFile.file_name}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-muted-foreground text-xs mb-1">التصنيف</p>
                        <p className="font-medium">{previewFile.category || autoCategoryFromFileType(previewFile.file_type)}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-muted-foreground text-xs mb-1">الحجم</p>
                        <p className="font-medium">{formatFileSize(previewFile.file_size)}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-muted-foreground text-xs mb-1">تاريخ الرفع</p>
                        <p className="font-medium">{formatDate(previewFile.created_at)}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-muted-foreground text-xs mb-1">الرؤية</p>
                        <p className="font-medium">{previewFile.visibility === 'private' ? 'خاص' : 'عام'}</p>
                      </div>
                      {previewFile.description && (
                        <div className="bg-muted/30 rounded-lg p-3 col-span-2">
                          <p className="text-muted-foreground text-xs mb-1">الوصف</p>
                          <p className="font-medium break-words">{previewFile.description}</p>
                        </div>
                      )}
                    </div>
                    <Button
                      className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => handleFileDownload(previewFile)}
                    >
                      <Download className="h-4 w-4" />
                      تحميل الملف
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* =====================================================
          Share Dialog with Email Lookup
          ===================================================== */}
      <Dialog open={shareDialogOpen} onOpenChange={(open) => {
        if (!sharingInProgress) {
          setShareDialogOpen(open);
          if (!open) {
            setSharingFile(null);
            setShareEmail('');
            setLookupResult(null);
          }
        }
      }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-teal-600" />
              مشاركة ملف
            </DialogTitle>
          </DialogHeader>
          {sharingFile && (
            <div className="space-y-4">
              {/* File being shared */}
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                  {getFileIcon(sharingFile.file_type)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate" title={sharingFile.file_name}>
                    {sharingFile.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(sharingFile.file_size)}</p>
                </div>
              </div>

              {/* Email input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">البريد الإلكتروني للمستخدم</label>
                <div className="relative">
                  <Input
                    type="email"
                    placeholder="أدخل البريد الإلكتروني..."
                    value={shareEmail}
                    onChange={(e) => handleShareEmailChange(e.target.value)}
                    dir="ltr"
                    className="text-left pl-9"
                    disabled={sharingInProgress}
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>

                {/* Lookup result */}
                {lookupLoading && (
                  <div className="flex items-center gap-2 p-2">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    <span className="text-xs text-muted-foreground">جاري البحث...</span>
                  </div>
                )}

                {lookupResult && !lookupLoading && (
                  <div className="flex items-center gap-3 p-3 bg-emerald-50/50 rounded-lg border border-emerald-200">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                      <Check className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{lookupResult.name}</p>
                      <p className="text-xs text-muted-foreground">{lookupResult.email}</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${
                        lookupResult.role === 'teacher'
                          ? 'bg-teal-100 text-teal-700'
                          : lookupResult.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {lookupResult.role === 'teacher' ? 'معلم' : lookupResult.role === 'admin' ? 'مدير' : 'طالب'}
                    </Badge>
                  </div>
                )}

                {!lookupResult && shareEmail.includes('@') && !lookupLoading && (
                  <div className="flex items-center gap-2 p-2">
                    <X className="h-4 w-4 text-rose-500" />
                    <span className="text-xs text-rose-600">لم يتم العثور على مستخدم بهذا البريد</span>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">سيتم إرسال إشعار للمستخدم بمشاركة الملف معه</p>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShareDialogOpen(false);
                    setSharingFile(null);
                    setShareEmail('');
                    setLookupResult(null);
                  }}
                  disabled={sharingInProgress}
                >
                  إلغاء
                </Button>
                <Button
                  className="gap-2 bg-teal-600 hover:bg-teal-700"
                  onClick={handleShareFile}
                  disabled={sharingInProgress || !shareEmail.trim()}
                >
                  {sharingInProgress ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Share2 className="h-4 w-4" />
                  )}
                  مشاركة
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
