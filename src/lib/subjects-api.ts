// =====================================================
// Examy - Subjects API Helper Functions
// Utility module that wraps Supabase calls for subjects CRUD
// =====================================================

import { supabase } from '@/lib/supabase';
import type {
  Subject,
  SubjectStudent,
  SubjectFile,
  SubjectNote,
  Notification,
  UserProfile,
} from '@/lib/types';

// =====================================================
// Error handling helper
// =====================================================

class SubjectsApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'SubjectsApiError';
    this.code = code;
  }
}

function handleError(error: { message: string; code?: string }, fallbackMessage: string): never {
  throw new SubjectsApiError(error.message || fallbackMessage, error.code);
}

// =====================================================
// SUBJECTS
// =====================================================

/**
 * Get all subjects for a teacher, enriched with student_count and teacher_name.
 */
export async function getTeacherSubjects(teacherId: string): Promise<Subject[]> {
  // Fetch subjects
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });

  if (error) handleError(error, 'Failed to fetch teacher subjects');

  const subjects = (data as Subject[]) || [];

  if (subjects.length === 0) return [];

  // Batch-fetch student counts
  const subjectIds = subjects.map((s) => s.id);
  const { data: enrollments } = await supabase
    .from('subject_students')
    .select('subject_id')
    .in('subject_id', subjectIds);

  const countMap: Record<string, number> = {};
  (enrollments as { subject_id: string }[])?.forEach((e) => {
    countMap[e.subject_id] = (countMap[e.subject_id] || 0) + 1;
  });

  return subjects.map((s) => ({
    ...s,
    student_count: countMap[s.id] || 0,
    teacher_name: undefined, // teacher is the current user
  }));
}

/**
 * Get all subjects a student is enrolled in, enriched with teacher_name and enrollment date.
 */
export async function getStudentSubjects(studentId: string): Promise<Subject[]> {
  // Fetch enrollments
  const { data: enrollments, error: enrollError } = await supabase
    .from('subject_students')
    .select('subject_id, enrolled_at')
    .eq('student_id', studentId);

  if (enrollError) handleError(enrollError, 'Failed to fetch student enrollments');

  if (!enrollments || enrollments.length === 0) return [];

  const subjectIds = enrollments.map((e: { subject_id: string }) => e.subject_id);

  // Fetch subject details
  const { data: subjectsData, error: subjectsError } = await supabase
    .from('subjects')
    .select('*')
    .in('id', subjectIds)
    .order('created_at', { ascending: false });

  if (subjectsError) handleError(subjectsError, 'Failed to fetch enrolled subjects');

  const subjects = (subjectsData as Subject[]) || [];

  // Fetch teacher names
  const teacherIds = [...new Set(subjects.map((s) => s.teacher_id))];
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

  // Build enrollment date map
  const enrollmentMap = new Map(
    enrollments.map((e: { subject_id: string; enrolled_at: string }) => [
      e.subject_id,
      e.enrolled_at,
    ]),
  );

  // Batch-fetch student counts
  const { data: allEnrollments } = await supabase
    .from('subject_students')
    .select('subject_id')
    .in('subject_id', subjectIds);

  const countMap: Record<string, number> = {};
  (allEnrollments as { subject_id: string }[])?.forEach((e) => {
    countMap[e.subject_id] = (countMap[e.subject_id] || 0) + 1;
  });

  return subjects.map((s) => ({
    ...s,
    teacher_name: teacherMap[s.teacher_id] || 'معلم',
    student_count: countMap[s.id] || 0,
    // Attach enrolled_at for student view (stored as _enrolled_at convention)
    _enrolled_at: enrollmentMap.get(s.id) || s.created_at,
  }));
}

/**
 * Create a new subject.
 */
