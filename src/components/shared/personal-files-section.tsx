'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  BookOpen,
  CheckCircle2,
  Video,
  Music,
  MonitorPlay,
  FileVideo,
  Headphones,
  Presentation,
  MoreVertical,
  ClipboardCheck,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase';
import type { UserProfile, UserFile, FileShare, SubjectFile } from '@/lib/types';

// =====================================================
// Props
// =====================================================
interface PersonalFilesSectionProps {
  profile: UserProfile;
}

// =====================================================
// Upload item type
// =====================================================
interface UploadItem {
  id: string;
  file: File;
  customName: string;
  originalExtension: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  errorMessage?: string;
}

// =====================================================
// Subject option type
// =====================================================
interface SubjectOption {
  id: string;
  name: string;
}

// =====================================================
// Unified file item for display
// =====================================================
interface UnifiedFileItem {
  id: string;
  file_name: string;
  file_url: string;
  file_type?: string;
  file_size?: number;
  visibility: 'public' | 'private';
  description?: string;
  notes?: string;
  subject_id?: string | null;
  assignment_id?: string | null;
  created_at: string;
  source: 'user_file' | 'subject_file' | 'shared';
  isOwn: boolean;
  subjectFileSubjectId?: string; // for subject_files, the subject_id
  shared_by_name?: string;
  uploader_name?: string;
}

// =====================================================
// User lookup result type
// =====================================================
interface UserLookupResult {
  id: string;
  name: string;
  email: string;
  role: string;
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
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
};

// =====================================================
// Helpers
// =====================================================

/** Detect file type category from MIME type and/or file name */
function getFileTypeCategory(fileType?: string | null, fileName?: string): string {
  const ext = fileName ? fileName.split('.').pop()?.toLowerCase() : '';

  // Check by MIME type first
  if (fileType) {
    const t = fileType.toLowerCase();
    if (t.includes('pdf')) return FILE_CATEGORY_DOCUMENTS;
    if (t.includes('image') || t.includes('png') || t.includes('jpg') || t.includes('jpeg') || t.includes('gif') || t.includes('webp') || t.includes('svg') || t.includes('bmp'))
      return FILE_CATEGORY_IMAGES;
    if (t.includes('video') || t.includes('mp4') || t.includes('webm') || t.includes('mov') || t.includes('avi'))
      return FILE_CATEGORY_VIDEOS;
    if (t.includes('audio') || t.includes('mp3') || t.includes('wav') || t.includes('ogg') || t.includes('m4a') || t.includes('flac'))
      return FILE_CATEGORY_AUDIO;
    if (t.includes('sheet') || t.includes('excel') || t.includes('csv') || t.includes('spreadsheet'))
      return FILE_CATEGORY_SPREADSHEETS;
    if (t.includes('presentation') || t.includes('powerpoint') || t.includes('ppt'))
      return FILE_CATEGORY_PRESENTATIONS;
    if (t.includes('word') || t.includes('doc') || t.includes('text/plain') || t.includes('rtf'))
      return FILE_CATEGORY_DOCUMENTS;
  }

  // Fall back to file extension
  if (ext) {
    const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'pages'];
    const imgExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif', 'avif'];
    const vidExts = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v', '3gp'];
    const audExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'opus'];
    const sheetExts = ['xls', 'xlsx', 'csv', 'ods', 'numbers'];
    const presExts = ['ppt', 'pptx', 'odp', 'key'];

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

/** Format a date string into Arabic locale with date and time */
function formatArabicDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

/** Format a short Arabic date (without time) for compact display */
function formatArabicDateShort(dateStr: string): string {
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

/** Format file size from bytes to human-readable string */
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

function splitFileName(fileName: string): { name: string; ext: string } {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) return { name: fileName, ext: '' };
  return {
    name: fileName.substring(0, lastDot),
    ext: fileName.substring(lastDot + 1),
  };
}

let uploadItemIdCounter = 0;
function generateUploadItemId(): string {
  return `upload-${++uploadItemIdCounter}-${Date.now()}`;
}

/** Check if a date string matches a given Arabic date keyword */
function matchesDateKeyword(dateStr: string, keyword: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const kw = keyword.trim();

  if (kw === 'اليوم' || kw === 'اليوم،' || kw === 'اليوم,') {
    return date.toDateString() === now.toDateString();
  }
  if (kw === 'أمس' || kw === 'امس') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  }
  if (kw === 'هذا الأسبوع' || kw === 'هذا الاسبوع') {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return date >= weekStart;
  }
  if (kw === 'هذا الشهر') {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }

  // Try matching date format patterns
  try {
    const parsed = new Date(kw);
    if (!isNaN(parsed.getTime())) {
      return date.toDateString() === parsed.toDateString();
    }
  } catch {
    // ignore
  }

  return false;
}

