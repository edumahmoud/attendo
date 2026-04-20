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
  Trash2,
  CheckCheck,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Notification, UserProfile, SubjectSection } from '@/lib/types';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// -------------------------------------------------------
// Props
// -------------------------------------------------------
interface NotificationBellProps {
  profile: UserProfile;
  onOpenPanel: () => void;
}

// -------------------------------------------------------
// Icon map
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
// Component
// -------------------------------------------------------
export default function NotificationBell({ profile, onOpenPanel }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const initialLoadDone = useRef(false);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const { setStudentSection, setTeacherSection, setViewingSubjectId, setSubjectSection } = useAppStore();

  // Fetch notifications using direct Supabase query (fastest)
  const isInitialMount = useRef(true);
  const fetchNotifications = useCallback(async () => {
    try {
      if (isInitialMount.current) setLoading(true);

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('[NotificationBell] Query error:', error);
        return;
      }
      if (data) {
        setNotifications(data as Notification[]);
      }
    } catch (err) {
      console.error('[NotificationBell] fetchNotifications unexpected error:', err);
    } finally {
      if (isInitialMount.current) {
        setLoading(false);
        isInitialMount.current = false;
      }
      initialLoadDone.current = true;
    }
  }, [profile.id]);

  // Fetch on mount
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Refetch silently when popover opens
  useEffect(() => {
    if (open && !isInitialMount.current) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  // Subscribe to realtime notifications
  useEffect(() => {
    const channel = supabase
      .channel('bell-notifications-realtime')
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
          setNotifications((prev) => [newNotification, ...prev].slice(0, 20));

          // Show toast
          toast(newNotification.title, {
            description: newNotification.content,
          });
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

    // Polling fallback: refresh every 15 seconds (silent, no spinner)
    const pollInterval = setInterval(() => fetchNotifications(), 15000);

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      clearInterval(pollInterval);
    };
  }, [profile.id, fetchNotifications]);

  // Unread count
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Mark as read
  const markAsRead = async (notificationId: string) => {
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
  };

  // Mark all as read
  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
    } catch {
      fetchNotifications(false);
    }
  };

  // Delete notification
  const deleteNotification = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    setDeletingId(notificationId);
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    try {
      await supabase.from('notifications').delete().eq('id', notificationId);
    } catch {
      fetchNotifications(false);
    } finally {
      setDeletingId(null);
    }
  };

  // Navigate to notification source
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    const { type, reference_id } = notification;
    if (!reference_id) {
      setOpen(false);
      return;
    }

    const isTeacher = profile.role === 'teacher';
    let targetSubjectId: string | null = null;
    let targetSection: string | null = null;

    try {
      switch (type) {
        case 'quiz': {
          const { data } = await supabase.from('quizzes').select('subject_id').eq('id', reference_id).single();
          if (data?.subject_id) { targetSubjectId = data.subject_id; targetSection = 'quizzes'; }
          else { if (isTeacher) setTeacherSection('quizzes'); else setStudentSection('quizzes'); }
          break;
        }
        case 'note': {
          const { data } = await supabase.from('subject_notes').select('subject_id').eq('id', reference_id).single();
          if (data?.subject_id) { targetSubjectId = data.subject_id; targetSection = 'notes'; }
          break;
        }
        case 'lecture': {
          const { data } = await supabase.from('lectures').select('subject_id').eq('id', reference_id).single();
          if (data?.subject_id) { targetSubjectId = data.subject_id; targetSection = 'lectures'; }
          break;
        }
        case 'message': {
          const { data } = await supabase.from('messages').select('subject_id').eq('id', reference_id).single();
          if (data?.subject_id) { targetSubjectId = data.subject_id; targetSection = 'chat'; }
          else { if (isTeacher) setTeacherSection('chat'); else setStudentSection('chat'); }
          break;
        }
        default:
          setOpen(false);
          return;
      }
    } catch {
      // Error resolving reference — navigate to the appropriate section
      if (type === 'quiz') { if (isTeacher) setTeacherSection('quizzes'); else setStudentSection('quizzes'); }
      else if (type === 'message') { if (isTeacher) setTeacherSection('chat'); else setStudentSection('chat'); }
      else { if (isTeacher) setTeacherSection('subjects'); else setStudentSection('subjects'); }
      setOpen(false);
      return;
    }

    // Close popover first
    setOpen(false);

    // Navigate to the subject detail with the correct tab
    if (targetSubjectId) {
      // Use setTimeout to ensure state updates happen after popover closes
      setTimeout(() => {
        setViewingSubjectId(targetSubjectId);
        if (targetSection) setSubjectSection(targetSection as SubjectSection);
        if (isTeacher) setTeacherSection('subjects');
        else setStudentSection('subjects');
      }, 50);
    }
  };

  // Open full panel
  const handleOpenPanel = () => {
    setOpen(false);
    onOpenPanel();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-0.5 -left-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
          <span className="sr-only">الإشعارات</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        className="w-80 sm:w-96 p-0 rounded-xl shadow-xl border"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-foreground">الإشعارات</h3>
            {unreadCount > 0 && (
              <Badge className="bg-rose-500 text-white text-[10px] px-1.5 py-0 h-5 min-w-5 flex items-center justify-center">
                {unreadCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="h-7 text-[11px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 gap-1 px-2"
              >
                <CheckCheck className="h-3 w-3" />
                تحديد الكل كمقروء
              </Button>
            )}
          </div>
        </div>

        {/* Notifications list */}
        <div className="max-h-80 overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <BellOff className="h-6 w-6 text-emerald-300" />
              </div>
              <p className="text-sm">لا توجد إشعارات</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const IconComponent = typeIconMap[notification.type] ?? Info;
                const colors = typeColorMap[notification.type] ?? typeColorMap.system;
                const isNavigable = notification.type !== 'system';

                return (
                  <motion.div
                    key={notification.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    className={`
                      group cursor-pointer transition-colors
                      ${!notification.is_read ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'hover:bg-muted/30'}
                    `}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start gap-3 p-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}>
                        <IconComponent className={`h-4 w-4 ${colors.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1.5">
                          <p className={`text-xs leading-snug ${!notification.is_read ? 'font-bold text-foreground' : 'font-medium text-muted-foreground'}`}>
                            {notification.title}
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            {isNavigable && (
                              <ArrowRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-emerald-500 transition-colors" />
                            )}
                            {!notification.is_read && (
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            )}
                          </div>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
                          {notification.content}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-[10px] text-muted-foreground/60">
                            {timeAgoAr(notification.created_at)}
                          </p>
                          <button
                            onClick={(e) => deleteNotification(e, notification.id)}
                            disabled={deletingId === notification.id}
                            className="opacity-0 group-hover:opacity-100 text-[10px] text-rose-400 hover:text-rose-600 transition-all"
                          >
                            {deletingId === notification.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 text-xs font-medium"
              onClick={handleOpenPanel}
            >
              عرض جميع الإشعارات
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
