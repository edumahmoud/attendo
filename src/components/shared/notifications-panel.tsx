'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  BellOff,
  FileText,
  StickyNote,
  MessageCircle,
  Video,
  Info,
  ArrowRight,
  CheckCheck,
  Loader2,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Notification, UserProfile, SubjectSection } from '@/lib/types';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// -------------------------------------------------------
// Props
// -------------------------------------------------------
interface NotificationsPanelProps {
  profile: UserProfile;
  onBack: () => void;
}

// -------------------------------------------------------
// Filter tab values
// -------------------------------------------------------
type FilterTab = 'all' | 'unread' | 'quiz' | 'note' | 'lecture' | 'message';

const filterTabs: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'unread', label: 'غير مقروء' },
  { value: 'quiz', label: 'اختبارات' },
  { value: 'note', label: 'ملاحظات' },
  { value: 'lecture', label: 'محاضرات' },
  { value: 'message', label: 'رسائل' },
];

// -------------------------------------------------------
// Icon map – one icon per notification type
// -------------------------------------------------------
const typeIconMap: Record<Notification['type'], React.ElementType> = {
  quiz: FileText,
  note: StickyNote,
  message: MessageCircle,
  lecture: Video,
  system: Info,
};

const typeColorMap: Record<Notification['type'], { bg: string; text: string }> = {
  quiz: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  note: { bg: 'bg-teal-100', text: 'text-teal-600' },
  message: { bg: 'bg-sky-100', text: 'text-sky-600' },
  lecture: { bg: 'bg-violet-100', text: 'text-violet-600' },
  system: { bg: 'bg-amber-100', text: 'text-amber-600' },
};

// -------------------------------------------------------
// Time-ago helper (Arabic)
// -------------------------------------------------------
function timeAgoAr(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'الآن';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  if (days === 1) return 'أمس';
  if (days < 30) return `منذ ${days} يوم`;
  if (days < 365) return `منذ ${Math.floor(days / 30)} شهر`;
  return `منذ ${Math.floor(days / 365)} سنة`;
}