export async function createSubject(data: {
  teacher_id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}): Promise<Subject> {
  const { data: subject, error } = await supabase
    .from('subjects')
    .insert({
      teacher_id: data.teacher_id,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      color: data.color || '#10B981',
      icon: data.icon || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) handleError(error, 'Failed to create subject');

  return {
    ...(subject as Subject),
    student_count: 0,
  };
}

/**
 * Update a subject (teacher only).
 */
export async function updateSubject(
  id: string,
  data: Partial<Pick<Subject, 'name' | 'description' | 'color' | 'icon' | 'is_active'>>,
): Promise<Subject> {
  const updateData: Record<string, unknown> = {
    ...data,
    updated_at: new Date().toISOString(),
  };

  // Trim strings if provided
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description?.trim() || null;

  const { data: subject, error } = await supabase
    .from('subjects')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) handleError(error, 'Failed to update subject');

  return subject as Subject;
}

/**
 * Delete a subject (teacher only). Cascading deletes handle related data.
 */
export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.from('subjects').delete().eq('id', id);

  if (error) handleError(error, 'Failed to delete subject');
}

/**
 * Get a single subject by ID with enriched data.
 */
export async function getSubjectById(subjectId: string): Promise<Subject | null> {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('id', subjectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    handleError(error, 'Failed to fetch subject');
  }

  const subject = data as Subject;

  // Fetch teacher name
  const { data: teacher } = await supabase
    .from('users')
    .select('name')
    .eq('id', subject.teacher_id)
    .single();

  // Fetch student count
  const { count } = await supabase
    .from('subject_students')
    .select('*', { count: 'exact', head: true })
    .eq('subject_id', subjectId);

  return {
    ...subject,
    teacher_name: (teacher as { name: string })?.name || 'معلم',
    student_count: count || 0,
  };
}

// =====================================================
// ENROLLMENT
// =====================================================

/**
 * Enroll a student in a subject.
 */
export async function enrollInSubject(subjectId: string, studentId: string): Promise<void> {
  const { error } = await supabase.from('subject_students').insert({
    subject_id: subjectId,
    student_id: studentId,
  });

  if (error) {
    if (error.code === '23505') {
      throw new SubjectsApiError('Student is already enrolled in this subject', '23505');
    }
    handleError(error, 'Failed to enroll in subject');
  }
}

/**
 * Unenroll a student from a subject.
 */
export async function unenrollFromSubject(subjectId: string, studentId: string): Promise<void> {
  const { error } = await supabase
    .from('subject_students')
    .delete()
    .eq('subject_id', subjectId)
    .eq('student_id', studentId);

  if (error) handleError(error, 'Failed to unenroll from subject');
}

/**
 * Get all students enrolled in a subject, with their profile data.
 */
export async function getSubjectStudents(subjectId: string): Promise<SubjectStudent[]> {
  const { data, error } = await supabase
    .from('subject_students')
    .select('id, subject_id, student_id, enrolled_at')
    .eq('subject_id', subjectId)
    .order('enrolled_at', { ascending: true });

  if (error) handleError(error, 'Failed to fetch subject students');

  const enrollments = (data as SubjectStudent[]) || [];

  if (enrollments.length === 0) return [];

  // Batch-fetch student profiles
  const studentIds = enrollments.map((e) => e.student_id);
  const { data: students } = await supabase
    .from('users')
    .select('id, name, email')
    .in('id', studentIds);

  const studentMap = new Map<string, { name: string; email: string }>();
  (students as { id: string; name: string; email: string }[])?.forEach((s) => {
    studentMap.set(s.id, { name: s.name, email: s.email });
  });

  return enrollments.map((e) => ({
    ...e,
    student_name: studentMap.get(e.student_id)?.name,
    student_email: studentMap.get(e.student_id)?.email,
  }));
}

// =====================================================
// NOTES
// =====================================================

/**
 * Get all notes for a subject, with view counts.
 */
export async function getSubjectNotes(subjectId: string): Promise<SubjectNote[]> {
  const { data, error } = await supabase
    .from('subject_notes')
    .select('*')
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false });

  if (error) handleError(error, 'Failed to fetch subject notes');

  const notes = (data as SubjectNote[]) || [];

  if (notes.length === 0) return [];

  // Batch-fetch view counts for all notes
  const noteIds = notes.map((n) => n.id);
  const { data: viewCounts } = await supabase
    .from('note_views')
    .select('note_id')
    .in('note_id', noteIds);

  const countMap: Record<string, number> = {};
  (viewCounts as { note_id: string }[])?.forEach((v) => {
    countMap[v.note_id] = (countMap[v.note_id] || 0) + 1;
  });

  return notes.map((n) => ({
    ...n,
    view_count: countMap[n.id] || 0,
  }));
}

