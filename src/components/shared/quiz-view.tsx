'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Eye,
  Home,
  Loader2,
  Link2,
  Trophy,
  ListChecks,
  PenLine,
  ArrowLeftRight,
  BookOpen,
  Clock,
  Calendar,
  ClipboardList,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/stores/app-store';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import type { UserProfile, Quiz, QuizQuestion, UserAnswer, Score } from '@/lib/types';

// -------------------------------------------------------
// Props
// -------------------------------------------------------
interface QuizViewProps {
  quizId: string;
  onBack: () => void;
  profile: UserProfile;
  reviewScoreId?: string;
}

// -------------------------------------------------------
// Question type labels
// -------------------------------------------------------
const typeLabels: Record<QuizQuestion['type'], string> = {
  mcq: 'اختيار من متعدد',
  boolean: 'صح أو خطأ',
  completion: 'أكمل الجملة',
  matching: 'توصيل',
};

const typeIcons: Record<QuizQuestion['type'], React.ReactNode> = {
  mcq: <ListChecks className="h-3.5 w-3.5" />,
  boolean: <CheckCircle2 className="h-3.5 w-3.5" />,
  completion: <PenLine className="h-3.5 w-3.5" />,
  matching: <ArrowLeftRight className="h-3.5 w-3.5" />,
};

