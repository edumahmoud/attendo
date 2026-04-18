import { create } from 'zustand';
import type { AppPage, StudentSection, TeacherSection } from '@/lib/types';

interface AppState {
  // Navigation
  currentPage: AppPage;
  setCurrentPage: (page: AppPage) => void;
  
  // Student navigation
  studentSection: StudentSection;
  setStudentSection: (section: StudentSection) => void;
  
  // Teacher navigation
  teacherSection: TeacherSection;
  setTeacherSection: (section: TeacherSection) => void;
  
  // Quiz/Summary viewing
  viewingQuizId: string | null;
  setViewingQuizId: (id: string | null) => void;
  
  viewingSummaryId: string | null;
  setViewingSummaryId: (id: string | null) => void;
  
  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  
  // Reset
  reset: () => void;
}

const initialState = {
  currentPage: 'auth' as AppPage,
  studentSection: 'dashboard' as StudentSection,
  teacherSection: 'dashboard' as TeacherSection,
  viewingQuizId: null as string | null,
  viewingSummaryId: null as string | null,
  sidebarOpen: false,
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,
  
  setCurrentPage: (page) => set({ currentPage: page }),
  setStudentSection: (section) => set({ studentSection: section }),
  setTeacherSection: (section) => set({ teacherSection: section }),
  setViewingQuizId: (id) => set({ viewingQuizId: id, currentPage: id ? 'quiz' : 'student-dashboard' }),
  setViewingSummaryId: (id) => set({ viewingSummaryId: id, currentPage: id ? 'summary' : 'student-dashboard' }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  
  reset: () => set(initialState),
}));
