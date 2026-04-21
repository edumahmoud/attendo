'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock,
  Globe,
  Upload,
  Download,
  Trash2,
  Eye,
  Share2,
  File,
  FileText,
  ImageIcon,
  FileSpreadsheet,
  FilePlus,
  FolderOpen,
  Plus,
  X,
  Loader2,
  Search,
  UserCheck,
  Clock,
  User,
  AlertCircle,
  StickyNote,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import type { UserProfile, UserFile, FileShare } from '@/lib/types';

// =====================================================
// Props
// =====================================================
interface PersonalFilesSectionProps {
  profile: UserProfile;
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
  if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg'))
    return <ImageIcon className="h-5 w-5 text-purple-500" />;
  if (t.includes('sheet') || t.includes('excel') || t.includes('csv'))
    return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
  if (t.includes('word') || t.includes('doc'))
    return <FilePlus className="h-5 w-5 text-blue-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
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
export default function PersonalFilesSection({ profile }: PersonalFilesSectionProps) {
  // ─── Sub-tab state ───
  const [activeSubTab, setActiveSubTab] = useState<'private' | 'public'>('private');

  // ─── Data state ───
  const [privateFiles, setPrivateFiles] = useState<UserFile[]>([]);
  const [publicFiles, setPublicFiles] = useState<UserFile[]>([]);
  const [sharedFiles, setSharedFiles] = useState<FileShare[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Upload state ───
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadVisibility, setUploadVisibility] = useState<'private' | 'public'>('private');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Preview state ───
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<UserFile | FileShare | null>(null);

  // ─── Share dialog state ───
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [sharingFileId, setSharingFileId] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareLookupResult, setShareLookupResult] = useState<{
    id: string;
    name: string;
    role: string;
    email: string;
  } | null>(null);
  const [shareLookupLoading, setShareLookupLoading] = useState(false);
  const [sharingInProgress, setSharingInProgress] = useState(false);

