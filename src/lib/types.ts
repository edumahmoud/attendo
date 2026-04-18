// =====================================================
// Examy (EduAI) - TypeScript Type Definitions
// =====================================================

export type UserRole = 'student' | 'teacher';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
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
  questions: QuizQuestion[];
  created_at: string;
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

// App navigation state
export type AppPage = 
  | 'auth' 
  | 'role-selection' 
  | 'student-dashboard' 
  | 'teacher-dashboard'
  | 'quiz'
  | 'summary';

export type StudentSection = 'dashboard' | 'summaries' | 'quizzes' | 'teachers' | 'settings';
export type TeacherSection = 'dashboard' | 'students' | 'quizzes' | 'analytics' | 'settings';

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