/**
 * Create a new note (teacher only).
 */
export async function createSubjectNote(data: {
  subject_id: string;
  teacher_id: string;
  title: string;
  content: string;
}): Promise<SubjectNote> {
  const { data: note, error } = await supabase
    .from('subject_notes')
    .insert({
      subject_id: data.subject_id,
      teacher_id: data.teacher_id,
      title: data.title.trim(),
      content: data.content,
    })
    .select()
    .single();

  if (error) handleError(error, 'Failed to create note');

  return {
    ...(note as SubjectNote),
    view_count: 0,
  };
}

/**
 * Update a note (teacher only).
 */
export async function updateSubjectNote(
  id: string,
  data: Partial<Pick<SubjectNote, 'title' | 'content'>>,
): Promise<SubjectNote> {
  const updateData: Record<string, unknown> = {
    ...data,
    updated_at: new Date().toISOString(),
  };

  if (data.title !== undefined) updateData.title = data.title.trim();

  const { data: note, error } = await supabase
    .from('subject_notes')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) handleError(error, 'Failed to update note');

  return note as SubjectNote;
}

/**
 * Delete a note (teacher only).
 */
export async function deleteSubjectNote(id: string): Promise<void> {
  const { error } = await supabase.from('subject_notes').delete().eq('id', id);

  if (error) handleError(error, 'Failed to delete note');
}

/**
 * Record a note view (idempotent — unique per user+note).
 */
export async function recordNoteView(noteId: string, userId: string): Promise<void> {
  // Use upsert-like approach: try insert, ignore if already viewed
  const { error } = await supabase.from('note_views').insert({
    note_id: noteId,
    user_id: userId,
  });

  // Ignore unique constraint violation (23505) — already viewed
  if (error && error.code !== '23505') {
    handleError(error, 'Failed to record note view');
  }
}

// =====================================================
// FILES
// =====================================================

/** Storage bucket name for subject files */
const SUBJECT_FILES_BUCKET = 'subject-files';

/**
 * Get all files for a subject.
 */
export async function getSubjectFiles(subjectId: string): Promise<SubjectFile[]> {
  const { data, error } = await supabase
    .from('subject_files')
    .select('*')
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false });

  if (error) handleError(error, 'Failed to fetch subject files');

  return (data as SubjectFile[]) || [];
}

/**
 * Upload a file to a subject (teacher only).
 * Uploads to Supabase Storage and creates a DB record.
 */
export async function uploadSubjectFile(
  subjectId: string,
  teacherId: string,
  file: File,
): Promise<SubjectFile> {
  // Generate a unique storage path
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${subjectId}/${timestamp}-${sanitizedName}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(SUBJECT_FILES_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) handleError(uploadError, 'Failed to upload file to storage');

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(SUBJECT_FILES_BUCKET)
    .getPublicUrl(storagePath);

  const fileUrl = urlData.publicUrl;

  // Create DB record
  const { data: fileRecord, error: dbError } = await supabase
    .from('subject_files')
    .insert({
      subject_id: subjectId,
      uploaded_by: teacherId,
      file_name: file.name,
      file_url: fileUrl,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
    })
    .select()
    .single();

  if (dbError) {
    // Attempt to clean up uploaded file if DB insert fails
    await supabase.storage.from(SUBJECT_FILES_BUCKET).remove([storagePath]);
    handleError(dbError, 'Failed to create file record');
  }

  return fileRecord as SubjectFile;
}

/**
 * Delete a file (teacher only).
 * Removes from storage and DB.
 */
