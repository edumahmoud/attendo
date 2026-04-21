// =====================================================
// Examy - TypeScript Type Definitions
// =====================================================

// New role type - add 'admin'
export type UserRole = 'student' | 'teacher' | 'admin' | 'pending' | 'disabled';

// Update UserProfile to include new fields
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  title_id?: string;
  gender?: 'male' | 'female';
  is_admin?: boolean;
  fcm_token?: string;
  teacher_code?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface TeacherStudentLink {
  id: string;
  teacher_id: string;
  student_id: string;
  created_at: string;
}

export interface Summary {
  id: string;
  user_id: string;
  title: string;
  original_content: string;
  summary_content: string;
  created_at: string;
}

export interface QuizQuestion {
  type: 'mcq' | 'boolean' | 'completion' | 'matching';
  question: string;
  options?: string[];
  correctAnswer?: string;
  pairs?: { key: string; value: string }[];
}

export interface Quiz {
  id: string;
  user_id: string;
  title: string;
  duration?: number;
  scheduled_date?: string;
  scheduled_time?: string;
  summary_id?: string;
  subject_id?: string;
  questions: QuizQuestion[];
  allow_retake?: boolean;
  results_visible?: boolean;
  created_at: string;
  // Joined data
  subject_name?: string;
}

export interface UserAnswer {
  questionIndex: number;
  type: string;
  answer: string | Record<string, string>;
  isCorrect: boolean;
}

export interface Score {
  id: string;
  student_id: string;
  teacher_id: string;
  quiz_id: string;
  quiz_title: string;
  score: number;
  total: number;
  user_answers: UserAnswer[];
  completed_at: string;
}

// New types for subjects
export interface UserTitle {
  id: string;
  title: string;
  is_active: boolean;
}

export interface Subject {
  id: string;
  teacher_id: string;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  subject_code?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined data (not in DB)
  teacher_name?: string;
  student_count?: number;
  _enrolled_at?: string;
}

export interface SubjectStudent {
  id: string;
  subject_id: string;
  student_id: string;
  enrolled_at: string;
  // Joined data
  student_name?: string;
  student_email?: string;
}

export interface SubjectFile {
  id: string;
  subject_id: string;
  uploaded_by: string;
  file_name: string;
  file_url: string;
  file_type?: string;
  file_size?: number;
  visibility?: 'public' | 'private';
  category?: string;
  description?: string;
  created_at: string;
  // Joined data
  uploader_name?: string;
}

// Personal user file (optionally linked to a subject or assignment submission)
export interface UserFile {
  id: string;
  user_id: string;
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
  updated_at: string;
}

// File share record
export interface FileShare {
  id: string;
  file_id: string;
  file_type: 'subject_file' | 'user_file';
  shared_by: string;
  shared_with: string;
  created_at: string;
  // Joined data
  shared_with_name?: string;
  shared_with_email?: string;
  shared_with_role?: string;
  shared_by_name?: string;
  file_name?: string;
  file_url?: string;
}

// Assignment for a subject
export interface Assignment {
  id: string;
  subject_id: string;
  teacher_id: string;
  title: string;
  description: string;
  deadline?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  submission_count?: number;
  student_submitted?: boolean;
}

// Student submission for an assignment
export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  file_name?: string;
  file_url?: string;
  file_type?: string;
  file_size?: number;
  notes?: string;
  submitted_at: string;
  // Joined data
  student_name?: string;
  student_email?: string;
}

export interface SubjectNote {
  id: string;
  subject_id: string;
  teacher_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  // Joined data
  view_count?: number;
}

export interface NoteView {
  id: string;
  note_id: string;
  user_id: string;
  viewed_at: string;
}

export interface Lecture {
  id: string;
  subject_id: string;
  teacher_id: string;
  title: string;
  description?: string;
  qr_code?: string;
  latitude?: number;
  longitude?: number;
  is_active: boolean;
  max_distance_meters: number;
  started_at?: string;
  ended_at?: string;
  created_at: string;
  // Joined data
  subject_name?: string;
  attendance_count?: number;
  in_range_count?: number;
}

export interface LectureAttendance {
  id: string;
  lecture_id: string;
  student_id: string;
  student_latitude?: number;
  student_longitude?: number;
  distance_meters?: number;
  is_within_range?: boolean;
  attended_at: string;
  // Joined data
  student_name?: string;
  student_email?: string;
}

export interface LectureNote {
  id: string;
  lecture_id: string;
  teacher_id: string;
  content: string;
  visibility: 'public' | 'private';
  created_at: string;
}

export interface Message {
  id: string;
  subject_id?: string;
  sender_id: string;
  receiver_id?: string;
  content: string;
  message_type: string;
  created_at: string;
  // Joined data
  sender_name?: string;
  sender_email?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  content: string;
  type: 'quiz' | 'note' | 'message' | 'lecture' | 'system' | 'assignment';
  reference_id?: string;
  is_read: boolean;
  created_at: string;
}

// Update AppPage type to include new pages
export type AppPage = 
  | 'auth' 
  | 'role-selection' 
  | 'student-dashboard' 
  | 'teacher-dashboard'
  | 'admin-dashboard'
  | 'quiz' 
  | 'summary'
  | 'subject-detail';

// Update section types
export type StudentSection = 'dashboard' | 'subjects' | 'summaries' | 'quizzes' | 'teachers' | 'chat' | 'analytics' | 'lectures' | 'notifications' | 'personal-files' | 'settings';
export type TeacherSection = 'dashboard' | 'subjects' | 'students' | 'quizzes' | 'analytics' | 'chat' | 'lectures' | 'notifications' | 'personal-files' | 'settings';

// Helper to check if user has a valid (non-pending) role
export function isActiveRole(role: UserRole): role is 'student' | 'teacher' | 'admin' {
  return role === 'student' || role === 'teacher' || role === 'admin';
}

export type AdminSection = 'dashboard' | 'users' | 'subjects' | 'quizzes' | 'settings';

// Subject detail sub-sections
export type SubjectSection = 'overview' | 'notes' | 'files' | 'quizzes' | 'lectures' | 'chat' | 'students' | 'assignments';

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GenerateSummaryResponse {
  summary: string;
}

export interface GenerateQuizResponse {
  questions: QuizQuestion[];
}

export interface EvaluateAnswerResponse {
  isCorrect: boolean;
}