// =====================================================
// Main Component
// =====================================================
export default function PersonalFilesSection({ profile }: PersonalFilesSectionProps) {
  // ─── Active tab state ───
  const [activeTab, setActiveTab] = useState<string>(FILE_CATEGORY_ALL);

  // ─── Data state ───
  const [allUserFiles, setAllUserFiles] = useState<UserFile[]>([]);
  const [subjectFilesMap, setSubjectFilesMap] = useState<Record<string, SubjectFile[]>>({});
  const [sharedFiles, setSharedFiles] = useState<FileShare[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Search state ───
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Upload state ───
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadVisibility, setUploadVisibility] = useState<'private' | 'public'>('private');
  const [uploadSubjectId, setUploadSubjectId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [overallProgress, setOverallProgress] = useState({ completed: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Subjects state ───
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [subjectNameMap, setSubjectNameMap] = useState<Record<string, string>>({});

  // ─── Preview state ───
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<UnifiedFileItem | null>(null);

  // ─── Share dialog state ───
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [sharingFileId, setSharingFileId] = useState<string | null>(null);
  const [shareSearchQuery, setShareSearchQuery] = useState('');
  const [shareSearchResults, setShareSearchResults] = useState<UserLookupResult[]>([]);
  const [shareSearchLoading, setShareSearchLoading] = useState(false);
  const [selectedShareUsers, setSelectedShareUsers] = useState<UserLookupResult[]>([]);
  const [sharingInProgress, setSharingInProgress] = useState(false);

  // ─── Delete state ───
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; source: string } | null>(null);

  // ─── Visibility toggle state ───
  const [togglingVisibilityId, setTogglingVisibilityId] = useState<string | null>(null);

  // ─── Assign to subject state ───
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningFile, setAssigningFile] = useState<UnifiedFileItem | null>(null);
  const [assignSubjectId, setAssignSubjectId] = useState<string>('');
  const [assigningInProgress, setAssigningInProgress] = useState(false);

  // ─── Debounce ref for share search ───
  const shareSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // =====================================================
  // Data Fetching
  // =====================================================
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch user files sequentially to avoid rate limiting
      const privateRes = await fetch('/api/user-files?type=private', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const privateData = await privateRes.json();

      await new Promise((r) => setTimeout(r, 100)); // small delay to avoid 429

      const publicRes = await fetch('/api/user-files?type=public', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const publicData = await publicRes.json();

      await new Promise((r) => setTimeout(r, 100));

      const sharedRes = await fetch('/api/user-files?type=shared', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const sharedData = await sharedRes.json();

      const allFiles: UserFile[] = [
        ...(privateData.success && Array.isArray(privateData.data) ? privateData.data : []),
        ...(publicData.success && Array.isArray(publicData.data) ? publicData.data : []),
      ];
      // Deduplicate by id
      const fileMap = new Map<string, UserFile>();
      allFiles.forEach((f: UserFile) => fileMap.set(f.id, f));
      setAllUserFiles(Array.from(fileMap.values()));

      if (sharedData.success && Array.isArray(sharedData.data)) {
        setSharedFiles(sharedData.data as FileShare[]);
      }

      // Fetch subject files sequentially with delay to avoid rate limiting
      const sfMap: Record<string, SubjectFile[]> = {};
      for (let i = 0; i < subjects.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 150));
        try {
          const res = await fetch(`/api/subjects/${subjects[i].id}/files`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const result = await res.json();
          if (result.success && Array.isArray(result.data)) {
            sfMap[subjects[i].id] = result.data as SubjectFile[];
          }
        } catch {
          // Skip failed subject file fetches
        }
      }
      setSubjectFilesMap(sfMap);
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setLoading(false);
    }
  }, [subjects]);

  // ─── Fetch user's subjects ───
  const fetchSubjects = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const nameMap: Record<string, string> = {};

      if (profile.role === 'teacher') {
        const { data, error } = await supabase
          .from('subjects')
          .select('id, name')
          .eq('teacher_id', profile.id);
        if (!error && data) {
          const opts = (data as SubjectOption[]).map((s) => {
            nameMap[s.id] = s.name;
            return { id: s.id, name: s.name };
          });
          setSubjects(opts);
        }
      } else if (profile.role === 'student') {
        const { data, error } = await supabase
          .from('subject_students')
          .select('subject_id, subjects(id, name)')
          .eq('student_id', profile.id);
        if (!error && data) {
          const opts: SubjectOption[] = [];
          (data as unknown as { subject_id: string; subjects: { id: string; name: string } | null }[]).forEach((row) => {
            if (row.subjects) {
              opts.push({ id: row.subjects.id, name: row.subjects.name });
              nameMap[row.subjects.id] = row.subjects.name;
            }
          });
          setSubjects(opts);
        }
      }

      setSubjectNameMap(nameMap);
    } catch (err) {
      console.error('Error fetching subjects:', err);
    }
  }, [profile.id, profile.role]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // =====================================================
  // Unified file list computation
  // =====================================================
  const unifiedFiles = useMemo<UnifiedFileItem[]>(() => {
    const items: UnifiedFileItem[] = [];

    // User files
    allUserFiles.forEach((f) => {
      items.push({
        id: f.id,
        file_name: f.file_name,
        file_url: f.file_url,
        file_type: f.file_type,
        file_size: f.file_size,
        visibility: f.visibility,
        description: f.description,
        notes: f.notes,
        subject_id: f.subject_id,
        assignment_id: f.assignment_id,
        created_at: f.created_at,
        source: 'user_file',
        isOwn: true,
      });
    });

    // Subject files
    Object.entries(subjectFilesMap).forEach(([subjectId, files]) => {
      files.forEach((f) => {
        const isOwn = f.uploaded_by === profile.id;
        if (profile.role === 'teacher' || f.visibility === 'public' || isOwn) {
          items.push({
            id: f.id,
            file_name: f.file_name,
            file_url: f.file_url,
            file_type: f.file_type,
            file_size: f.file_size,
            visibility: (f.visibility as 'public' | 'private') || 'public',
            description: f.description,
            subject_id: subjectId,
            created_at: f.created_at,
            source: 'subject_file',
            isOwn,
            subjectFileSubjectId: subjectId,
            uploader_name: f.uploader_name,
          });
        }
      });
    });

    // Shared files
    sharedFiles.forEach((s) => {
      items.push({
        id: s.file_id,
        file_name: s.file_name || 'ملف مشترك',
        file_url: s.file_url || '',
        file_type: undefined,
        file_size: undefined,
        visibility: 'public',
        created_at: s.created_at,
        source: 'shared',
        isOwn: false,
        shared_by_name: s.shared_by_name,
      });
    });

    return items;
  }, [allUserFiles, subjectFilesMap, sharedFiles, profile.id, profile.role]);

  // ─── Compute file type category counts ───
  const categoryFileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    counts[FILE_CATEGORY_ALL] = unifiedFiles.length;

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
      counts[cat] = 0;
    });

    unifiedFiles.forEach((f) => {
      const cat = getFileTypeCategory(f.file_type, f.file_name);
      counts[cat] = (counts[cat] || 0) + 1;
    });

    return counts;
  }, [unifiedFiles]);

  // ─── Compute which tabs to show (only those with files, plus "الكل") ───
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

  // ─── Filtered files for current tab ───
  const filteredFiles = useMemo(() => {
    let files = unifiedFiles;

    // Filter by file type category tab
    if (activeTab !== FILE_CATEGORY_ALL) {
      files = files.filter(
        (f) => getFileTypeCategory(f.file_type, f.file_name) === activeTab
      );
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      files = files.filter((f) => {
        if (f.file_name.toLowerCase().includes(q)) return true;
        if (f.description?.toLowerCase().includes(q)) return true;
        if (f.notes?.toLowerCase().includes(q)) return true;
        if (matchesDateKeyword(f.created_at, q)) return true;
        return false;
      });
    }

    // Sort by created_at descending
    return files.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [unifiedFiles, activeTab, searchQuery]);

  // =====================================================
  // Handlers
  // =====================================================

  // ─── Handle file selection (multiple) ───
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: UploadItem[] = [];
    let hasOversized = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) {
        hasOversized = true;
        continue;
      }
      const { name, ext } = splitFileName(file.name);
      newItems.push({
        id: generateUploadItemId(),
        file,
        customName: name,
        originalExtension: ext,
        status: 'pending',
        progress: 0,
      });
    }

    if (hasOversized) {
      toast.error('بعض الملفات تتجاوز 10 ميجابايت وتم استبعادها');
    }

    if (newItems.length > 0) {
      setUploadItems((prev) => [...prev, ...newItems]);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateUploadItem = useCallback((id: string, updates: Partial<UploadItem>) => {
    setUploadItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }, []);

  const removeUploadItem = (id: string) => {
    setUploadItems((prev) => prev.filter((item) => item.id !== id));
  };

  const uploadSingleFile = useCallback(async (
    item: UploadItem,
    accessToken: string
  ): Promise<void> => {
    const displayName = item.originalExtension
      ? `${item.customName}.${item.originalExtension}`
      : item.customName;

    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('name', displayName || item.file.name);
    formData.append('visibility', uploadVisibility);
    formData.append('description', uploadDescription);
    formData.append('notes', uploadNotes);
    if (uploadSubjectId && uploadSubjectId !== '__none__' && uploadSubjectId !== '__general__') {
      formData.append('subjectId', uploadSubjectId);
    }

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          updateUploadItem(item.id, { progress: pct });
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
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.send(formData);
    });
  }, [uploadVisibility, uploadDescription, uploadNotes, uploadSubjectId, updateUploadItem]);

  const handleUpload = async () => {
    const pendingItems = uploadItems.filter((item) => item.status === 'pending');
    if (pendingItems.length === 0) {
      toast.error('يرجى اختيار ملف واحد على الأقل');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setOverallProgress({ completed: 0, total: pendingItems.length });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      let completed = 0;
      let errors = 0;

      for (const item of pendingItems) {
        updateUploadItem(item.id, { status: 'uploading', progress: 0 });

        try {
          await uploadSingleFile(item, session.access_token);
          updateUploadItem(item.id, { status: 'done', progress: 100 });
          completed++;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
          updateUploadItem(item.id, { status: 'error', errorMessage: message });
          errors++;
        }

        setOverallProgress({ completed: completed + errors, total: pendingItems.length });
      }

      if (errors === 0) {
        toast.success(`تم رفع ${completed} ملف${completed > 1 ? 'ات' : ''} بنجاح`);
      } else if (completed > 0) {
        toast.warning(`تم رفع ${completed} ملف${completed > 1 ? 'ات' : ''} بنجاح، وفشل ${errors} ملف${errors > 1 ? 'ات' : ''}`);
      } else {
        toast.error(`فشل رفع جميع الملفات (${errors})`);
      }

      if (completed > 0) {
        fetchAllData();
      }

      if (completed > 0 && errors === 0) {
        setTimeout(() => {
          resetUploadForm();
          setUploadDialogOpen(false);
        }, 800);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء رفع الملفات';
      toast.error(message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const resetUploadForm = () => {
    setUploadItems([]);
    setUploadDescription('');
    setUploadNotes('');
    setUploadVisibility('private');
    setUploadSubjectId('');
    setUploadProgress(0);
    setOverallProgress({ completed: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── Handle visibility toggle ───
  const handleVisibilityToggle = async (file: UnifiedFileItem) => {
    const newVisibility = file.visibility === 'private' ? 'public' : 'private';
    setTogglingVisibilityId(file.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      if (file.source === 'user_file') {
        const response = await fetch('/api/user-files/visibility', {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fileId: file.id, visibility: newVisibility }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          toast.error(result.error || 'حدث خطأ أثناء تحديث الظهور');
        } else {
          toast.success(newVisibility === 'public' ? 'تم تغيير الملف إلى عام' : 'تم تغيير الملف إلى خاص');
          setAllUserFiles((prev) =>
            prev.map((f) => (f.id === file.id ? { ...f, visibility: newVisibility } : f))
          );
        }
      } else if (file.source === 'subject_file' && file.subjectFileSubjectId) {
        const response = await fetch(`/api/subjects/${file.subjectFileSubjectId}/files/visibility`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fileId: file.id, visibility: newVisibility }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          toast.error(result.error || 'حدث خطأ أثناء تحديث الظهور');
        } else {
          toast.success(newVisibility === 'public' ? 'تم تغيير الملف إلى عام' : 'تم تغيير الملف إلى خاص');
          setSubjectFilesMap((prev) => {
            const updated = { ...prev };
            if (updated[file.subjectFileSubjectId!]) {
              updated[file.subjectFileSubjectId!] = updated[file.subjectFileSubjectId!].map((f) =>
                f.id === file.id ? { ...f, visibility: newVisibility } : f
              );
            }
            return updated;
          });
        }
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setTogglingVisibilityId(null);
    }
  };

  // ─── Handle delete ───
  const handleDeleteClick = (file: UnifiedFileItem) => {
    setDeleteTarget({ id: file.id, source: file.source });
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeletingFileId(deleteTarget.id);
    setDeleteConfirmOpen(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      let response: Response;

      if (deleteTarget.source === 'user_file') {
        response = await fetch(`/api/user-files?fileId=${deleteTarget.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } else if (deleteTarget.source === 'subject_file') {
        let subjectId = '';
        for (const [sid, files] of Object.entries(subjectFilesMap)) {
          if (files.some((f) => f.id === deleteTarget.id)) {
            subjectId = sid;
            break;
          }
        }
        response = await fetch(`/api/subjects/${subjectId}/files?fileId=${deleteTarget.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } else {
        toast.error('لا يمكن حذف هذا الملف');
        return;
      }

      const result = await response.json();
      if (!response.ok || !result.success) {
        toast.error(result.error || 'حدث خطأ أثناء حذف الملف');
      } else {
        toast.success('تم حذف الملف بنجاح');
        fetchAllData();
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setDeletingFileId(null);
      setDeleteTarget(null);
    }
  };

  // ─── Handle download ───
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
  const handlePreview = (file: UnifiedFileItem) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  // ─── Handle share dialog open ───
  const handleShareClick = (fileId: string) => {
    setSharingFileId(fileId);
    setShareSearchQuery('');
    setShareSearchResults([]);
    setSelectedShareUsers([]);
    setShareDialogOpen(true);
  };

  // ─── Debounced share search ───
  const handleShareSearchChange = (query: string) => {
    setShareSearchQuery(query);
    setShareSearchResults([]);

    if (shareSearchTimerRef.current) {
      clearTimeout(shareSearchTimerRef.current);
    }

    if (!query.trim()) return;

    shareSearchTimerRef.current = setTimeout(async () => {
      setShareSearchLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`/api/users/lookup?search=${encodeURIComponent(query.trim())}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
          const selectedIds = new Set(selectedShareUsers.map((u) => u.id));
          setShareSearchResults(
            (result.data as UserLookupResult[]).filter((u) => !selectedIds.has(u.id))
          );
        } else {
          setShareSearchResults([]);
        }
      } catch {
        setShareSearchResults([]);
      } finally {
        setShareSearchLoading(false);
      }
    }, 300);
  };

  // ─── Add user to selected share list ───
  const addShareUser = (user: UserLookupResult) => {
    if (!selectedShareUsers.some((u) => u.id === user.id)) {
      setSelectedShareUsers((prev) => [...prev, user]);
    }
    setShareSearchResults((prev) => prev.filter((u) => u.id !== user.id));
  };

  // ─── Remove user from selected share list ───
  const removeShareUser = (userId: string) => {
    setSelectedShareUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  // ─── Handle share submit ───
  const handleShareSubmit = async () => {
    if (!sharingFileId || selectedShareUsers.length === 0) {
      toast.error('يرجى اختيار مستخدم واحد على الأقل');
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
          userIds: selectedShareUsers.map((u) => u.id),
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        toast.error(result.error || 'حدث خطأ أثناء مشاركة الملف');
      } else {
        const names = selectedShareUsers.map((u) => u.name).join('، ');
        toast.success(`تمت مشاركة الملف مع ${names} بنجاح`);
        setShareDialogOpen(false);
        setShareSearchQuery('');
        setShareSearchResults([]);
        setSelectedShareUsers([]);
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setSharingInProgress(false);
    }
  };

  // ─── Handle assign to subject ───
  const handleAssignToSubject = async () => {
    if (!assigningFile || !assignSubjectId) {
      toast.error('يرجى اختيار مقرر');
      return;
    }

    setAssigningInProgress(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('يرجى تسجيل الدخول أولاً');
        return;
      }

      const response = await fetch('/api/user-files/assign-subject', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId: assigningFile.id,
          subjectId: assignSubjectId === '__none__' ? null : assignSubjectId,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        toast.error(result.error || 'حدث خطأ أثناء اسناد الملف للمقرر');
      } else {
        const subjectName = assignSubjectId === '__none__' ? '' : subjectNameMap[assignSubjectId] || '';
        toast.success(assignSubjectId === '__none__' ? 'تم إلغاء اسناد الملف' : `تم اسناد الملف لمقرر ${subjectName}`);
        setAssignDialogOpen(false);
        setAssigningFile(null);
        setAssignSubjectId('');
        // Update local state
        setAllUserFiles((prev) =>
          prev.map((f) =>
            f.id === assigningFile.id
              ? { ...f, subject_id: assignSubjectId === '__none__' ? null : assignSubjectId }
              : f
          )
        );
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setAssigningInProgress(false);
    }
  };

  // ─── Handle open assign dialog ───
  const handleOpenAssignDialog = (file: UnifiedFileItem) => {
    setAssigningFile(file);
    setAssignSubjectId(file.subject_id || '');
    setAssignDialogOpen(true);
  };

  // =====================================================
  // Render: Skeleton Loader
  // =====================================================
  const renderSkeletons = () => (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i} className="rounded-xl shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
              <div className="hidden sm:flex gap-1">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
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
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100 mb-5">
        {icon}
      </div>
      <p className="text-muted-foreground text-sm max-w-xs">{message}</p>
    </motion.div>
  );

  // =====================================================
  // Render: File Card (Compact Horizontal List-style)
  // =====================================================
  const renderFileCard = (file: UnifiedFileItem) => {
    const isDeleting = deletingFileId === file.id;
    const isToggling = togglingVisibilityId === file.id;

    return (
      <motion.div variants={itemVariants} layout>
        <Card className="rounded-xl shadow-sm hover:shadow-md transition-all duration-200 group border border-border/60 overflow-hidden">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              {/* ── Left: File type icon ── */}
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${getFileIconBg(file.file_type)}`}>
                {getFileIcon(file.file_type, 'sm')}
              </div>

              {/* ── Middle: File info ── */}
              <div className="flex-1 min-w-0">
                {/* File name row */}
                <div className="flex items-center gap-2 mb-0.5">
                  <h4 className="text-sm font-semibold text-foreground line-clamp-1 flex-1 min-w-0" title={file.file_name}>
                    {file.file_name}
                  </h4>
                  {/* Visibility badge */}
                  {file.source === 'shared' ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-blue-100 text-blue-700 shrink-0 border-0">
                      <Share2 className="h-2.5 w-2.5 ml-0.5" />
                      مشارك
                    </Badge>
                  ) : file.visibility === 'private' ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-amber-100 text-amber-700 shrink-0 border-0">
                      <Lock className="h-2.5 w-2.5 ml-0.5" />
                      خاصة
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-emerald-100 text-emerald-700 shrink-0 border-0">
                      <Globe className="h-2.5 w-2.5 ml-0.5" />
                      عام
                    </Badge>
                  )}
                </div>

                {/* Metadata row: size • date • subject badge */}
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                  <span>{formatFileSize(file.file_size)}</span>
                  <span className="text-muted-foreground/40">•</span>
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {formatArabicDateShort(file.created_at)}
                  </span>
                  {/* Subject badge inline */}
                  {file.subject_id && subjectNameMap[file.subject_id] && (
                    <>
                      <span className="text-muted-foreground/40">•</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-teal-100 text-teal-700 border-0">
                        <BookOpen className="h-2.5 w-2.5 ml-0.5" />
                        {subjectNameMap[file.subject_id]}
                      </Badge>
                    </>
                  )}
                  {file.source === 'subject_file' && file.subjectFileSubjectId && subjectNameMap[file.subjectFileSubjectId] && (
                    <>
                      <span className="text-muted-foreground/40">•</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-teal-100 text-teal-700 border-0">
                        <BookOpen className="h-2.5 w-2.5 ml-0.5" />
                        {subjectNameMap[file.subjectFileSubjectId]}
                      </Badge>
                    </>
                  )}
                  {/* Assignment submission badge */}
                  {file.assignment_id && (
                    <>
                      <span className="text-muted-foreground/40">•</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-0">
                        <ClipboardCheck className="h-2.5 w-2.5 ml-0.5" />
                        تسليم
                      </Badge>
                    </>
                  )}
                  {/* Shared by info inline */}
                  {file.source === 'shared' && file.shared_by_name && (
                    <>
                      <span className="text-muted-foreground/40">•</span>
                      <span className="text-blue-600 font-medium">
                        شاركه {file.shared_by_name}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* ── Right: Action dropdown menu ── */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" dir="rtl">
                  <DropdownMenuItem onClick={() => handlePreview(file)}>
                    <Eye className="h-4 w-4 ml-2" />
                    معاينة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload(file.file_url, file.file_name)}>
                    <Download className="h-4 w-4 ml-2" />
                    تحميل
                  </DropdownMenuItem>
                  {file.isOwn && file.source !== 'shared' && (
                    <DropdownMenuItem onClick={() => handleShareClick(file.id)}>
                      <Share2 className="h-4 w-4 ml-2" />
                      مشاركة
                    </DropdownMenuItem>
                  )}
                  {file.isOwn && file.source === 'user_file' && profile.role === 'teacher' && !file.assignment_id && (
                    <DropdownMenuItem onClick={() => handleOpenAssignDialog(file)}>
                      <BookOpen className="h-4 w-4 ml-2" />
                      اسناد لمقرر
                    </DropdownMenuItem>
                  )}
                  {file.isOwn && file.source !== 'shared' && (
                    <DropdownMenuItem
                      onClick={() => handleVisibilityToggle(file)}
                      disabled={isToggling}
                    >
                      {isToggling ? (
                        <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      ) : file.visibility === 'private' ? (
                        <Globe className="h-4 w-4 ml-2" />
                      ) : (
                        <Lock className="h-4 w-4 ml-2" />
                      )}
                      {file.visibility === 'private' ? 'جعل عاماً' : 'جعل خاصاً'}
                    </DropdownMenuItem>
                  )}
                  {file.isOwn && file.source !== 'shared' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDeleteClick(file)}
                        disabled={isDeleting}
                        className="text-rose-500 focus:text-rose-500"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 ml-2" />
                        )}
                        حذف
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
  // Render: Preview Dialog
  // =====================================================
  const renderPreviewDialog = () => {
    if (!previewFile) return null;

    const { file_url, file_type, file_name, file_size, description, notes, visibility, subject_id } = previewFile;

    return (
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              {getFileIcon(file_type)}
              <span className="line-clamp-2">{file_name}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              معاينة الملف {file_name}
            </DialogDescription>
          </DialogHeader>

          {/* Preview content */}
          <div className="overflow-auto max-h-[55vh] rounded-lg border bg-muted/30">
            {isImageType(file_type) && file_url ? (
              <div className="flex items-center justify-center p-4">
                <img
                  src={file_url}
                  alt={file_name}
                  className="max-w-full max-h-[50vh] object-contain rounded"
                />
              </div>
            ) : isPdfType(file_type) && file_url ? (
              <iframe
                src={file_url}
                className="w-full h-[50vh] rounded"
                title={file_name}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100">
                  {getFileIcon(file_type, 'lg')}
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground">{file_name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file_size)}</p>
                </div>
                <Button
                  onClick={() => handleDownload(file_url, file_name)}
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
            {description && (
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-muted-foreground shrink-0 pt-0.5">الوصف:</span>
                <p className="text-xs text-foreground">{description}</p>
              </div>
            )}
            {notes && (
              <div className="flex items-start gap-2">
                <StickyNote className="h-3.5 w-3.5 text-teal-500 shrink-0 mt-0.5" />
                <span className="text-xs font-medium text-muted-foreground shrink-0 pt-0.5">ملاحظات:</span>
                <p className="text-xs text-foreground">{notes}</p>
              </div>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span>الحجم: {formatFileSize(file_size)}</span>
              {visibility && (
                <span className="flex items-center gap-1">
                  {visibility === 'private' ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                  {visibility === 'private' ? 'خاص' : 'عام'}
                </span>
              )}
              {subject_id && subjectNameMap[subject_id] && (
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3 w-3 text-teal-500" />
                  {subjectNameMap[subject_id]}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{formatArabicDate(previewFile.created_at)}</span>
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
              onClick={() => handleDownload(file_url, file_name)}
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
  const renderUploadDialog = () => {
    const pendingCount = uploadItems.filter((i) => i.status === 'pending').length;
    const hasAnyFiles = uploadItems.length > 0;
    const allDone = uploadItems.length > 0 && uploadItems.every((i) => i.status === 'done' || i.status === 'error');
    const isUploading = uploading;

    return (
      <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
        if (!open && !isUploading) {
          resetUploadForm();
        }
        setUploadDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-xl max-h-[85vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <Upload className="h-5 w-5 text-emerald-600" />
              رفع ملفات
            </DialogTitle>
            <DialogDescription className="sr-only">
              رفع ملفات شخصية جديدة
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[65vh]">
            <div className="space-y-4 px-1">
              {/* File picker area */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">الملفات</Label>
                <div
                  className="border-2 border-dashed border-emerald-200 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors"
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                >
                  <div className="space-y-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 mx-auto">
                      <Upload className="h-6 w-6 text-emerald-600" />
                    </div>
                    <p className="text-sm text-muted-foreground">اضغط لاختيار ملفات أو اسحبها هنا</p>
                    <p className="text-xs text-muted-foreground">الحد الأقصى لكل ملف: 10 ميجابايت</p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  accept="*/*"
                  multiple
                />
              </div>

              {/* File list */}
              {hasAnyFiles && (
                <div className="space-y-2 max-h-60 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20">
                  <AnimatePresence mode="popLayout">
                    {uploadItems.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Card className={`rounded-xl border ${
                          item.status === 'done' ? 'border-emerald-200 bg-emerald-50/30' :
                          item.status === 'error' ? 'border-rose-200 bg-rose-50/30' :
                          item.status === 'uploading' ? 'border-amber-200 bg-amber-50/30' :
                          'border-border'
                        }`}>
                          <CardContent className="p-3">
                            <div className="flex items-start gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background border mt-0.5">
                                {item.status === 'done' ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                ) : item.status === 'uploading' ? (
                                  <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
                                ) : item.status === 'error' ? (
                                  <AlertCircle className="h-4 w-4 text-rose-500" />
                                ) : (
                                  getFileIcon(item.file.type)
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs text-muted-foreground line-clamp-2" title={item.file.name}>
                                    {item.file.name}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    ({formatFileSize(item.file.size)})
                                  </span>
                                </div>
                                <Input
                                  value={item.customName}
                                  onChange={(e) => updateUploadItem(item.id, { customName: e.target.value })}
                                  placeholder="اسم الملف"
                                  className="text-xs h-7"
                                  disabled={isUploading || item.status === 'done'}
                                  dir="rtl"
                                />
                                {item.originalExtension && (
                                  <span className="text-[10px] text-muted-foreground mt-0.5 block">
                                    الامتداد: .{item.originalExtension}
                                  </span>
                                )}
                                {item.status === 'uploading' && (
                                  <Progress value={item.progress} className="h-1.5 mt-1.5" />
                                )}
                                {item.status === 'error' && item.errorMessage && (
                                  <p className="text-[10px] text-rose-500 mt-1">{item.errorMessage}</p>
                                )}
                              </div>

                              {!isUploading && item.status !== 'done' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-500 shrink-0 mt-0.5"
                                  onClick={() => removeUploadItem(item.id)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Shared fields */}
              {hasAnyFiles && (
                <>
                  {/* Visibility */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">الظهور</Label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setUploadVisibility('private')}
                        disabled={isUploading}
                        className={`flex-1 flex items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-medium transition-all ${
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
                        disabled={isUploading}
                        className={`flex-1 flex items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-medium transition-all ${
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

                  {/* Subject selector */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5 text-teal-500" />
                      المقرر
                    </Label>
                    <Select
                      value={uploadSubjectId}
                      onValueChange={setUploadSubjectId}
                      disabled={isUploading || subjects.length === 0}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder={subjects.length === 0 ? 'بدون مقرر' : 'اختر مقرراً (اختياري)'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">بدون مقرر</SelectItem>
                        {subjects.map((subject) => (
                          <SelectItem key={subject.id} value={subject.id}>
                            {subject.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">الوصف</Label>
                    <Textarea
                      value={uploadDescription}
                      onChange={(e) => setUploadDescription(e.target.value)}
                      placeholder="وصف مختصر للملفات (اختياري)"
                      className="text-sm resize-none"
                      rows={2}
                      disabled={isUploading}
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
                      disabled={isUploading}
                    />
                  </div>
                </>
              )}

              {/* Overall progress */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      جارٍ الرفع... ({overallProgress.completed}/{overallProgress.total} ملفات)
                    </span>
                    <span className="font-medium text-emerald-700">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              {/* All done message */}
              {allDone && !isUploading && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-700">
                    تم الانتهاء من رفع الملفات
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (!isUploading) {
                  resetUploadForm();
                  setUploadDialogOpen(false);
                }
              }}
              disabled={isUploading}
              size="sm"
            >
              {allDone ? 'إغلاق' : 'إلغاء'}
            </Button>
            {!allDone && (
              <Button
                onClick={handleUpload}
                disabled={isUploading || pendingCount === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                size="sm"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-1.5 animate-spin" />
                    جارٍ الرفع...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 ml-1.5" />
                    رفع {pendingCount > 0 ? `${pendingCount} ملف${pendingCount > 1 ? 'ات' : ''}` : 'الملفات'}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // =====================================================
  // Render: Share Dialog (Multi-select)
  // =====================================================
  const renderShareDialog = () => (
    <Dialog open={shareDialogOpen} onOpenChange={(open) => {
      if (!open && !sharingInProgress) {
        setShareSearchQuery('');
        setShareSearchResults([]);
        setSelectedShareUsers([]);
      }
      setShareDialogOpen(open);
    }}>
      <DialogContent className="sm:max-w-md max-h-[85vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <Share2 className="h-5 w-5 text-blue-600" />
            مشاركة الملف
          </DialogTitle>
          <DialogDescription className="sr-only">
            مشاركة الملف مع مستخدمين آخرين
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">البحث عن مستخدم</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={shareSearchQuery}
                onChange={(e) => handleShareSearchChange(e.target.value)}
                placeholder="ابحث بالاسم أو البريد الإلكتروني"
                className="pr-9 text-sm"
                dir="rtl"
                disabled={sharingInProgress}
              />
              {shareSearchLoading && (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-emerald-600" />
              )}
            </div>
          </div>

          {/* Search results */}
          {shareSearchResults.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1 border rounded-xl p-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20">
              {shareSearchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => addShareUser(user)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-emerald-50 transition-colors text-right"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 border border-emerald-200">
                    <User className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-1">{user.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span dir="ltr">{user.email}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 border-0">
                        {user.role === 'teacher' ? 'معلم' :
                         user.role === 'student' ? 'طالب' :
                         user.role === 'admin' ? 'مدير' : user.role}
                      </Badge>
                    </div>
                  </div>
                  <Plus className="h-4 w-4 text-emerald-500 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* No results hint */}
          {shareSearchQuery.trim().length > 2 && !shareSearchLoading && shareSearchResults.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-rose-500">
              <AlertCircle className="h-3.5 w-3.5" />
              لم يتم العثور على مستخدمين
            </div>
          )}

          {/* Selected users chips */}
          {selectedShareUsers.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">المستخدمون المحددون</Label>
              <div className="flex flex-wrap gap-2">
                {selectedShareUsers.map((user) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1.5 bg-emerald-100 text-emerald-700 rounded-full px-3 py-1.5 text-xs font-medium"
                  >
                    <User className="h-3 w-3" />
                    <span>{user.name}</span>
                    <button
                      onClick={() => removeShareUser(user.id)}
                      className="hover:text-rose-600 transition-colors mr-0.5"
                      disabled={sharingInProgress}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (!sharingInProgress) {
                setShareSearchQuery('');
                setShareSearchResults([]);
                setSelectedShareUsers([]);
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
            disabled={sharingInProgress || selectedShareUsers.length === 0}
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
                مشاركة مع {selectedShareUsers.length} مستخدم
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
  // Render: Assign to Subject Dialog
  // =====================================================
  const renderAssignDialog = () => (
    <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-right">
            <BookOpen className="h-5 w-5 text-emerald-600" />
            اسناد الملف لمقرر
          </DialogTitle>
          <DialogDescription className="sr-only">
            اسناد الملف {assigningFile?.file_name} لمقرر دراسي
          </DialogDescription>
        </DialogHeader>

        {assigningFile && (
          <div className="space-y-4">
            {/* File info */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${getFileIconBg(assigningFile.file_type)}`}>
                {getFileIcon(assigningFile.file_type, 'sm')}
              </div>
              <p className="text-sm font-medium line-clamp-2">{assigningFile.file_name}</p>
            </div>

            {/* Current assignment */}
            {assigningFile.subject_id && subjectNameMap[assigningFile.subject_id] && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>الاسناد الحالي:</span>
                <Badge variant="secondary" className="bg-teal-100 text-teal-700 border-0">
                  <BookOpen className="h-3 w-3 ml-0.5" />
                  {subjectNameMap[assigningFile.subject_id]}
                </Badge>
              </div>
            )}

            {/* Subject selector */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">اختر المقرر</Label>
              <Select value={assignSubjectId} onValueChange={setAssignSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مقرر للاسناد" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">بدون اسناد</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setAssignDialogOpen(false)} size="sm">
            إلغاء
          </Button>
          <Button
            onClick={handleAssignToSubject}
            disabled={assigningInProgress || !assignSubjectId}
            className="bg-emerald-600 hover:bg-emerald-700"
            size="sm"
          >
            {assigningInProgress ? (
              <Loader2 className="h-4 w-4 animate-spin ml-1.5" />
            ) : (
              <BookOpen className="h-4 w-4 ml-1.5" />
            )}
            {assignSubjectId === '__none__' ? 'إلغاء الاسناد' : 'اسناد'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // =====================================================
  // Main Render
  // =====================================================
  return (
    <div className="space-y-5" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 border border-emerald-200">
            <FolderOpen className="h-4.5 w-4.5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">ملفاتي</h3>
            <p className="text-[11px] text-muted-foreground">
              {unifiedFiles.length} ملف إجمالي
            </p>
          </div>
        </div>
        <Button
          onClick={() => setUploadDialogOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 rounded-xl shadow-sm"
          size="sm"
        >
          <Plus className="h-3.5 w-3.5 ml-1" />
          رفع ملفات
        </Button>
      </div>

      {/* ── Search bar ── */}
      <div className="relative">
        <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث بالاسم، الوصف، الملاحظات، التاريخ (اليوم، أمس، هذا الأسبوع، هذا الشهر)..."
          className="pr-10 text-sm h-11 rounded-xl border-emerald-200 focus:border-emerald-400 focus:ring-emerald-200"
          dir="rtl"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── File type tabs (pill buttons, horizontally scrollable) ── */}
      <div className="overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20">
        <div className="flex gap-2 min-w-max">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab;
            const count = categoryFileCounts[tab] || 0;

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full transition-all whitespace-nowrap border ${
                  isActive
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-background text-muted-foreground border-border hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50/50'
                }`}
              >
                <span className={isActive ? 'text-white' : ''}>
                  {getCategoryIcon(tab, 'sm')}
                </span>
                <span>{tab}</span>
                <span className={`text-[10px] px-1.5 py-0 rounded-full min-w-[20px] flex items-center justify-center ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── File list ── */}
      {loading ? (
        renderSkeletons()
      ) : filteredFiles.length === 0 ? (
        renderEmptyState(
          searchQuery
            ? 'لا توجد نتائج مطابقة للبحث'
            : activeTab === FILE_CATEGORY_ALL
              ? 'لا توجد ملفات بعد. ارفع ملفاً جديداً للبدء.'
              : `لا توجد ملفات من نوع "${activeTab}".`,
          searchQuery
            ? <Search className="h-8 w-8 text-muted-foreground" />
            : activeTab === FILE_CATEGORY_ALL
              ? <FolderOpen className="h-8 w-8 text-emerald-500" />
              : getCategoryIcon(activeTab, 'lg')
        )
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {filteredFiles.map((file) => renderFileCard(file))}
        </motion.div>
      )}

      {/* ── Dialogs ── */}
      {renderPreviewDialog()}
      {renderUploadDialog()}
      {renderShareDialog()}
      {renderDeleteDialog()}
      {renderAssignDialog()}
    </div>
  );
}
