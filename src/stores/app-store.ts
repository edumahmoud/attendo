import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppPage, StudentSection, TeacherSection, AdminSection, SubjectSection } from '@/lib/types';

interface AppState {
  currentPage: AppPage;
  studentSection: StudentSection;
  teacherSection: TeacherSection;
  adminSection: AdminSection;
  subjectSection: SubjectSection;
  viewingQuizId: string | null;
  viewingSummaryId: string | null;
  viewingSubjectId: string | null;
  reviewScoreId: string | null;
  sidebarOpen: boolean;
  
  // Actions
  setCurrentPage: (page: AppPage) => void;
  setStudentSection: (section: StudentSection) => void;
  setTeacherSection: (section: TeacherSection) => void;
  setAdminSection: (section: AdminSection) => void;
  setSubjectSection: (section: SubjectSection) => void;
  setViewingQuizId: (id: string | null) => void;
  setViewingSummaryId: (id: string | null) => void;
  setViewingSubjectId: (id: string | null) => void;
  setReviewScoreId: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  clearCache: () => void;
}

const initialState = {
  currentPage: 'auth' as AppPage,
  studentSection: 'dashboard' as StudentSection,
  teacherSection: 'dashboard' as TeacherSection,
  adminSection: 'dashboard' as AdminSection,
  subjectSection: 'overview' as SubjectSection,
  viewingQuizId: null,
  viewingSummaryId: null,
  viewingSubjectId: null,
  reviewScoreId: null,
  sidebarOpen: false,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,
      
      setCurrentPage: (page) => set({ currentPage: page }),
      setStudentSection: (section) => set({ studentSection: section }),
      setTeacherSection: (section) => set({ teacherSection: section }),
      setAdminSection: (section) => set({ adminSection: section }),
      setSubjectSection: (section) => set({ subjectSection: section }),
      setViewingQuizId: (id) => set({ viewingQuizId: id, reviewScoreId: null }),
      setViewingSummaryId: (id) => set({ viewingSummaryId: id }),
      setViewingSubjectId: (id) => set({ viewingSubjectId: id }),
      setReviewScoreId: (id) => set({ reviewScoreId: id }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      clearCache: () => set({ ...initialState }),
    }),
    {
      name: 'examy-app-store',
      // Only persist navigation-related state, not transient data
      partialize: (state) => ({
        currentPage: state.currentPage,
        studentSection: state.studentSection,
        teacherSection: state.teacherSection,
        adminSection: state.adminSection,
        subjectSection: state.subjectSection,
        viewingSubjectId: state.viewingSubjectId,
        viewingQuizId: state.viewingQuizId,
        viewingSummaryId: state.viewingSummaryId,
      }),
    }
  )
);