  // ─── Delete state ───
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // ─── Debounce ref for email lookup ───
  const emailLookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // =====================================================
  // Data Fetching
  // =====================================================
  const fetchPrivateFiles = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/user-files?type=private', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setPrivateFiles(result.data as UserFile[]);
      }
    } catch (err) {
      console.error('Error fetching private files:', err);
    }
  }, []);

  const fetchPublicFiles = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/user-files?type=public', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setPublicFiles(result.data as UserFile[]);
      }
    } catch (err) {
      console.error('Error fetching public files:', err);
    }
  }, []);

  const fetchSharedFiles = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/user-files?type=shared', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setSharedFiles(result.data as FileShare[]);
      }
    } catch (err) {
      console.error('Error fetching shared files:', err);
    }
  }, []);

  const fetchCurrentTabData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeSubTab === 'private') {
        await fetchPrivateFiles();
      } else {
        await Promise.all([fetchPublicFiles(), fetchSharedFiles()]);
      }
    } finally {
      setLoading(false);
    }
  }, [activeSubTab, fetchPrivateFiles, fetchPublicFiles, fetchSharedFiles]);

  useEffect(() => {
    fetchCurrentTabData();
  }, [fetchCurrentTabData]);

  // =====================================================
  // Handlers
  // =====================================================

  // ─── Handle file selection ───
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('حجم الملف يتجاوز 10 ميجابايت');
      return;
    }

    setUploadFile(file);
    setUploadName(file.name);
  };

  // ─── Handle file upload with XHR progress ───
  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error('يرجى اختيار ملف');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('name', uploadName || uploadFile.name);
      formData.append('visibility', uploadVisibility);
      formData.append('description', uploadDescription);
      formData.append('notes', uploadNotes);

      // Use XMLHttpRequest for progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(pct);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              if (result.success) {
                resolve();
              } else {
                reject(new Error(result.error || 'حدث خطأ أثناء رفع الملف'));
              }
            } catch {
              reject(new Error('حدث خطأ أثناء معالجة الاستجابة'));
            }
          } else {
            try {
              const result = JSON.parse(xhr.responseText);
              reject(new Error(result.error || `خطأ في الخادم (${xhr.status})`));
            } catch {
              reject(new Error(`خطأ في الخادم (${xhr.status})`));
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('حدث خطأ في الاتصال'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('تم إلغاء الرفع'));
        });

        xhr.open('POST', '/api/user-files');
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        xhr.send(formData);
      });

      toast.success('تم رفع الملف بنجاح');
      resetUploadForm();
      setUploadDialogOpen(false);
      fetchCurrentTabData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء رفع الملف';
      toast.error(message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadName('');
    setUploadDescription('');
    setUploadNotes('');
    setUploadVisibility('private');
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── Handle file delete ───
  const handleDeleteClick = (fileId: string) => {
    setDeleteTargetId(fileId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;
    setDeletingFileId(deleteTargetId);
    setDeleteConfirmOpen(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      const response = await fetch(`/api/user-files?fileId=${deleteTargetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        toast.error(result.error || 'حدث خطأ أثناء حذف الملف');
      } else {
        toast.success('تم حذف الملف بنجاح');
        fetchCurrentTabData();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setDeletingFileId(null);
      setDeleteTargetId(null);
    }
  };

  // ─── Handle file download ───
  const handleDownload = (fileUrl: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ─── Handle preview ───
  const handlePreview = (file: UserFile | FileShare) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  // ─── Handle share dialog open ───
  const handleShareClick = (fileId: string) => {
    setSharingFileId(fileId);
    setShareEmail('');
    setShareLookupResult(null);
    setShareDialogOpen(true);
  };

  // ─── Debounced email lookup ───
  const handleShareEmailChange = (email: string) => {
    setShareEmail(email);
    setShareLookupResult(null);

    if (emailLookupTimerRef.current) {
      clearTimeout(emailLookupTimerRef.current);
    }

    if (!email.trim() || !email.includes('@')) return;

    emailLookupTimerRef.current = setTimeout(async () => {
      setShareLookupLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`/api/users/lookup?email=${encodeURIComponent(email.trim())}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const result = await response.json();
        if (result.success && result.data) {
          setShareLookupResult(result.data as { id: string; name: string; role: string; email: string });
        } else {
          setShareLookupResult(null);
        }
      } catch {
        setShareLookupResult(null);
      } finally {
        setShareLookupLoading(false);
      }
    }, 500);
  };

  // ─── Handle share submit ───
  const handleShareSubmit = async () => {
    if (!sharingFileId || !shareEmail.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني');
      return;
    }

    if (!shareLookupResult) {
      toast.error('لم يتم العثور على مستخدم بهذا البريد');
      return;
    }

    setSharingInProgress(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      const response = await fetch('/api/user-files/share', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId: sharingFileId,
          fileType: 'user_file',
          email: shareEmail.trim(),
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        toast.error(result.error || 'حدث خطأ أثناء مشاركة الملف');
      } else {
        toast.success(`تمت مشاركة الملف مع ${shareLookupResult.name} بنجاح`);
        setShareDialogOpen(false);
        setShareEmail('');
        setShareLookupResult(null);
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setSharingInProgress(false);
    }
  };

  // =====================================================
  // Render: Skeleton Loader
  // =====================================================
  const renderSkeletons = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i} className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  // =====================================================
  // Render: Empty State
  // =====================================================
  const renderEmptyState = (message: string, icon: React.ReactNode) => (
    <motion.div
      variants={itemVariants}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 mb-4">
        {icon}
      </div>
      <p className="text-muted-foreground text-sm">{message}</p>
    </motion.div>
  );

  // =====================================================
  // Render: File Card
  // =====================================================
  const renderFileCard = (file: UserFile, isOwn: boolean = true) => (
    <motion.div variants={itemVariants}>
      <Card className="shadow-sm hover:shadow-md transition-shadow group">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* File icon */}
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100">
              {getFileIcon(file.file_type)}
            </div>

            {/* File info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-semibold text-foreground truncate">{file.file_name}</h4>
                {file.visibility === 'private' ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 shrink-0">
                    <Lock className="h-2.5 w-2.5 ml-0.5" />
                    خاصة
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 shrink-0">
                    <Globe className="h-2.5 w-2.5 ml-0.5" />
                    عام
                  </Badge>
                )}
              </div>

              {file.description && (
                <p className="text-xs text-muted-foreground line-clamp-1 mb-0.5">{file.description}</p>
              )}

              {file.notes && (
                <div className="flex items-center gap-1 mb-1">
                  <StickyNote className="h-3 w-3 text-teal-500 shrink-0" />
                  <p className="text-xs text-teal-600 line-clamp-1">{file.notes}</p>
                </div>
              )}

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{formatFileSize(file.file_size)}</span>
                <span className="flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {formatDate(file.created_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
              onClick={() => handlePreview(file)}
            >
              <Eye className="h-3.5 w-3.5 ml-1" />
              معاينة
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-teal-700 hover:text-teal-800 hover:bg-teal-50"
              onClick={() => handleDownload(file.file_url, file.file_name)}
            >
              <Download className="h-3.5 w-3.5 ml-1" />
              تحميل
            </Button>
            {isOwn && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-50"
                  onClick={() => handleShareClick(file.id)}
                >
                  <Share2 className="h-3.5 w-3.5 ml-1" />
                  مشاركة
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-rose-700 hover:text-rose-800 hover:bg-rose-50 mr-auto"
                  onClick={() => handleDeleteClick(file.id)}
                  disabled={deletingFileId === file.id}
                >
                  {deletingFileId === file.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 ml-1" />
                  )}
                  حذف
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  // =====================================================
  // Render: Shared File Card
  // =====================================================
  const renderSharedFileCard = (share: FileShare) => (
    <motion.div variants={itemVariants}>
      <Card className="shadow-sm hover:shadow-md transition-shadow group">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* File icon */}
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 border border-blue-100">
              {getFileIcon(share.file_url?.split('.').pop())}
            </div>

            {/* File info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-semibold text-foreground truncate">
                  {share.file_name || 'ملف مشترك'}
                </h4>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 shrink-0">
                  <Share2 className="h-2.5 w-2.5 ml-0.5" />
                  مشارك
                </Badge>
              </div>

              {/* Who shared it */}
              <div className="flex items-center gap-1 mb-1">
                <User className="h-3 w-3 text-blue-500 shrink-0" />
                <p className="text-xs text-blue-600">
                  شاركه {share.shared_by_name || 'مستخدم'}
                </p>
              </div>

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {formatDate(share.created_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions - preview & download only */}
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
              onClick={() => handlePreview(share)}
            >
              <Eye className="h-3.5 w-3.5 ml-1" />
              معاينة
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-teal-700 hover:text-teal-800 hover:bg-teal-50"
              onClick={() => {
                if (share.file_url && share.file_name) {
                  handleDownload(share.file_url, share.file_name);
                }
              }}
            >
              <Download className="h-3.5 w-3.5 ml-1" />
              تحميل
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  // =====================================================
  // Render: Preview Dialog
  // =====================================================
  const renderPreviewDialog = () => {
    if (!previewFile) return null;

    const fileUrl = 'file_url' in previewFile ? previewFile.file_url : (previewFile as FileShare).file_url || '';
    const fileType = 'file_type' in previewFile ? previewFile.file_type : undefined;
    const fileName = 'file_name' in previewFile ? previewFile.file_name : (previewFile as FileShare).file_name || 'ملف';
    const fileSize = 'file_size' in previewFile ? previewFile.file_size : undefined;
    const fileDescription = 'description' in previewFile ? (previewFile as UserFile).description : undefined;
    const fileNotes = 'notes' in previewFile ? (previewFile as UserFile).notes : undefined;
    const fileVisibility = 'visibility' in previewFile ? (previewFile as UserFile).visibility : undefined;

    return (
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              {getFileIcon(fileType)}
              <span className="truncate">{fileName}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              معاينة الملف {fileName}
            </DialogDescription>
          </DialogHeader>

          {/* Preview content */}
          <div className="overflow-auto max-h-[55vh] rounded-lg border bg-muted/30">
            {isImageType(fileType) && fileUrl ? (
              <div className="flex items-center justify-center p-4">
                <img
                  src={fileUrl}
                  alt={fileName}
                  className="max-w-full max-h-[50vh] object-contain rounded"
                />
              </div>
            ) : isPdfType(fileType) && fileUrl ? (
              <iframe
                src={fileUrl}
                className="w-full h-[50vh] rounded"
                title={fileName}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100">
                  {getFileIcon(fileType)}
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground">{fileName}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</p>
                </div>
                <Button
                  onClick={() => handleDownload(fileUrl, fileName)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  size="sm"
                >
                  <Download className="h-4 w-4 ml-1.5" />
                  تحميل الملف
                </Button>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="space-y-2 pt-2">
            {fileDescription && (
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-muted-foreground shrink-0 pt-0.5">الوصف:</span>
                <p className="text-xs text-foreground">{fileDescription}</p>
              </div>
            )}
            {fileNotes && (
              <div className="flex items-start gap-2">
                <StickyNote className="h-3.5 w-3.5 text-teal-500 shrink-0 mt-0.5" />
                <span className="text-xs font-medium text-muted-foreground shrink-0 pt-0.5">ملاحظات:</span>
                <p className="text-xs text-foreground">{fileNotes}</p>
              </div>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>الحجم: {formatFileSize(fileSize)}</span>
              {fileVisibility && (
                <span className="flex items-center gap-1">
                  {fileVisibility === 'private' ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                  {fileVisibility === 'private' ? 'خاص' : 'عام'}
                </span>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(false)}
              size="sm"
            >
              إغلاق
            </Button>
            <Button
              onClick={() => handleDownload(fileUrl, fileName)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              size="sm"
            >
              <Download className="h-4 w-4 ml-1.5" />
              تحميل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // =====================================================
  // Render: Upload Dialog
  // =====================================================
  const renderUploadDialog = () => (
    <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
      if (!open && !uploading) {
        resetUploadForm();
      }
      setUploadDialogOpen(open);
    }}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <Upload className="h-5 w-5 text-emerald-600" />
            رفع ملف شخصي
          </DialogTitle>
          <DialogDescription className="sr-only">
            رفع ملف شخصي جديد
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File picker */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">الملف</Label>
            <div
              className="border-2 border-dashed border-emerald-200 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadFile ? (
                <div className="flex items-center justify-center gap-2">
                  {getFileIcon(uploadFile.type)}
                  <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
                    {uploadFile.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({formatFileSize(uploadFile.size)})
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-rose-500 hover:text-rose-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetUploadForm();
                    }}
                    disabled={uploading}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 mx-auto">
                    <Upload className="h-6 w-6 text-emerald-600" />
                  </div>
                  <p className="text-sm text-muted-foreground">اضغط لاختيار ملف أو اسحبه هنا</p>
                  <p className="text-xs text-muted-foreground">الحد الأقصى: 10 ميجابايت</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept="*/*"
            />
          </div>

          {/* File name */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">اسم الملف</Label>
            <Input
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="اسم الملف"
              className="text-sm"
              disabled={uploading}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">الوصف</Label>
            <Textarea
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              placeholder="وصف مختصر للملف (اختياري)"
              className="text-sm resize-none"
              rows={2}
              disabled={uploading}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1">
              <StickyNote className="h-3.5 w-3.5 text-teal-500" />
              ملاحظات
            </Label>
            <Textarea
              value={uploadNotes}
              onChange={(e) => setUploadNotes(e.target.value)}
              placeholder="ملاحظات لتسهيل البحث لاحقاً (اختياري)"
              className="text-sm resize-none"
              rows={2}
              disabled={uploading}
            />
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">الظهور</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setUploadVisibility('private')}
                disabled={uploading}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-all ${
                  uploadVisibility === 'private'
                    ? 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-muted bg-background text-muted-foreground hover:border-muted-foreground/30'
                }`}
              >
                <Lock className="h-4 w-4" />
                خاص
              </button>
              <button
                type="button"
                onClick={() => setUploadVisibility('public')}
                disabled={uploading}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-all ${
                  uploadVisibility === 'public'
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : 'border-muted bg-background text-muted-foreground hover:border-muted-foreground/30'
                }`}
              >
                <Globe className="h-4 w-4" />
                عام
              </button>
            </div>
          </div>

          {/* Progress bar */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">جارٍ الرفع...</span>
                <span className="font-medium text-emerald-700">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (!uploading) {
                resetUploadForm();
                setUploadDialogOpen(false);
              }
            }}
            disabled={uploading}
            size="sm"
          >
            إلغاء
          </Button>
          <Button
            onClick={handleUpload}
            disabled={uploading || !uploadFile}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            size="sm"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 ml-1.5 animate-spin" />
                جارٍ الرفع...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 ml-1.5" />
                رفع الملف
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // =====================================================
  // Render: Share Dialog
  // =====================================================
  const renderShareDialog = () => (
    <Dialog open={shareDialogOpen} onOpenChange={(open) => {
      if (!open && !sharingInProgress) {
        setShareEmail('');
        setShareLookupResult(null);
      }
      setShareDialogOpen(open);
    }}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <Share2 className="h-5 w-5 text-blue-600" />
            مشاركة الملف
          </DialogTitle>
          <DialogDescription className="sr-only">
            مشاركة الملف مع مستخدم آخر عبر البريد الإلكتروني
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Email input */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">البريد الإلكتروني للمستخدم</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={shareEmail}
                onChange={(e) => handleShareEmailChange(e.target.value)}
                placeholder="أدخل البريد الإلكتروني"
                className="pr-9 text-sm"
                dir="ltr"
                disabled={sharingInProgress}
              />
              {shareLookupLoading && (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-emerald-600" />
              )}
            </div>
          </div>

          {/* Lookup result */}
          <AnimatePresence mode="wait">
            {shareLookupResult && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="border-emerald-200 bg-emerald-50/50">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 border border-emerald-200">
                        <UserCheck className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {shareLookupResult.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span dir="ltr">{shareLookupResult.email}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {shareLookupResult.role === 'teacher' ? 'معلم' :
                             shareLookupResult.role === 'student' ? 'طالب' :
                             shareLookupResult.role === 'admin' ? 'مدير' : shareLookupResult.role}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Not found hint */}
          {shareEmail.includes('@') && !shareLookupLoading && !shareLookupResult && shareEmail.trim().length > 3 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-xs text-rose-500"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              لم يتم العثور على مستخدم بهذا البريد
            </motion.div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (!sharingInProgress) {
                setShareEmail('');
                setShareLookupResult(null);
                setShareDialogOpen(false);
              }
            }}
            disabled={sharingInProgress}
            size="sm"
          >
            إلغاء
          </Button>
          <Button
            onClick={handleShareSubmit}
            disabled={sharingInProgress || !shareLookupResult}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
          >
            {sharingInProgress ? (
              <>
                <Loader2 className="h-4 w-4 ml-1.5 animate-spin" />
                جارٍ المشاركة...
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
  );

  // =====================================================
  // Render: Delete Confirm Dialog
  // =====================================================
  const renderDeleteDialog = () => (
    <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <DialogContent className="sm:max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <Trash2 className="h-5 w-5 text-rose-600" />
            حذف الملف
          </DialogTitle>
          <DialogDescription className="sr-only">
            تأكيد حذف الملف
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          هل أنت متأكد من حذف هذا الملف؟ لا يمكن التراجع عن هذا الإجراء.
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDeleteConfirmOpen(false)}
            size="sm"
            disabled={deletingFileId !== null}
          >
            إلغاء
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            className="bg-rose-600 hover:bg-rose-700 text-white"
            size="sm"
            disabled={deletingFileId !== null}
          >
            {deletingFileId ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Trash2 className="h-4 w-4 ml-1.5" />
                حذف
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // =====================================================
  // Main Render
  // =====================================================
  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
            <FolderOpen className="h-4 w-4 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-foreground">قسم الملفات الشخصية</h3>
        </div>
        <Button
          onClick={() => setUploadDialogOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8"
          size="sm"
        >
          <Plus className="h-3.5 w-3.5 ml-1" />
          رفع ملف
        </Button>
      </div>

      {/* Sub-tabs */}
      <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as 'private' | 'public')}>
        <TabsList className="bg-muted/60">
          <TabsTrigger value="private" className="text-xs gap-1.5 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700">
            <Lock className="h-3.5 w-3.5" />
            خاصة
          </TabsTrigger>
          <TabsTrigger value="public" className="text-xs gap-1.5 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700">
            <Globe className="h-3.5 w-3.5" />
            عام
          </TabsTrigger>
        </TabsList>

        {/* Private tab */}
        <TabsContent value="private">
          {loading ? (
            renderSkeletons()
          ) : privateFiles.length === 0 ? (
            renderEmptyState(
              'لا توجد ملفات خاصة بعد. ارفع ملفاً جديداً للبدء.',
              <Lock className="h-7 w-7 text-amber-500" />
            )
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {privateFiles.map((file) => renderFileCard(file, true))}
            </motion.div>
          )}
        </TabsContent>

        {/* Public tab */}
        <TabsContent value="public">
          {loading ? (
            renderSkeletons()
          ) : (
            <div className="space-y-6">
              {/* Own public files */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-emerald-600" />
                  ملفاتي العامة
                </h4>
                {publicFiles.length === 0 ? (
                  renderEmptyState(
                    'لا توجد ملفات عامة بعد.',
                    <Globe className="h-7 w-7 text-emerald-500" />
                  )
                ) : (
                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  >
                    {publicFiles.map((file) => renderFileCard(file, true))}
                  </motion.div>
                )}
              </div>

              {/* Separator */}
              {sharedFiles.length > 0 && <Separator className="my-2" />}

              {/* Files shared with me */}
              {sharedFiles.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-blue-600" />
                    ملفات مشاركة معي
                  </h4>
                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  >
                    {sharedFiles.map((share) => renderSharedFileCard(share))}
                  </motion.div>
                </div>
              )}

              {/* Empty shared files */}
              {publicFiles.length === 0 && sharedFiles.length === 0 && (
                renderEmptyState(
                  'لا توجد ملفات عامة أو مشاركة بعد.',
                  <Globe className="h-7 w-7 text-emerald-500" />
                )
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {renderUploadDialog()}
      {renderShareDialog()}
      {renderPreviewDialog()}
      {renderDeleteDialog()}
    </div>
  );
}
