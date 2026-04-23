'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Users,
  File,
  ClipboardCheck,
  Calendar,
  Clock,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import StatCard from '@/components/shared/stat-card';
import type { UserProfile, Subject, Lecture, SubjectFile } from '@/lib/types';

// -------------------------------------------------------
// Props
// -------------------------------------------------------
interface OverviewTabProps {
  profile: UserProfile;
  role: 'teacher' | 'student';
  subjectId: string;
  subject: Subject;
  teacherName: string;
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

// -------------------------------------------------------
// Helper: format date
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
// Main Component
// -------------------------------------------------------
export default function OverviewTab({ profile, role, subjectId, subject }: OverviewTabProps) {
  const [stats, setStats] = useState({
    totalLectures: 0,
    totalStudents: 0,
    totalFiles: 0,
    totalAssignments: 0,
  });
  const [recentLectures, setRecentLectures] = useState<Lecture[]>([]);
  const [recentFiles, setRecentFiles] = useState<SubjectFile[]>([]);
  const [loading, setLoading] = useState(true);

  // -------------------------------------------------------
  // Fetch overview data
  // -------------------------------------------------------
  const fetchOverviewData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all data in parallel for better performance
      const [lecturesResult, studentsResult, filesResult, assignmentsResult] = await Promise.all([
        supabase.from('lectures').select('*').eq('subject_id', subjectId).order('created_at', { ascending: false }),
        supabase.from('subject_students').select('*', { count: 'exact', head: true }).eq('subject_id', subjectId),
        supabase.from('subject_files').select('*').eq('subject_id', subjectId).order('created_at', { ascending: false }),
        supabase.from('assignments').select('*', { count: 'exact', head: true }).eq('subject_id', subjectId),
      ]);

      const lectures = (lecturesResult.data as Lecture[]) || [];
      setRecentLectures(lectures.slice(0, 3));

      const files = (filesResult.data as SubjectFile[]) || [];
      setRecentFiles(files.slice(0, 3));

      setStats({
        totalLectures: lectures.length,
        totalStudents: studentsResult.count || 0,
        totalFiles: files.length,
        totalAssignments: assignmentsResult.count || 0,
      });
    } catch (err) {
      console.error('Fetch overview data error:', err);
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  // -------------------------------------------------------
  // Loading state
  // -------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Quick Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          icon={<BookOpen className="h-5 w-5" />}
          label="المحاضرات"
          value={stats.totalLectures}
          color="emerald"
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="الطلاب"
          value={stats.totalStudents}
          color="teal"
        />
        <StatCard
          icon={<File className="h-5 w-5" />}
          label="الملفات"
          value={stats.totalFiles}
          color="amber"
        />
        <StatCard
          icon={<ClipboardCheck className="h-5 w-5" />}
          label="المهام"
          value={stats.totalAssignments}
          color="rose"
        />
      </motion.div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest Lectures */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-emerald-600" />
                أحدث المحاضرات
              </h3>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {recentLectures.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  لا توجد محاضرات بعد
                </div>
              ) : (
                <div className="divide-y">
                  {recentLectures.map((lecture) => (
                    <div key={lecture.id} className="flex items-center gap-3 p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                        <BookOpen className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{lecture.title}</p>
                        {lecture.lecture_date && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(lecture.lecture_date)}
                            {(lecture.description?.match(/__LECTURE_TIME__:([0-9]{1,2}:[0-9]{2})__/) || [])[1] && (
                              <span className="text-emerald-700 font-medium flex items-center gap-0.5">
                                <Clock className="h-3 w-3" />
                                {(() => {
                                  const t = lecture.description!.match(/__LECTURE_TIME__:([0-9]{1,2}:[0-9]{2})__/)![1];
                                  const [h, m] = t.split(':').map(Number);
                                  const p = h >= 12 ? 'م' : 'ص';
                                  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                                  return `${h12}:${m.toString().padStart(2, '0')} ${p}`;
                                })()}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Latest Files */}
        <motion.div variants={itemVariants}>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <File className="h-4 w-4 text-amber-600" />
                أحدث الملفات
              </h3>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {recentFiles.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  لا توجد ملفات بعد
                </div>
              ) : (
                <div className="divide-y">
                  {recentFiles.map((file) => (
                    <div key={file.id} className="flex items-center gap-3 p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                        <File className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{file.file_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(file.created_at)}
                        </p>
                      </div>
                      {file.category && (
                        <span className="shrink-0 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-medium">
                          {file.category}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