export async function deleteSubjectFile(id: string): Promise<void> {
  // First get the file record to know the storage path
  const { data: fileRecord, error: fetchError } = await supabase
    .from('subject_files')
    .select('file_url')
    .eq('id', id)
    .single();

  if (fetchError) handleError(fetchError, 'Failed to find file record');

  // Extract storage path from URL
  // URL format: https://{project}.supabase.co/storage/v1/object/public/subject-files/{path}
  const fileUrl = (fileRecord as { file_url: string }).file_url;
  try {
    const urlParts = fileUrl.split(`/object/public/${SUBJECT_FILES_BUCKET}/`);
    if (urlParts.length > 1) {
      const storagePath = urlParts[1];
      // Remove from storage (best-effort)
      await supabase.storage.from(SUBJECT_FILES_BUCKET).remove([storagePath]);
    }
  } catch {
    // Storage deletion failure shouldn't block DB deletion
  }

  // Delete DB record
  const { error } = await supabase.from('subject_files').delete().eq('id', id);

  if (error) handleError(error, 'Failed to delete file record');
}

// =====================================================
// NOTIFICATIONS
// =====================================================

/**
 * Get all notifications for a user.
 */
export async function getUserNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) handleError(error, 'Failed to fetch notifications');

  return (data as Notification[]) || [];
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) handleError(error, 'Failed to count unread notifications');

  return count || 0;
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationAsRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);

  if (error) handleError(error, 'Failed to mark notification as read');
}

/**
 * Mark multiple notifications as read.
 */
export async function markNotificationsAsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .in('id', ids);

  if (error) handleError(error, 'Failed to mark notifications as read');
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) handleError(error, 'Failed to mark all notifications as read');
}

/**
 * Delete a single notification.
 */
export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', id);

  if (error) handleError(error, 'Failed to delete notification');
}

// =====================================================
// SUBJECT DETAIL HELPERS
// =====================================================

/**
 * Get subjects by teacher code (for student enrollment search).
 * Returns available subjects from a teacher matching the code.
 */
export async function getSubjectsByTeacherCode(
  teacherCode: string,
  excludeSubjectIds: string[] = [],
): Promise<Subject[]> {
  // Find teacher by code
  const { data: teacherData, error: teacherError } = await supabase
    .from('users')
    .select('id, name')
    .eq('teacher_code', teacherCode)
    .eq('role', 'teacher')
    .single();

  if (teacherError || !teacherData) {
    throw new SubjectsApiError('Teacher not found with this code', 'NOT_FOUND');
  }

  const teacher = teacherData as { id: string; name: string };

  // Fetch active subjects for this teacher
  let query = supabase
    .from('subjects')
    .select('*')
    .eq('teacher_id', teacher.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  // Exclude already-enrolled subjects
  if (excludeSubjectIds.length > 0) {
    query = query.not('id', 'in', `(${excludeSubjectIds.join(',')})`);
  }

  const { data: subjectsData, error: subjectsError } = await query;

  if (subjectsError) handleError(subjectsError, 'Failed to fetch teacher subjects');

  const subjects = (subjectsData as Subject[]) || [];

  return subjects.map((s) => ({
    ...s,
    teacher_name: teacher.name,
  }));
}

/**
 * Get a subject with full detail for the subject detail page.
 * Includes: teacher info, student count, note count, file count.
 */
export async function getSubjectDetail(subjectId: string): Promise<{
  subject: Subject;
  studentCount: number;
  noteCount: number;
  fileCount: number;
  teacherProfile: Pick<UserProfile, 'id' | 'name' | 'email' | 'teacher_code'> | null;
}> {
  const subject = await getSubjectById(subjectId);
  if (!subject) {
    throw new SubjectsApiError('Subject not found', 'NOT_FOUND');
  }

  // Fetch teacher profile
  const { data: teacherProfile } = await supabase
    .from('users')
    .select('id, name, email, teacher_code')
    .eq('id', subject.teacher_id)
    .single();

  // Fetch counts in parallel
  const [studentCountResult, noteCountResult, fileCountResult] = await Promise.all([
    supabase
      .from('subject_students')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subjectId),
    supabase
      .from('subject_notes')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subjectId),
    supabase
      .from('subject_files')
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subjectId),
  ]);

  return {
    subject,
    studentCount: studentCountResult.count || 0,
    noteCount: noteCountResult.count || 0,
    fileCount: fileCountResult.count || 0,
    teacherProfile: teacherProfile as Pick<UserProfile, 'id' | 'name' | 'email' | 'teacher_code'> | null,
  };
}

// =====================================================
// EXPORTS
// =====================================================

export { SubjectsApiError };