// -------------------------------------------------------
// Animation variants
// -------------------------------------------------------
const pageVariants = {
  hidden: { opacity: 0, x: 30 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, x: -30, transition: { duration: 0.25, ease: 'easeIn' } },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

// -------------------------------------------------------
// Shuffle utility (Fisher-Yates)
// -------------------------------------------------------
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// -------------------------------------------------------
// Stored answer type (raw, unevaluated)
// -------------------------------------------------------
interface StoredAnswer {
  selectedOption?: string | null;
  completionInput?: string;
  matchedPairs?: Record<string, string>;
}

// -------------------------------------------------------
// Main Component
// -------------------------------------------------------
export default function QuizView({ quizId, onBack, profile, reviewScoreId }: QuizViewProps) {
  // ─── App store ───
  useAppStore();

  // ─── Quiz state ───
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizSubjectName, setQuizSubjectName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── Review mode state ───
  const [reviewMode, setReviewMode] = useState(false);
  const [savedAnswers, setSavedAnswers] = useState<UserAnswer[]>([]);

  // ─── Quiz taking state ───
  const [currentIdx, setCurrentIdx] = useState(0);
  const [storedAnswers, setStoredAnswers] = useState<Record<number, StoredAnswer>>({});
  const [answered, setAnswered] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [completionInput, setCompletionInput] = useState('');

  // ─── Matching state ───
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);
  const [matchedPairs, setMatchedPairs] = useState<Record<string, string>>({});

  // ─── Results state ───
  const [showResults, setShowResults] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [resultsBlocked, setResultsBlocked] = useState(false);
  const [evaluatedAnswers, setEvaluatedAnswers] = useState<UserAnswer[]>([]);

  // ─── Shuffled matching values (memoized per question) ───
  const shuffledValuesMap = useRef<Record<number, string[]>>({});

  // -------------------------------------------------------
  // Fetch quiz
  // -------------------------------------------------------
  const fetchQuiz = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .single();

      if (fetchError || !data) {
        setError('لم يتم العثور على الاختبار');
        return;
      }

      const quizData = data as Quiz;
      if (!quizData.questions || quizData.questions.length === 0) {
        setError('لا توجد أسئلة في هذا الاختبار');
        return;
      }

      // Fetch subject name if subject_id exists
      if (quizData.subject_id) {
        const { data: subjectData } = await supabase
          .from('subjects')
          .select('name')
          .eq('id', quizData.subject_id)
          .single();
        if (subjectData) {
          quizData.subject_name = (subjectData as any).name;
          setQuizSubjectName((subjectData as any).name || '');
        }
      }

      setQuiz(quizData);
    } catch {
      setError('حدث خطأ أثناء تحميل الاختبار');
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    fetchQuiz();
  }, [fetchQuiz]);

  // ─── Load saved score for review mode ───
  useEffect(() => {
    if (!reviewScoreId || !quiz) return;
    const loadSavedScore = async () => {
      try {
        const { data, error } = await supabase
          .from('scores')
          .select('*')
          .eq('id', reviewScoreId)
          .single();
        if (!error && data) {
          const score = data as Score;
          setSavedAnswers(score.user_answers || []);
          setReviewMode(true);
          setShowResults(true);
        }
      } catch {
        // ignore
      }
    };
    loadSavedScore();
  }, [reviewScoreId, quiz]);

  // -------------------------------------------------------
  // Current question
  // -------------------------------------------------------
  const currentQuestion: QuizQuestion | null = quiz?.questions?.[currentIdx] ?? null;
  const totalQuestions = quiz?.questions?.length ?? 0;
  const progressPct = totalQuestions > 0 ? ((currentIdx + 1) / totalQuestions) * 100 : 0;

  // -------------------------------------------------------
  // Get shuffled values for a matching question
  // -------------------------------------------------------
  const getShuffledValues = useCallback((qIdx: number, pairs: { key: string; value: string }[] | undefined): string[] => {
    if (!pairs) return [];
    if (shuffledValuesMap.current[qIdx]) {
      return shuffledValuesMap.current[qIdx];
    }
    const values = pairs.map(p => p.value);
    const shuffled = shuffleArray(values);
    shuffledValuesMap.current[qIdx] = shuffled;
    return shuffled;
  }, []);

  // -------------------------------------------------------
  // Save current question's answer to storedAnswers
  // -------------------------------------------------------
  const saveCurrentAnswer = useCallback(() => {
    if (!currentQuestion) return;
    const stored: StoredAnswer = {};
    if (currentQuestion.type === 'mcq' || currentQuestion.type === 'boolean') {
      stored.selectedOption = selectedOption;
    } else if (currentQuestion.type === 'completion') {
      stored.completionInput = completionInput;
    } else if (currentQuestion.type === 'matching') {
      stored.matchedPairs = { ...matchedPairs };
    }
    setStoredAnswers(prev => ({ ...prev, [currentIdx]: stored }));
  }, [currentQuestion, currentIdx, selectedOption, completionInput, matchedPairs]);

  // -------------------------------------------------------
  // Load a question's stored answer into state
  // -------------------------------------------------------
  const loadQuestionState = useCallback((idx: number) => {
    const q = quiz?.questions?.[idx];
    const stored = storedAnswers[idx];
    setSelectedOption(stored?.selectedOption ?? null);
    setCompletionInput(stored?.completionInput ?? '');
    setMatchedPairs(stored?.matchedPairs ?? {});
    setSelectedKey(null);
    setSelectedValue(null);
    // Mark as answered if there's a stored answer
    if (stored) {
      if (q?.type === 'mcq' || q?.type === 'boolean') {
        setAnswered(!!stored.selectedOption);
      } else if (q?.type === 'completion') {
        setAnswered(!!stored.completionInput?.trim());
      } else if (q?.type === 'matching') {
        const totalPairs = q.pairs?.length || 0;
        setAnswered(Object.keys(stored.matchedPairs || {}).length >= totalPairs);
      } else {
        setAnswered(false);
      }
    } else {
      setAnswered(false);
    }
  }, [quiz, storedAnswers]);

  // -------------------------------------------------------
  // Handle MCQ answer (no immediate evaluation)
  // -------------------------------------------------------
  const handleMCQAnswer = (option: string) => {
    if (answered) return;
    setSelectedOption(option);
    setAnswered(true);
    // Save immediately
    setStoredAnswers(prev => ({ ...prev, [currentIdx]: { selectedOption: option } }));
  };

  // -------------------------------------------------------
  // Handle Boolean answer (no immediate evaluation)
  // -------------------------------------------------------
  const handleBooleanAnswer = (answer: string) => {
    if (answered) return;
    setSelectedOption(answer);
    setAnswered(true);
    // Save immediately
    setStoredAnswers(prev => ({ ...prev, [currentIdx]: { selectedOption: answer } }));
  };

  // -------------------------------------------------------
  // Handle Completion answer (no immediate evaluation)
  // -------------------------------------------------------
  const handleCompletionSave = () => {
    if (answered || !completionInput.trim()) {
      if (!completionInput.trim()) {
        toast.error('يرجى إدخال إجابة');
      }
      return;
    }
    setAnswered(true);
    setStoredAnswers(prev => ({ ...prev, [currentIdx]: { completionInput: completionInput.trim() } }));
  };

  // -------------------------------------------------------
  // Handle Matching
  // -------------------------------------------------------
  const handleMatchingSelect = (side: 'key' | 'value', item: string) => {
    if (answered) return;

    if (side === 'key') {
      // If already matched, remove
      if (matchedPairs[item]) {
        const newPairs = { ...matchedPairs };
        delete newPairs[item];
        setMatchedPairs(newPairs);
        setStoredAnswers(prev => ({ ...prev, [currentIdx]: { matchedPairs: newPairs } }));
        return;
      }
      setSelectedKey(item);
    } else {
      setSelectedValue(item);
    }
  };

  // When both key and value selected, create pair
  useEffect(() => {
    if (selectedKey && selectedValue) {
      const newPairs = { ...matchedPairs, [selectedKey]: selectedValue };
      setMatchedPairs(newPairs);
      setSelectedKey(null);
      setSelectedValue(null);
      // Check if all pairs matched now
      if (currentQuestion?.pairs) {
        const totalPairs = currentQuestion.pairs.length;
        const allMatched = Object.keys(newPairs).length >= totalPairs;
        if (allMatched) {
          setAnswered(true);
        }
        setStoredAnswers(prev => ({ ...prev, [currentIdx]: { matchedPairs: newPairs } }));
      }
    }
  }, [selectedKey, selectedValue]);

  const removeMatchedPair = (key: string) => {
    if (answered) return;
    const newPairs = { ...matchedPairs };
    delete newPairs[key];
    setMatchedPairs(newPairs);
    setAnswered(false);
    setStoredAnswers(prev => ({ ...prev, [currentIdx]: { matchedPairs: newPairs } }));
  };

  // -------------------------------------------------------
  // Navigate to a question
  // -------------------------------------------------------
  const navigateToQuestion = useCallback((idx: number) => {
    if (idx < 0 || idx >= totalQuestions) return;
    saveCurrentAnswer();
    setCurrentIdx(idx);
    loadQuestionState(idx);
  }, [saveCurrentAnswer, loadQuestionState, totalQuestions]);

  // -------------------------------------------------------
  // Next question
  // -------------------------------------------------------
  const handleNext = () => {
    saveCurrentAnswer();
    if (currentIdx < totalQuestions - 1) {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      loadQuestionState(nextIdx);
    }
  };

  // -------------------------------------------------------
  // Previous question
  // -------------------------------------------------------
  const handlePrevious = () => {
    saveCurrentAnswer();
    if (currentIdx > 0) {
      const prevIdx = currentIdx - 1;
      setCurrentIdx(prevIdx);
      loadQuestionState(prevIdx);
    }
  };

  // -------------------------------------------------------
  // Final submit: evaluate all answers and save
  // -------------------------------------------------------
  const handleFinalSubmit = async () => {
    if (!quiz) return;

    saveCurrentAnswer();

    // Get the final stored answers (including current)
    const finalStored = { ...storedAnswers };
    // Save current question's answer if not already saved
    if (currentQuestion) {
      const stored: StoredAnswer = {};
      if (currentQuestion.type === 'mcq' || currentQuestion.type === 'boolean') {
        stored.selectedOption = selectedOption;
      } else if (currentQuestion.type === 'completion') {
        stored.completionInput = completionInput.trim();
      } else if (currentQuestion.type === 'matching') {
        stored.matchedPairs = { ...matchedPairs };
      }
      finalStored[currentIdx] = stored;
    }

    setSavingScore(true);

    try {
      // Evaluate all answers
      const evaluated: UserAnswer[] = [];
      let completionEvaluations: { idx: number; question: string; correctAnswer: string; studentAnswer: string }[] = [];

      for (let i = 0; i < totalQuestions; i++) {
        const q = quiz.questions[i];
        const ans = finalStored[i];
        let answerValue: string | Record<string, string> = '';
        let isCorrect = false;

        if (q.type === 'mcq') {
          answerValue = ans?.selectedOption || '';
          isCorrect = ans?.selectedOption === q.correctAnswer;
        } else if (q.type === 'boolean') {
          answerValue = ans?.selectedOption || '';
          isCorrect = ans?.selectedOption === q.correctAnswer;
        } else if (q.type === 'completion') {
          answerValue = ans?.completionInput || '';
          // Check exact match first
          if (answerValue.toLowerCase().trim() === (q.correctAnswer || '').toLowerCase().trim()) {
            isCorrect = true;
          } else {
            // Queue for API evaluation
            completionEvaluations.push({
              idx: i,
              question: q.question,
              correctAnswer: q.correctAnswer || '',
              studentAnswer: answerValue,
            });
          }
        } else if (q.type === 'matching') {
          answerValue = ans?.matchedPairs || {};
          // Check all pairs
          isCorrect = q.pairs ? q.pairs.every(pair => ans?.matchedPairs?.[pair.key] === pair.value) : false;
        }

        evaluated.push({
          questionIndex: i,
          type: q.type,
          answer: answerValue,
          isCorrect,
        });
      }

      // Evaluate completion answers via API
      if (completionEvaluations.length > 0) {
        try {
          const res = await fetch('/api/gemini/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              questions: completionEvaluations,
            }),
          });
          const data = await res.json();
          if (data.success && data.data?.results) {
            for (const result of data.data.results) {
              const evIdx = evaluated.findIndex(e => e.questionIndex === result.idx);
              if (evIdx >= 0) {
                evaluated[evIdx].isCorrect = result.isCorrect;
              }
            }
          }
        } catch {
          // If API fails, leave completion answers as incorrect
          console.error('Failed to evaluate completion answers via API');
        }

        // Fallback: try evaluating one by one
        for (const ce of completionEvaluations) {
          const evIdx = evaluated.findIndex(e => e.questionIndex === ce.idx);
          if (evIdx >= 0 && !evaluated[evIdx].isCorrect) {
            try {
              const res = await fetch('/api/gemini/evaluate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  question: ce.question,
                  correctAnswer: ce.correctAnswer,
                  studentAnswer: ce.studentAnswer,
                }),
              });
              const data = await res.json();
              if (data.success && data.data) {
                evaluated[evIdx].isCorrect = data.data.isCorrect;
              }
            } catch {
              // Leave as incorrect
            }
          }
        }
      }

      const finalScore = evaluated.filter(a => a.isCorrect).length;
      setEvaluatedAnswers(evaluated);

      // Save score to supabase
      const { error: scoreError } = await supabase.from('scores').insert({
        student_id: profile.id,
        teacher_id: quiz.user_id,
        quiz_id: quizId,
        quiz_title: quiz.title,
        score: finalScore,
        total: totalQuestions,
        user_answers: evaluated,
      });

      if (scoreError) {
        console.error('Error saving score:', scoreError);
      }

      // Handle teacher linking if student is not linked to the quiz creator
      if (quiz.user_id !== profile.id) {
        const { data: existingLink } = await supabase
          .from('teacher_student_links')
          .select('id')
          .eq('teacher_id', quiz.user_id)
          .eq('student_id', profile.id)
          .maybeSingle();

        if (!existingLink) {
          await supabase.from('teacher_student_links').insert({
            teacher_id: quiz.user_id,
            student_id: profile.id,
          });
        }
      }

      // Check if results are visible to students
      if (quiz.results_visible === false) {
        setShowResults(true);
        setResultsBlocked(true);
      } else {
        setShowResults(true);
      }
    } catch (err) {
      console.error('Error during final submission:', err);
      toast.error('حدث خطأ أثناء تسليم الاختبار');
    } finally {
      setSavingScore(false);
    }
  };

  // -------------------------------------------------------
  // Retry quiz
  // -------------------------------------------------------
  const handleRetry = () => {
    setCurrentIdx(0);
    setStoredAnswers({});
    setAnswered(false);
    setSelectedOption(null);
    setCompletionInput('');
    setMatchedPairs({});
    setSelectedKey(null);
    setSelectedValue(null);
    setShowResults(false);
    setShowReview(false);
    setEvaluatedAnswers([]);
    setResultsBlocked(false);
    shuffledValuesMap.current = {};
  };

  // -------------------------------------------------------
  // Loading state
  // -------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4" dir="rtl">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
        <p className="text-muted-foreground text-sm">جاري تحميل الاختبار...</p>
      </div>
    );
  }

  // -------------------------------------------------------
  // Error state
  // -------------------------------------------------------
  if (error || !quiz) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4" dir="rtl">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
          <XCircle className="h-8 w-8 text-rose-600" />
        </div>
        <p className="text-lg font-semibold text-foreground">{error || 'حدث خطأ غير متوقع'}</p>
        <Button
          onClick={onBack}
          variant="outline"
          className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
        >
          <ChevronLeft className="h-4 w-4" />
          العودة
        </Button>
      </div>
    );
  }

  // -------------------------------------------------------
  // Scheduled time check
  // -------------------------------------------------------
  const isScheduledFuture = (() => {
    if (!quiz?.scheduled_date) return false;
    try {
      const scheduledDateTime = quiz.scheduled_time
        ? new Date(`${quiz.scheduled_date}T${quiz.scheduled_time}`)
        : new Date(quiz.scheduled_date);
      return scheduledDateTime.getTime() > Date.now();
    } catch {
      return false;
    }
  })();

  const formattedSchedule = (() => {
    if (!quiz?.scheduled_date) return null;
    try {
      const scheduledDateTime = quiz.scheduled_time
        ? new Date(`${quiz.scheduled_date}T${quiz.scheduled_time}`)
        : new Date(quiz.scheduled_date);
      return scheduledDateTime.toLocaleDateString('ar-SA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        ...(quiz.scheduled_time ? { hour: '2-digit', minute: '2-digit' } : {}),
      });
    } catch {
      return `${quiz.scheduled_date}${quiz.scheduled_time ? ` ${quiz.scheduled_time}` : ''}`;
    }
  })();

  // -------------------------------------------------------
  // Results screen (blocked - teacher hasn't shown results yet)
  // -------------------------------------------------------
  if (showResults && resultsBlocked) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="mx-auto max-w-2xl space-y-6 px-4 py-8"
        dir="rtl"
      >
        <motion.div variants={fadeInUp} className="flex flex-col items-center gap-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
            className="flex h-32 w-32 items-center justify-center rounded-full bg-teal-100 ring-8 ring-teal-200 shadow-lg"
          >
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-teal-600 mb-1" />
            </div>
          </motion.div>

          <motion.div variants={fadeInUp} className="text-center">
            <h2 className="text-2xl font-bold text-foreground">تم إرسال إجاباتك</h2>
            <p className="text-muted-foreground mt-1">{quiz.title}</p>
            {(quiz.subject_name || quizSubjectName) && (
              <div className="flex items-center justify-center gap-1 mt-1">
                <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-sm text-emerald-600 font-medium">{quiz.subject_name || quizSubjectName}</span>
              </div>
            )}
          </motion.div>

          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border-2 border-teal-200 bg-teal-50 px-8 py-4 text-center max-w-sm"
          >
            <p className="text-base font-medium text-teal-700">
              ستظهر النتيجة بعد قيام المعلم بإظهارها
            </p>
          </motion.div>
        </motion.div>

        {/* Action buttons */}
        <motion.div variants={fadeInUp} className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            onClick={onBack}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Home className="h-4 w-4" />
            العودة للرئيسية
          </Button>
        </motion.div>
      </motion.div>
    );
  }

  // -------------------------------------------------------
  // Results screen
  // -------------------------------------------------------
  if (showResults) {
    const answersToReview = reviewMode ? savedAnswers : evaluatedAnswers;
    const finalScore = answersToReview.filter((a) => a.isCorrect).length;
    const percentage = totalQuestions > 0 ? Math.round((finalScore / totalQuestions) * 100) : 0;
    const scoreColor =
      percentage >= 80
        ? 'text-emerald-700'
        : percentage >= 60
          ? 'text-amber-600'
          : 'text-rose-600';
    const scoreBg =
      percentage >= 80
        ? 'bg-emerald-100'
        : percentage >= 60
          ? 'bg-amber-100'
          : 'bg-rose-100';
    const scoreRing =
      percentage >= 80
        ? 'ring-emerald-200'
        : percentage >= 60
          ? 'ring-amber-200'
          : 'ring-rose-200';

    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="mx-auto max-w-2xl space-y-6 px-4 py-8"
        dir="rtl"
      >
        {/* Score display */}
        <motion.div variants={fadeInUp} className="flex flex-col items-center gap-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
            className={`flex h-32 w-32 items-center justify-center rounded-full ${scoreBg} ring-8 ${scoreRing} shadow-lg`}
          >
            <div className="text-center">
              <Trophy className={`mx-auto h-8 w-8 ${scoreColor} mb-1`} />
              <span className={`text-3xl font-bold ${scoreColor}`}>{percentage}%</span>
            </div>
          </motion.div>

          <motion.div variants={fadeInUp} className="text-center">
            <h2 className="text-2xl font-bold text-foreground">نتيجة الاختبار</h2>
            <p className="text-muted-foreground mt-1">{quiz.title}</p>
            {(quiz.subject_name || quizSubjectName) && (
              <div className="flex items-center justify-center gap-1 mt-1">
                <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-sm text-emerald-600 font-medium">{quiz.subject_name || quizSubjectName}</span>
              </div>
            )}
          </motion.div>

          <motion.div
            variants={fadeInUp}
            className={`rounded-2xl border-2 px-8 py-4 ${scoreBg} ${scoreRing.replace('ring', 'border')}`}
          >
            <span className={`text-4xl font-bold ${scoreColor}`}>
              {finalScore}
            </span>
            <span className="text-xl text-muted-foreground"> / {totalQuestions}</span>
          </motion.div>
        </motion.div>

        {/* Action buttons */}
        <motion.div variants={fadeInUp} className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            onClick={() => setShowReview(true)}
            variant="outline"
            className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            <Eye className="h-4 w-4" />
            مراجعة الإجابات
          </Button>
          {!reviewMode && quiz.allow_retake && (
            <Button
              onClick={handleRetry}
              variant="outline"
              className="gap-2 border-teal-300 text-teal-700 hover:bg-teal-50"
            >
              <RotateCcw className="h-4 w-4" />
              إعادة الاختبار
            </Button>
          )}
          <Button
            onClick={onBack}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Home className="h-4 w-4" />
            العودة للرئيسية
          </Button>
        </motion.div>

        {/* Review section */}
        <AnimatePresence>
          {showReview && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Eye className="h-5 w-5 text-emerald-600" />
                  مراجعة الإجابات
                </h3>
                {quiz.questions.map((q, idx) => {
                  const ans = answersToReview.find((a) => a.questionIndex === idx);
                  return (
                    <ReviewQuestionCard
                      key={idx}
                      question={q}
                      index={idx}
                      userAnswer={ans || null}
                    />
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // -------------------------------------------------------
  // Start screen (show quiz info before starting)
  // -------------------------------------------------------
  if (!quizStarted && !showResults) {
    return (
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="mx-auto max-w-2xl space-y-6 px-4 py-8"
        dir="rtl"
      >
        {/* Back button */}
        <motion.div variants={fadeInUp}>
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            العودة
          </button>
        </motion.div>

        {/* Quiz info card */}
        <motion.div variants={fadeInUp}>
          <Card className="border-emerald-200 bg-white shadow-sm">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-100">
                  <ClipboardList className="h-6 w-6 text-teal-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-foreground truncate">{quiz.title}</h2>
                  {(quiz.subject_name || quizSubjectName) && (
                    <div className="flex items-center gap-1 mt-1">
                      <BookOpen className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-sm text-emerald-600 font-medium">{quiz.subject_name || quizSubjectName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Quiz details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{totalQuestions}</p>
                  <p className="text-xs text-muted-foreground">سؤال</p>
                </div>
                {quiz.duration && (
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">{quiz.duration}</p>
                    <p className="text-xs text-muted-foreground">دقيقة</p>
                  </div>
                )}
              </div>

              {/* Scheduled time */}
              {formattedSchedule && (
                <div className={`rounded-lg border p-3 ${isScheduledFuture ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                  <div className="flex items-center gap-2">
                    <Calendar className={`h-4 w-4 ${isScheduledFuture ? 'text-amber-600' : 'text-emerald-600'}`} />
                    <span className={`text-sm font-medium ${isScheduledFuture ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {isScheduledFuture ? 'يبدأ في:' : 'بدأ في:'}
                    </span>
                  </div>
                  <p className={`text-sm mt-1 ${isScheduledFuture ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {formattedSchedule}
                  </p>
                </div>
              )}

              {/* Start button or scheduled message */}
              {isScheduledFuture ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-6">
                  <Clock className="h-10 w-10 text-amber-600" />
                  <p className="text-lg font-bold text-amber-700">لم يحين موعد الاختبار بعد</p>
                  <p className="text-sm text-amber-600">سيبدأ الاختبار في {formattedSchedule}</p>
                  <Button
                    onClick={onBack}
                    variant="outline"
                    className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-100 mt-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    العودة
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setQuizStarted(true)}
                  className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700 h-12 text-base font-bold"
                >
                  <ClipboardList className="h-5 w-5" />
                  ابدأ الاختبار الآن
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    );
  }

  // -------------------------------------------------------
  // Quiz taking screen
  // -------------------------------------------------------
  // Check if all questions have been answered
  const allAnswered = totalQuestions > 0 && Object.keys(storedAnswers).length >= totalQuestions &&
    quiz?.questions.every((q, i) => {
      const ans = storedAnswers[i];
      if (!ans) return false;
      if (q.type === 'mcq' || q.type === 'boolean') return !!ans.selectedOption;
      if (q.type === 'completion') return !!ans.completionInput?.trim();
      if (q.type === 'matching') return Object.keys(ans.matchedPairs || {}).length >= (q.pairs?.length || 0);
      return false;
    });

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="mx-auto max-w-2xl space-y-6 px-4 py-6"
      dir="rtl"
    >
      {/* Header */}
      <motion.div variants={fadeInUp} className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{quiz.title}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {(quiz.subject_name || quizSubjectName) && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                  <BookOpen className="h-3 w-3" />
                  {quiz.subject_name || quizSubjectName}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                السؤال {currentIdx + 1} من {totalQuestions}
              </span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <Progress value={progressPct} className="h-2.5 bg-emerald-100 [&>div]:bg-emerald-600" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{currentIdx + 1}</span>
            <span>{totalQuestions}</span>
          </div>
        </div>
      </motion.div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIdx}
          variants={pageVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {currentQuestion && (
            <Card className="border-emerald-200 bg-white shadow-sm">
              <CardContent className="p-6 space-y-5">
                {/* Type badge + question */}
                <div className="space-y-3">
                  <Badge
                    variant="outline"
                    className="gap-1.5 border-emerald-300 bg-emerald-50 text-emerald-700 text-xs"
                  >
                    {typeIcons[currentQuestion.type]}
                    {typeLabels[currentQuestion.type]}
                  </Badge>
                  <h3 className="text-base font-semibold text-foreground leading-relaxed">
                    {currentQuestion.question}
                  </h3>
                </div>

                {/* Question type content */}
                {currentQuestion.type === 'mcq' && (
                  <MCQQuestion
                    question={currentQuestion}
                    answered={answered}
                    selectedOption={selectedOption}
                    onAnswer={handleMCQAnswer}
                  />
                )}

                {currentQuestion.type === 'boolean' && (
                  <BooleanQuestion
                    question={currentQuestion}
                    answered={answered}
                    selectedOption={selectedOption}
                    onAnswer={handleBooleanAnswer}
                  />
                )}

                {currentQuestion.type === 'completion' && (
                  <CompletionQuestion
                    question={currentQuestion}
                    answered={answered}
                    inputValue={completionInput}
                    onInputChange={setCompletionInput}
                    onSave={handleCompletionSave}
                  />
                )}

                {currentQuestion.type === 'matching' && (
                  <MatchingQuestion
                    question={currentQuestion}
                    answered={answered}
                    matchedPairs={matchedPairs}
                    selectedKey={selectedKey}
                    selectedValue={selectedValue}
                    onSelect={handleMatchingSelect}
                    onRemovePair={removeMatchedPair}
                    shuffledValues={getShuffledValues(currentIdx, currentQuestion.pairs)}
                  />
                )}

                {/* Answered indicator - only show that answer was recorded, NOT correctness */}
                {answered && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 rounded-lg p-3 bg-teal-50 text-teal-700"
                  >
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <span className="text-sm font-medium">تم تسجيل إجابتك</span>
                  </motion.div>
                )}

                {/* Navigation buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3"
                >
                  {/* Previous button */}
                  {currentIdx > 0 && (
                    <Button
                      onClick={handlePrevious}
                      variant="outline"
                      className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                      السؤال السابق
                    </Button>
                  )}

                  <div className="flex-1" />

                  {/* Next / Finish button */}
                  {answered && (
                    <Button
                      onClick={currentIdx < totalQuestions - 1 ? handleNext : handleFinalSubmit}
                      disabled={savingScore}
                      className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      {savingScore ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : currentIdx < totalQuestions - 1 ? (
                        <>
                          السؤال التالي
                          <ArrowRight className="h-4 w-4" />
                        </>
                      ) : (
                        <>
                          إنهاء الاختبار
                          <Trophy className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  )}
                </motion.div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

// =====================================================
// Sub-components for question types
// =====================================================

// -------------------------------------------------------
// MCQ Question
// -------------------------------------------------------
interface MCQQuestionProps {
  question: QuizQuestion;
  answered: boolean;
  selectedOption: string | null;
  onAnswer: (option: string) => void;
  showCorrectAnswer?: boolean;
  isCorrect?: boolean;
}

function MCQQuestion({ question, answered, selectedOption, onAnswer, showCorrectAnswer = false, isCorrect }: MCQQuestionProps) {
  if (!question.options) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {question.options.map((option, idx) => {
        const isSelected = selectedOption === option;
        const isCorrectOption = option === question.correctAnswer;

        let btnClass =
          'rounded-xl border-2 p-4 text-sm font-medium transition-all text-right flex items-center gap-3';

        if (answered) {
          if (showCorrectAnswer) {
            // Review mode: show correct/incorrect
            if (isCorrectOption) {
              btnClass += ' border-emerald-500 bg-emerald-50 text-emerald-700';
            } else if (isSelected && !isCorrect) {
              btnClass += ' border-rose-500 bg-rose-50 text-rose-700';
            } else {
              btnClass += ' border-border bg-muted/30 text-muted-foreground';
            }
          } else {
            // Quiz mode: just show selected state without revealing correctness
            if (isSelected) {
              btnClass += ' border-teal-500 bg-teal-50 text-teal-700';
            } else {
              btnClass += ' border-border bg-muted/30 text-muted-foreground';
            }
          }
        } else {
          btnClass +=
            ' border-emerald-200 bg-white text-foreground hover:border-emerald-400 hover:bg-emerald-50/50 cursor-pointer';
        }

        return (
          <motion.button
            key={idx}
            whileHover={!answered ? { scale: 1.02 } : undefined}
            whileTap={!answered ? { scale: 0.98 } : undefined}
            onClick={() => onAnswer(option)}
            disabled={answered}
            className={btnClass}
          >
            {/* Option letter */}
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                showCorrectAnswer && answered && isCorrectOption
                  ? 'bg-emerald-600 text-white'
                  : showCorrectAnswer && answered && isSelected && !isCorrect
                    ? 'bg-rose-600 text-white'
                    : answered && isSelected
                      ? 'bg-teal-600 text-white'
                      : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {String.fromCharCode(1571 + idx)}
            </span>

            <span className="flex-1">{option}</span>

            {/* Feedback icon - only in review mode */}
            {showCorrectAnswer && answered && isCorrectOption && (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            )}
            {showCorrectAnswer && answered && isSelected && !isCorrect && (
              <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------
// Boolean Question
// -------------------------------------------------------
interface BooleanQuestionProps {
  question: QuizQuestion;
  answered: boolean;
  selectedOption: string | null;
  onAnswer: (answer: string) => void;
  showCorrectAnswer?: boolean;
  isCorrect?: boolean;
}

function BooleanQuestion({
  question,
  answered,
  selectedOption,
  onAnswer,
  showCorrectAnswer = false,
  isCorrect,
}: BooleanQuestionProps) {
  const options = [
    { label: 'صح', value: 'صح', icon: <CheckCircle2 className="h-5 w-5" /> },
    { label: 'خطأ', value: 'خطأ', icon: <XCircle className="h-5 w-5" /> },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {options.map((opt) => {
        const isSelected = selectedOption === opt.value;
        const isCorrectOption = opt.value === question.correctAnswer;

        let btnClass =
          'flex flex-col items-center gap-2 rounded-xl border-2 p-6 text-base font-bold transition-all';

        if (answered) {
          if (showCorrectAnswer) {
            // Review mode
            if (isCorrectOption) {
              btnClass += ' border-emerald-500 bg-emerald-50 text-emerald-700';
            } else if (isSelected && !isCorrect) {
              btnClass += ' border-rose-500 bg-rose-50 text-rose-700';
            } else {
              btnClass += ' border-border bg-muted/30 text-muted-foreground';
            }
          } else {
            // Quiz mode: just show selected state
            if (isSelected) {
              btnClass += ' border-teal-500 bg-teal-50 text-teal-700';
            } else {
              btnClass += ' border-border bg-muted/30 text-muted-foreground';
            }
          }
        } else {
          btnClass +=
            ' border-emerald-200 bg-white text-foreground hover:border-emerald-400 hover:bg-emerald-50/50 cursor-pointer';
        }

        return (
          <motion.button
            key={opt.value}
            whileHover={!answered ? { scale: 1.03 } : undefined}
            whileTap={!answered ? { scale: 0.97 } : undefined}
            onClick={() => onAnswer(opt.value)}
            disabled={answered}
            className={btnClass}
          >
            {opt.icon}
            {opt.label}
            {showCorrectAnswer && answered && isCorrectOption && (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            {showCorrectAnswer && answered && isSelected && !isCorrect && (
              <XCircle className="h-4 w-4 text-rose-600" />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------
// Completion Question
// -------------------------------------------------------
interface CompletionQuestionProps {
  question: QuizQuestion;
  answered: boolean;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSave: () => void;
  showCorrectAnswer?: boolean;
  isCorrect?: boolean;
}

function CompletionQuestion({
  question,
  answered,
  inputValue,
  onInputChange,
  onSave,
  showCorrectAnswer = false,
  isCorrect,
}: CompletionQuestionProps) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="اكتب إجابتك هنا..."
          disabled={answered}
          className="text-base pr-4 border-emerald-200 focus:border-emerald-400"
          dir="rtl"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !answered && inputValue.trim()) {
              onSave();
            }
          }}
        />
      </div>
      {!answered && (
        <Button
          onClick={onSave}
          disabled={!inputValue.trim()}
          className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          تسجيل الإجابة
        </Button>
      )}
      {showCorrectAnswer && answered && (
        <div className={`rounded-lg p-3 text-sm ${isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          <p className="font-medium">{isCorrect ? '✓ إجابة صحيحة' : '✗ إجابة خاطئة'}</p>
          {!isCorrect && question.correctAnswer && (
            <p className="mt-1">الإجابة الصحيحة: {question.correctAnswer}</p>
          )}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------
// Matching Question
// -------------------------------------------------------
interface MatchingQuestionProps {
  question: QuizQuestion;
  answered: boolean;
  matchedPairs: Record<string, string>;
  selectedKey: string | null;
  selectedValue: string | null;
  onSelect: (side: 'key' | 'value', item: string) => void;
  onRemovePair: (key: string) => void;
  shuffledValues: string[];
  showCorrectAnswer?: boolean;
  isCorrect?: boolean;
}

function MatchingQuestion({
  question,
  answered,
  matchedPairs,
  selectedKey,
  selectedValue,
  onSelect,
  onRemovePair,
  shuffledValues,
  showCorrectAnswer = false,
  isCorrect,
}: MatchingQuestionProps) {
  if (!question.pairs) return null;

  const keys = question.pairs.map(p => p.key);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Keys column */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">العناصر</p>
          {keys.map((key) => {
            const isMatched = key in matchedPairs;
            const isSelected = selectedKey === key;

            return (
              <motion.button
                key={key}
                whileHover={!answered ? { scale: 1.02 } : undefined}
                whileTap={!answered ? { scale: 0.98 } : undefined}
                onClick={() => onSelect('key', key)}
                disabled={answered}
                className={`w-full rounded-lg border-2 p-3 text-sm font-medium transition-all text-right ${
                  isMatched
                    ? 'border-teal-400 bg-teal-50 text-teal-700'
                    : isSelected
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-300'
                      : 'border-emerald-200 bg-white text-foreground hover:border-emerald-300'
                }`}
              >
                <span>{key}</span>
                {isMatched && (
                  <span className="block text-xs text-teal-500 mt-1">
                    ← {matchedPairs[key]}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Values column (shuffled) */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">التوصيلات</p>
          {shuffledValues.map((value) => {
            const isUsed = Object.values(matchedPairs).includes(value);
            const isSelected = selectedValue === value;

            return (
              <motion.button
                key={value}
                whileHover={!answered && !isUsed ? { scale: 1.02 } : undefined}
                whileTap={!answered && !isUsed ? { scale: 0.98 } : undefined}
                onClick={() => {
                  if (!isUsed) onSelect('value', value);
                }}
                disabled={answered || isUsed}
                className={`w-full rounded-lg border-2 p-3 text-sm font-medium transition-all text-right ${
                  isUsed
                    ? 'border-muted bg-muted/30 text-muted-foreground opacity-50'
                    : isSelected
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-300'
                      : 'border-amber-200 bg-white text-foreground hover:border-amber-300'
                }`}
              >
                {value}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Matched pairs display */}
      {Object.keys(matchedPairs).length > 0 && (
        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground">التوصيلات المُنجزة:</p>
          {Object.entries(matchedPairs).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              <span className="font-medium text-teal-700">{key}</span>
              <Link2 className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium text-amber-700">{value}</span>
              {!answered && (
                <button
                  onClick={() => onRemovePair(key)}
                  className="mr-auto text-rose-500 hover:text-rose-700 text-xs"
                >
                  إلغاء
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showCorrectAnswer && answered && (
        <div className={`rounded-lg p-3 text-sm ${isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          <p className="font-medium">{isCorrect ? '✓ جميع التوصيلات صحيحة' : '✗ بعض التوصيلات خاطئة'}</p>
          {!isCorrect && question.pairs.map((pair, idx) => (
            <p key={idx} className="mt-1">{pair.key} → {pair.value}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------
// Review Question Card
// -------------------------------------------------------
interface ReviewQuestionCardProps {
  question: QuizQuestion;
  index: number;
  userAnswer: UserAnswer | null;
}

function ReviewQuestionCard({ question, index, userAnswer }: ReviewQuestionCardProps) {
  const isCorrect = userAnswer?.isCorrect ?? false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="mb-4"
    >
      <Card className={`border-2 ${isCorrect ? 'border-emerald-200' : 'border-rose-200'}`}>
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 text-xs">
                {typeIcons[question.type]}
                {typeLabels[question.type]}
              </Badge>
              <span className="text-xs text-muted-foreground">سؤال {index + 1}</span>
            </div>
            {isCorrect ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-rose-600 shrink-0" />
            )}
          </div>

          {/* Question text */}
          <p className="font-medium text-foreground">{question.question}</p>

          {/* Answer details based on type */}
          {question.type === 'mcq' && (
            <MCQQuestion
              question={question}
              answered={true}
              selectedOption={typeof userAnswer?.answer === 'string' ? userAnswer.answer : null}
              onAnswer={() => {}}
              showCorrectAnswer={true}
              isCorrect={isCorrect}
            />
          )}

          {question.type === 'boolean' && (
            <BooleanQuestion
              question={question}
              answered={true}
              selectedOption={typeof userAnswer?.answer === 'string' ? userAnswer.answer : null}
              onAnswer={() => {}}
              showCorrectAnswer={true}
              isCorrect={isCorrect}
            />
          )}

          {question.type === 'completion' && (
            <CompletionQuestion
              question={question}
              answered={true}
              inputValue={typeof userAnswer?.answer === 'string' ? userAnswer.answer : ''}
              onInputChange={() => {}}
              onSave={() => {}}
              showCorrectAnswer={true}
              isCorrect={isCorrect}
            />
          )}

          {question.type === 'matching' && (
            <MatchingQuestion
              question={question}
              answered={true}
              matchedPairs={typeof userAnswer?.answer === 'object' && userAnswer.answer ? userAnswer.answer as Record<string, string> : {}}
              selectedKey={null}
              selectedValue={null}
              onSelect={() => {}}
              onRemovePair={() => {}}
              shuffledValues={question.pairs?.map(p => p.value) || []}
              showCorrectAnswer={true}
              isCorrect={isCorrect}
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
