'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Loader2, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface RealtimeStatusProps {
  status: 'connected' | 'disconnected' | 'connecting';
  lastUpdated: Date;
  onRefresh?: () => void;
}

export default function RealtimeStatus({ status, lastUpdated, onRefresh }: RealtimeStatusProps) {
  const statusConfig = {
    connected: {
      icon: <Wifi className="h-3.5 w-3.5" />,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50',
      label: 'متصل مباشر',
      dot: 'bg-emerald-500',
    },
    disconnected: {
      icon: <WifiOff className="h-3.5 w-3.5" />,
      color: 'text-rose-500',
      bg: 'bg-rose-50',
      label: 'غير متصل',
      dot: 'bg-rose-500',
    },
    connecting: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
      label: 'جاري الاتصال...',
      dot: 'bg-amber-500',
    },
  };

  const config = statusConfig[status];

  const timeAgo = (() => {
    const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
    if (seconds < 5) return 'الآن';
    if (seconds < 60) return `منذ ${seconds} ثانية`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    return `منذ ${Math.floor(minutes / 60)} ساعة`;
  })();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2" dir="rtl">
            <motion.button
              onClick={onRefresh}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted/80"
              whileTap={{ scale: 0.95 }}
            >
              <span className={`relative flex h-2 w-2`}>
                <AnimatePresence mode="wait">
                  {status === 'connected' && (
                    <motion.span
                      key="pulse"
                      className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                      style={{ backgroundColor: config.dot }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.75 }}
                      exit={{ opacity: 0 }}
                    />
                  )}
                </AnimatePresence>
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full`}
                  style={{ backgroundColor: config.dot }}
                />
              </span>
              <span className="text-muted-foreground">{timeAgo}</span>
              <RefreshCw className="h-3 w-3 text-muted-foreground/60" />
            </motion.button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" dir="rtl">
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-1.5">
              <span className={config.color}>{config.icon}</span>
              <span>{config.label}</span>
            </div>
            <div className="text-muted-foreground">
              آخر تحديث: {lastUpdated.toLocaleTimeString('ar-SA')}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
