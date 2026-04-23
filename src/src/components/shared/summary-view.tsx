'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import {
  ChevronLeft,
  Printer,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  XCircle,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { Summary } from '@/lib/types';

// -------------------------------------------------------
// Props
// -------------------------------------------------------
interface SummaryViewProps {
  summaryId: string;
  onBack: () => void;
}

// -------------------------------------------------------
// Animation variants
// -------------------------------------------------------
const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

// -------------------------------------------------------
// Main Component
// -------------------------------------------------------
export default function SummaryView({ summaryId, onBack }: SummaryViewProps) {
  // ─── State ───
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [originalOpen, setOriginalOpen] = useState(false);

  // -------------------------------------------------------
  // Fetch summary
  // -------------------------------------------------------
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('summaries')
        .select('*')
        .eq('id', summaryId)
        .single();

      if (fetchError || !data) {
        setError('لم يتم العثور على الملخص');
        return;
      }

      setSummary(data as Summary);
    } catch {
      setError('حدث خطأ أثناء تحميل الملخص');
    } finally {
      setLoading(false);
    }
  }, [summaryId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // -------------------------------------------------------
  // Print handler
  // -------------------------------------------------------
  const handlePrint = () => {
    window.print();
  };

  // -------------------------------------------------------
  // Loading state
  // -------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4" dir="rtl">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
        <p className="text-muted-foreground text-sm">جاري تحميل الملخص...</p>
      </div>
    );
  }

  // -------------------------------------------------------
  // Error state
  // -------------------------------------------------------
  if (error || !summary) {
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
  // Main view
  // -------------------------------------------------------
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="mx-auto max-w-3xl space-y-6 px-4 py-6"
      dir="rtl"
    >
      {/* Header */}
      <motion.div variants={fadeInUp} className="flex items-start gap-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-foreground leading-relaxed">{summary.title}</h1>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <BookOpen className="h-3 w-3" />
            ملخص دراسي
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            onClick={handlePrint}
            variant="outline"
            size="sm"
            className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 print:hidden"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">طباعة</span>
          </Button>
        </div>
      </motion.div>

      {/* Summary content card */}
      <motion.div variants={fadeInUp}>
        <Card className="border-emerald-200 bg-white shadow-sm print:shadow-none print:border-none">
          <CardContent className="p-6 sm:p-8">
            {/* Decorative header */}
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-emerald-100 print:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                <Sparkles className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-emerald-700">الملخص</h2>
                <p className="text-xs text-emerald-600/70">تم إنشاؤه بواسطة الذكاء الاصطناعي</p>
              </div>
            </div>

            {/* Markdown content with RTL typography */}
            <div className="prose-summary">
              <ReactMarkdown>{summary.summary_content}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Original content expandable section */}
      <motion.div variants={fadeInUp}>
        <Collapsible open={originalOpen} onOpenChange={setOriginalOpen}>
          <Card className="border-teal-200 bg-teal-50/30 shadow-sm print:hidden">
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between p-4 text-right hover:bg-teal-50/50 transition-colors rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100">
                    <FileText className="h-4 w-4 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-teal-700">المحتوى الأصلي</p>
                    <p className="text-xs text-teal-600/70">النص المُدخل قبل التلخيص</p>
                  </div>
                </div>
                <motion.div
                  animate={{ rotate: originalOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-5 w-5 text-teal-600" />
                </motion.div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t border-teal-200 px-4 pb-4 pt-3">
                <div className="max-h-80 overflow-y-auto rounded-lg bg-white border border-teal-100 p-4 custom-scrollbar">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {summary.original_content}
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </motion.div>
    </motion.div>
  );
}