// -------------------------------------------------------
// Browser notification permission request
// -------------------------------------------------------
async function requestBrowserPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function sendBrowserNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/favicon.ico' });
  } catch {
    // Browser may not support the Notification constructor
  }
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------
export default function NotificationsPanel({ profile, onBack }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [markingAll, setMarkingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isInitialMount = useRef(true);
  const { setStudentSection, setTeacherSection, setViewingSubjectId, setSubjectSection } = useAppStore();

  // ---------- Fetch notifications ----------
  const fetchNotifications = useCallback(async () => {
    try {
      if (isInitialMount.current) setLoading(true);

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[NotificationsPanel] Query error:', error);
        return;
      }
      setNotifications((data as Notification[]) ?? []);
    } catch (err) {
      console.error('[NotificationsPanel] fetchNotifications unexpected error:', err);
    } finally {
      if (isInitialMount.current) {
        setLoading(false);
        isInitialMount.current = false;
      }
    }
  }, [profile.id]);

  // ---------- Mark as read ----------
  const markAsRead = useCallback(
    async (notificationId: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)),
      );
      try {
        await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
      } catch {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, is_read: false } : n)),
        );
      }
    },
    [],
  );

  // ---------- Mark all as read ----------
  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setMarkingAll(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds);
      toast.success('تم تحديد الكل كمقروء');
    } catch {
      setNotifications((prev) =>
        prev.map((n) => (unreadIds.includes(n.id) ? { ...n, is_read: false } : n)),
      );
      toast.error('فشل في تحديث الإشعارات');
    } finally {
      setMarkingAll(false);
    }
  }, [notifications]);

  // ---------- Delete single notification ----------
  const deleteNotification = useCallback(
    async (e: React.MouseEvent, notificationId: string) => {
      e.stopPropagation(); // Prevent card click navigation
      setDeletingId(notificationId);
      // Optimistic remove
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      try {
        await supabase.from('notifications').delete().eq('id', notificationId);
        toast.success('تم حذف الإشعار');
      } catch {
        toast.error('فشل في حذف الإشعار');
        fetchNotifications(); // Re-fetch on error
      } finally {
        setDeletingId(null);
      }
    },
    [fetchNotifications],
  );

  // ---------- Clear all notifications ----------
  const clearAllNotifications = useCallback(async () => {
    if (notifications.length === 0) return;
    setClearingAll(true);
    const prevNotifications = [...notifications];
    // Optimistic clear
    setNotifications([]);
    try {
      const allIds = prevNotifications.map((n) => n.id);
      await supabase.from('notifications').delete().in('id', allIds);
      toast.success('تم تفريغ جميع الإشعارات');
    } catch {
      toast.error('فشل في تفريغ الإشعارات');
      setNotifications(prevNotifications); // Revert
    } finally {
      setClearingAll(false);
    }
  }, [notifications]);

  // ---------- Handle notification click → navigate to source ----------
  const handleNotificationClick = useCallback(
    async (notification: Notification) => {
      if (!notification.is_read) {
        markAsRead(notification.id);
      }

      // Navigate to the notification source
      const { type, reference_id } = notification;

      if (!reference_id) {
        // No reference — just mark as read
        return;
      }

      // Resolve subject_id from the entity's reference_id
      const isTeacher = profile.role === 'teacher';
      let targetSubjectId: string | null = null;
      let targetSubjectSection: string | null = null;

      try {
        switch (type) {
          case 'quiz': {
            const { data } = await supabase
              .from('quizzes')
              .select('subject_id')
              .eq('id', reference_id)
              .single();
            if (data?.subject_id) {
              targetSubjectId = data.subject_id;
              targetSubjectSection = 'quizzes';
            } else {
              // Fallback: navigate to quizzes section directly
              setViewingSubjectId(null);
              if (isTeacher) setTeacherSection('quizzes');
              else setStudentSection('quizzes');
              onBack();
              return;
            }
            break;
          }
          case 'note': {
            const { data } = await supabase
              .from('subject_notes')
              .select('subject_id')
              .eq('id', reference_id)
              .single();
            if (data?.subject_id) {
              targetSubjectId = data.subject_id;
              targetSubjectSection = 'notes';
            } else {
              // Fallback: navigate to subjects section
              setViewingSubjectId(null);
              if (isTeacher) setTeacherSection('subjects');
              else setStudentSection('subjects');
              onBack();
              return;
            }
            break;
          }
          case 'lecture': {
            const { data } = await supabase
              .from('lectures')
              .select('subject_id')
              .eq('id', reference_id)
              .single();
            if (data?.subject_id) {
              targetSubjectId = data.subject_id;
              targetSubjectSection = 'lectures';
            } else {
              // Fallback: navigate to subjects section
              setViewingSubjectId(null);
              if (isTeacher) setTeacherSection('subjects');
              else setStudentSection('subjects');
              onBack();
              return;
            }
            break;
          }
          case 'message': {
            const { data } = await supabase
              .from('messages')
              .select('subject_id')
              .eq('id', reference_id)
              .single();
            if (data?.subject_id) {
              targetSubjectId = data.subject_id;
              targetSubjectSection = 'chat';
            } else {
              // Fallback: navigate to chat section directly
              setViewingSubjectId(null);
              if (isTeacher) setTeacherSection('chat');
              else setStudentSection('chat');
              onBack();
              return;
            }
            break;
          }
          default:
            return;
        }
      } catch {
        // Error resolving reference — navigate to the appropriate section
        setViewingSubjectId(null);
        if (type === 'quiz') {
          if (isTeacher) setTeacherSection('quizzes');
          else setStudentSection('quizzes');
        } else if (type === 'message') {
          if (isTeacher) setTeacherSection('chat');
          else setStudentSection('chat');
        } else {
          if (isTeacher) setTeacherSection('subjects');
          else setStudentSection('subjects');
        }
        onBack();
        return;
      }

      // Navigate to the subject detail with the correct tab
      if (targetSubjectId) {
        setViewingSubjectId(targetSubjectId);
        if (targetSubjectSection) {
          setSubjectSection(targetSubjectSection as SubjectSection);
        }
        if (isTeacher) {
          setTeacherSection('subjects');
        } else {
          setStudentSection('subjects');
        }
        // Dismiss the notifications panel so the dashboard shows the subject detail
        onBack();
      }
    },
    [markAsRead, profile.role, setStudentSection, setTeacherSection, setViewingSubjectId, setSubjectSection, onBack],
  );

  // ---------- Subscribe to realtime ----------
  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications((prev) => [newNotification, ...prev]);

          // Toast
          toast(newNotification.title, {
            description: newNotification.content,
          });

          // Browser notification
          sendBrowserNotification(newNotification.title, newNotification.content);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        () => { fetchNotifications(); }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        () => { fetchNotifications(); }
      )
      .subscribe();

    subscriptionRef.current = channel;

    // Polling fallback every 15 seconds
    const pollInterval = setInterval(fetchNotifications, 15000);

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      clearInterval(pollInterval);
    };
  }, [profile.id, fetchNotifications]);

  // ---------- Request browser notification permission ----------
  useEffect(() => {
    requestBrowserPermission();
  }, []);

  // ---------- Filtered list ----------
  const filteredNotifications = notifications.filter((n) => {
    switch (activeFilter) {
      case 'unread':
        return !n.is_read;
      case 'quiz':
        return n.type === 'quiz';
      case 'note':
        return n.type === 'note';
      case 'lecture':
        return n.type === 'lecture';
      case 'message':
        return n.type === 'message';
      default:
        return true;
    }
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------
  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between gap-3 px-4 py-4 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10"
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-foreground">الإشعارات</h2>
            {unreadCount > 0 && (
              <Badge className="bg-emerald-600 text-white text-xs px-2 py-0.5 min-w-[22px] flex items-center justify-center">
                {unreadCount}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllNotifications}
              disabled={clearingAll}
              className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 gap-1.5"
            >
              {clearingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              تفريغ
            </Button>
          )}
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              disabled={markingAll}
              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 gap-1.5"
            >
              {markingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="h-4 w-4" />
              )}
              تحديد الكل كمقروء
            </Button>
          )}
        </div>
      </motion.div>

      {/* Filter Tabs */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="px-4 pt-3"
      >
        <Tabs
          value={activeFilter}
          onValueChange={(v) => setActiveFilter(v as FilterTab)}
        >
          <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50 p-1">
            {filterTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-xs px-3 py-1.5 rounded-md transition-all data-[state=active]:shadow-sm"
              >
                {tab.label}
                {tab.value === 'unread' && unreadCount > 0 && (
                  <span className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">
                    {unreadCount}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </motion.div>

      {/* Notifications List */}
      <div className="flex-1 min-h-0 mt-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            <span className="text-sm">جاري تحميل الإشعارات...</span>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <EmptyState />
        ) : (
          <ScrollArea className="h-full">
            <div className="px-4 pb-4 space-y-2">
              <AnimatePresence mode="popLayout">
                {filteredNotifications.map((notification, index) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    index={index}
                    onClick={handleNotificationClick}
                    onDelete={deleteNotification}
                    deleting={deletingId === notification.id}
                  />
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Notification Card
// -------------------------------------------------------
interface NotificationCardProps {
  notification: Notification;
  index: number;
  onClick: (notification: Notification) => void;
  onDelete: (e: React.MouseEvent, notificationId: string) => void;
  deleting: boolean;
}

function NotificationCard({ notification, index, onClick, onDelete, deleting }: NotificationCardProps) {
  const IconComponent = typeIconMap[notification.type] ?? Info;
  const colors = typeColorMap[notification.type] ?? typeColorMap.system;
  const isNavigable = notification.type !== 'system';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95 }}
      transition={{
        duration: 0.3,
        delay: index * 0.04,
        layout: { duration: 0.25 },
      }}
    >
      <Card
        onClick={() => onClick(notification)}
        className={`
          cursor-pointer transition-all duration-200 border
          ${
            !notification.is_read
              ? 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50'
              : 'bg-background border-border hover:border-emerald-200 hover:bg-muted/30'
          }
          group relative
        `}
      >
        <CardContent className="flex items-start gap-3 p-4">
          {/* Type Icon */}
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors.bg} shadow-sm transition-transform duration-200 group-hover:scale-110`}
          >
            <IconComponent className={`h-5 w-5 ${colors.text}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p
                className={`text-sm leading-snug ${
                  !notification.is_read ? 'font-bold text-foreground' : 'font-medium text-muted-foreground'
                }`}
              >
                {notification.title}
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                {isNavigable && (
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-emerald-500 transition-colors" />
                )}
                {!notification.is_read && (
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200 animate-pulse" />
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {notification.content}
            </p>
            <div className="flex items-center justify-between mt-2">
              <p className="text-[11px] text-muted-foreground/70">
                {timeAgoAr(notification.created_at)}
              </p>
              <button
                onClick={(e) => onDelete(e, notification.id)}
                disabled={deleting}
                className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-600 transition-all"
              >
                {deleting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                حذف
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// -------------------------------------------------------
// Empty State
// -------------------------------------------------------
function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center h-full gap-4 py-16 text-center"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
        <BellOff className="h-10 w-10 text-emerald-300" />
      </div>
      <div>
        <p className="text-lg font-semibold text-foreground">لا توجد إشعارات</p>
        <p className="mt-1 text-sm text-muted-foreground">
          سيتم عرض الإشعارات الجديدة هنا
        </p>
      </div>
    </motion.div>
  );
}
