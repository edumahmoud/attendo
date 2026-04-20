'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Send,
  MessageCircle,
  Loader2,
  Users,
  ChevronUp,
  Circle,
  BookOpen,
  Globe,
  UserCircle,
  Search,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Message, UserProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// -------------------------------------------------------
// Props
// -------------------------------------------------------
interface ChatPanelProps {
  profile: UserProfile;
  subjectId?: string;
  receiverId?: string;
  receiverName?: string;
  subjectName?: string;
  onBack?: () => void;
}

// -------------------------------------------------------
// Constants
// -------------------------------------------------------
const MESSAGE_PAGE_SIZE = 50;

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
// Format time as HH:MM
// -------------------------------------------------------
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

// -------------------------------------------------------
// Get initial letters from a name
// -------------------------------------------------------
function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0);
  return parts[0].charAt(0) + parts[parts.length - 1].charAt(0);
}

// -------------------------------------------------------
// Types for chat lists
// -------------------------------------------------------
interface ChatSubject {
  id: string;
  name: string;
  color: string;
  icon?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  lastSenderName?: string;
  unreadCount: number;
  memberCount: number;
}

interface ChatContact {
  id: string;
  name: string;
  email: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
  isOnline: boolean;
}

// -------------------------------------------------------
// Main ChatPanel Component
// -------------------------------------------------------
export default function ChatPanel({
  profile,
  subjectId: initialSubjectId,
  receiverId: initialReceiverId,
  receiverName: initialReceiverName,
  subjectName: initialSubjectName,
  onBack: externalBack,
}: ChatPanelProps) {
  // ---- View State ----
  const [view, setView] = useState<'list' | 'conversation'>(
    initialSubjectId || initialReceiverId ? 'conversation' : 'list'
  );
  const [activeSubjectId, setActiveSubjectId] = useState(initialSubjectId);
  const [activeReceiverId, setActiveReceiverId] = useState(initialReceiverId);
  const [activeReceiverName, setActiveReceiverName] = useState(initialReceiverName);
  const [activeSubjectName, setActiveSubjectName] = useState(initialSubjectName);
  const [activeChatType, setActiveChatType] = useState<'course' | 'general' | 'personal'>(
    initialSubjectId ? 'course' : 'personal'
  );

  // ---- Chat List State ----
  const [subjects, setSubjects] = useState<ChatSubject[]>([]);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // ---- Conversation State ----
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [memberCount, setMemberCount] = useState<number>(0);
  const [deletingChat, setDeletingChat] = useState(false);

  // ---- Refs ----
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isGroupChat = !!activeSubjectId;

  // ---- Open a chat conversation ----
  const openChat = useCallback((
    type: 'course' | 'general' | 'personal',
    id: string,
    name: string,
  ) => {
    setActiveChatType(type);
    if (type === 'course') {
      setActiveSubjectId(id);
      setActiveSubjectName(name);
      setActiveReceiverId(undefined);
      setActiveReceiverName(undefined);
    } else if (type === 'general') {
      // General chat uses a special subject_id convention
      setActiveSubjectId('__general__');
      setActiveSubjectName('المحادثات العامة');
      setActiveReceiverId(undefined);
      setActiveReceiverName(undefined);
    } else {
      setActiveReceiverId(id);
      setActiveReceiverName(name);
      setActiveSubjectId(undefined);
      setActiveSubjectName(undefined);
    }
    setMessages([]);
    setView('conversation');
  }, []);

  // ---- Back to list ----
  const goBackToList = useCallback(() => {
    setView('list');
    // Clean up subscriptions
    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
      subscriptionRef.current = null;
    }
    if (presenceChannelRef.current) {
      supabase.removeChannel(presenceChannelRef.current);
      presenceChannelRef.current = null;
    }
    setMessages([]);
    setMessageText('');
    // Refresh lists
    fetchChatLists();
  }, []);

  // ---- Fetch chat lists ----
  const fetchChatLists = useCallback(async () => {
    setLoadingList(true);
    try {
      // Fetch subjects
      const subjectPromises = await (async () => {
        if (profile.role === 'teacher') {
          const { data } = await supabase
            .from('subjects')
            .select('id, name, color, icon')
            .eq('teacher_id', profile.id)
            .eq('is_active', true);
          return data ?? [];
        } else {
          const { data: enrolled } = await supabase
            .from('subject_students')
            .select('subject_id, subjects(id, name, color, icon)')
            .eq('student_id', profile.id);
          return (enrolled ?? []).map((e: Record<string, unknown>) => e.subjects).filter(Boolean);
        }
      })();

      // Fetch last message & member count for each subject
      const subjectList: ChatSubject[] = await Promise.all(
        subjectPromises.map(async (s: Record<string, unknown>) => {
          const subjectId = s.id as string;
          const subjectName = s.name as string;
          const color = s.color as string;
          const icon = s.icon as string | undefined;

          // Last message
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('content, created_at, sender_id, sender:users!messages_sender_id_fkey(name)')
            .eq('subject_id', subjectId)
            .is('receiver_id', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Member count
          const { count } = await supabase
            .from('subject_students')
            .select('*', { count: 'exact', head: true })
            .eq('subject_id', subjectId);

          // Unread count: messages not from me in this subject
          const { count: unreadCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('subject_id', subjectId)
            .is('receiver_id', null)
            .neq('sender_id', profile.id);

          return {
            id: subjectId,
            name: subjectName,
            color,
            icon,
            lastMessage: lastMsg?.content ?? undefined,
            lastMessageTime: lastMsg?.created_at ?? undefined,
            lastSenderName: (lastMsg?.sender as Record<string, string>)?.name ?? undefined,
            unreadCount: unreadCount ?? 0,
            memberCount: (count ?? 0) + 1,
          };
        })
      );

      // Sort by last message time (most recent first)
      subjectList.sort((a, b) => {
        if (a.lastMessageTime && b.lastMessageTime) {
          return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
        }
        if (a.lastMessageTime) return -1;
        if (b.lastMessageTime) return 1;
        return 0;
      });

      setSubjects(subjectList);

      // Fetch personal chat contacts (people I've chatted with)
      const { data: sentMessages } = await supabase
        .from('messages')
        .select('receiver_id, receiver:users!messages_receiver_id_fkey(id, name, email)')
        .eq('sender_id', profile.id)
        .not('receiver_id', 'is', null)
        .is('subject_id', null);

      const { data: receivedMessages } = await supabase
        .from('messages')
        .select('sender_id, sender:users!messages_sender_id_fkey(id, name, email)')
        .eq('receiver_id', profile.id)
        .is('subject_id', null);

      // Build unique contacts map
      const contactsMap = new Map<string, { name: string; email: string }>();
      
      for (const msg of (sentMessages ?? [])) {
        const receiver = msg.receiver as Record<string, string> | null;
        if (receiver?.id) {
          contactsMap.set(receiver.id, { name: receiver.name ?? 'مستخدم', email: receiver.email ?? '' });
        }
      }
      for (const msg of (receivedMessages ?? [])) {
        const sender = msg.sender as Record<string, string> | null;
        if (sender?.id) {
          contactsMap.set(sender.id, { name: sender.name ?? 'مستخدم', email: sender.email ?? '' });
        }
      }

      // Fetch last message for each contact
      const contactList: ChatContact[] = await Promise.all(
        Array.from(contactsMap.entries()).map(async ([id, info]) => {
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('content, created_at')
            .is('subject_id', null)
            .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${profile.id})`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Unread count: messages from this contact to me
          const { count: contactUnreadCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', id)
            .eq('receiver_id', profile.id)
            .is('subject_id', null);

          return {
            id,
            name: info.name,
            email: info.email,
            lastMessage: lastMsg?.content ?? undefined,
            lastMessageTime: lastMsg?.created_at ?? undefined,
            unreadCount: contactUnreadCount ?? 0,
            isOnline: false,
          };
        })
      );

      // Sort by last message time
      contactList.sort((a, b) => {
        if (a.lastMessageTime && b.lastMessageTime) {
          return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
        }
        if (a.lastMessageTime) return -1;
        if (b.lastMessageTime) return 1;
        return a.name.localeCompare(b.name, 'ar');
      });

      setContacts(contactList);
    } catch {
      toast.error('فشل في تحميل قائمة المحادثات');
    } finally {
      setLoadingList(false);
    }
  }, [profile.id, profile.role]);

  // ---- Load chat lists on mount ----
  useEffect(() => {
    fetchChatLists();
  }, [fetchChatLists]);

  // ---- Fetch users for starting new personal chat ----
  const [availableUsers, setAvailableUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const fetchAvailableUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      // Get user IDs from same subjects
      let userIds: string[] = [];
      if (profile.role === 'teacher') {
        const { data: subjectsData } = await supabase
          .from('subjects')
          .select('id')
          .eq('teacher_id', profile.id);
        if (subjectsData && subjectsData.length > 0) {
          const subjectIds = subjectsData.map((s: Record<string, unknown>) => s.id);
          const { data: students } = await supabase
            .from('subject_students')
            .select('student_id')
            .in('subject_id', subjectIds);
          userIds = (students ?? []).map((s: Record<string, unknown>) => s.student_id as string);
        }
      } else {
        const { data: enrolled } = await supabase
          .from('subject_students')
          .select('subject_id')
          .eq('student_id', profile.id);
        if (enrolled && enrolled.length > 0) {
          const subjectIds = enrolled.map((e: Record<string, unknown>) => e.subject_id);
          // Get other students in same subjects
          const { data: students } = await supabase
            .from('subject_students')
            .select('student_id')
            .in('subject_id', subjectIds);
          userIds = (students ?? []).map((s: Record<string, unknown>) => s.student_id as string);
          // Get teachers
          const { data: teachers } = await supabase
            .from('subjects')
            .select('teacher_id')
            .in('id', subjectIds);
          userIds = [
            ...userIds,
            ...(teachers ?? []).map((t: Record<string, unknown>) => t.teacher_id as string),
          ];
        }
      }

      // Remove duplicates and self
      userIds = [...new Set(userIds)].filter((id) => id !== profile.id);

      if (userIds.length === 0) {
        setAvailableUsers([]);
        return;
      }

      const { data: users } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', userIds);

      setAvailableUsers(
        (users ?? []).map((u: Record<string, string>) => ({
          id: u.id,
          name: u.name,
          email: u.email,
        }))
      );
    } catch {
      // silently ignore
    } finally {
      setLoadingUsers(false);
    }
  }, [profile.id, profile.role]);

  // ============================================================
  // CONVERSATION VIEW LOGIC (from original ChatPanel)
  // ============================================================

  // ---- Scroll to bottom ----
  const scrollToBottom = useCallback((smooth = true) => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: smooth ? 'smooth' : 'instant',
      });
    }, 50);
  }, []);

  // ---- Fetch messages ----
  const fetchMessages = useCallback(async () => {
    if (!activeSubjectId && !activeReceiverId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('messages')
        .select('*, sender:users!messages_sender_id_fkey(name, email)')
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      if (activeSubjectId === '__general__') {
        // General chat: subject_id is null and receiver_id is null
        query = query.is('subject_id', null).is('receiver_id', null);
      } else if (activeSubjectId) {
        query = query.eq('subject_id', activeSubjectId).is('receiver_id', null);
      } else if (activeReceiverId) {
        query = query
          .is('subject_id', null)
          .or(
            `and(sender_id.eq.${profile.id},receiver_id.eq.${activeReceiverId}),and(sender_id.eq.${activeReceiverId},receiver_id.eq.${profile.id})`,
          );
      }

      const { data, error } = await query;

      if (error) {
        toast.error('فشل في تحميل الرسائل');
        return;
      }

      const fetched = (data as (Message & { sender?: { name?: string; email?: string } })[]) ?? [];
      const mapped: Message[] = fetched.map((m) => ({
        ...m,
        sender_name: m.sender?.name ?? m.sender_name ?? 'مستخدم',
        sender_email: m.sender?.email ?? m.sender_email,
      }));

      setMessages(mapped.reverse());
      setHasMore(mapped.length >= MESSAGE_PAGE_SIZE);
    } catch {
      toast.error('حدث خطأ أثناء تحميل الرسائل');
    } finally {
      setLoading(false);
    }
  }, [activeSubjectId, activeReceiverId, profile.id]);

  // ---- Load more messages (older) ----
  const loadMore = useCallback(async () => {
    if (loadingMore || messages.length === 0) return;
    setLoadingMore(true);

    try {
      const oldestMessage = messages[0];
      let query = supabase
        .from('messages')
        .select('*, sender:users!messages_sender_id_fkey(name, email)')
        .lt('created_at', oldestMessage.created_at)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      if (activeSubjectId === '__general__') {
        query = query.is('subject_id', null).is('receiver_id', null);
      } else if (activeSubjectId) {
        query = query.eq('subject_id', activeSubjectId).is('receiver_id', null);
      } else if (activeReceiverId) {
        query = query
          .is('subject_id', null)
          .or(
            `and(sender_id.eq.${profile.id},receiver_id.eq.${activeReceiverId}),and(sender_id.eq.${activeReceiverId},receiver_id.eq.${profile.id})`,
          );
      }

      const { data, error } = await query;
      if (error) {
        toast.error('فشل في تحميل المزيد من الرسائل');
        return;
      }

      const fetched = (data as (Message & { sender?: { name?: string; email?: string } })[]) ?? [];
      const mapped: Message[] = fetched.map((m) => ({
        ...m,
        sender_name: m.sender?.name ?? m.sender_name ?? 'مستخدم',
        sender_email: m.sender?.email ?? m.sender_email,
      }));

      if (mapped.length > 0) {
        setMessages((prev) => [...mapped.reverse(), ...prev]);
        setHasMore(mapped.length >= MESSAGE_PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } catch {
      toast.error('حدث خطأ أثناء تحميل الرسائل');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, messages, activeSubjectId, activeReceiverId, profile.id]);

  // ---- Fetch member count ----
  const fetchMemberCount = useCallback(async () => {
    if (!activeSubjectId || activeSubjectId === '__general__') return;
    try {
      const { count, error } = await supabase
        .from('subject_students')
        .select('*', { count: 'exact', head: true })
        .eq('subject_id', activeSubjectId);
      if (!error && count !== null) {
        setMemberCount(count + 1);
      }
    } catch {
      // silently ignore
    }
  }, [activeSubjectId]);

  // ---- Send message (optimistic) ----
  const sendMessage = useCallback(async () => {
    const trimmed = messageText.trim();
    if (!trimmed || sending) return;

    setSending(true);
    const contentToSend = trimmed;
    setMessageText(''); // Clear input immediately for better UX

    // Optimistic: generate a temp ID and add message to UI immediately
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const optimisticMsg: Message = {
      id: tempId,
      sender_id: profile.id,
      content: contentToSend,
      message_type: activeSubjectId === '__general__' ? 'general' : 'text',
      subject_id: activeSubjectId === '__general__' ? undefined : (activeSubjectId || undefined),
      receiver_id: activeReceiverId || undefined,
      created_at: new Date().toISOString(),
      sender_name: profile.name,
      sender_email: profile.email,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    scrollToBottom();

    try {
      const insertData: Record<string, unknown> = {
        sender_id: profile.id,
        content: contentToSend,
        message_type: activeSubjectId === '__general__' ? 'general' : 'text',
      };

      if (activeSubjectId === '__general__') {
        insertData.subject_id = null;
        insertData.receiver_id = null;
      } else if (activeSubjectId) {
        insertData.subject_id = activeSubjectId;
        insertData.receiver_id = null;
      } else if (activeReceiverId) {
        insertData.subject_id = null;
        insertData.receiver_id = activeReceiverId;
      }

      const { data: insertedData, error } = await supabase
        .from('messages')
        .insert(insertData)
        .select('id')
        .single();

      if (error) {
        console.error('[Chat] Send error:', error);
        toast.error('فشل في إرسال الرسالة');
        // Remove the optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setMessageText(contentToSend);
        return;
      }

      // Replace optimistic message with real one (same content, real ID)
      if (insertedData?.id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, id: insertedData.id } : m
          )
        );
      }
    } catch (err) {
      console.error('[Chat] Send exception:', err);
      toast.error('حدث خطأ أثناء إرسال الرسالة');
      // Remove the optimistic message on exception
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }, [messageText, sending, profile.id, profile.name, profile.email, activeSubjectId, activeReceiverId, scrollToBottom]);

  // ---- Delete conversation ----
  const handleDeleteConversation = useCallback(async () => {
    setDeletingChat(true);
    try {
      let query = supabase.from('messages').delete();

      if (activeSubjectId === '__general__') {
        // General chat: delete messages with no subject_id and no receiver_id
        query = query.is('subject_id', null).is('receiver_id', null);
      } else if (activeSubjectId) {
        // Subject group chat: delete messages for this subject
        query = query.eq('subject_id', activeSubjectId).is('receiver_id', null);
      } else if (activeReceiverId) {
        // Private chat: delete messages between the two users
        query = query
          .is('subject_id', null)
          .or(
            `and(sender_id.eq.${profile.id},receiver_id.eq.${activeReceiverId}),and(sender_id.eq.${activeReceiverId},receiver_id.eq.${profile.id})`,
          );
      }

      const { error } = await query;

      if (error) {
        console.error('[Chat] Delete error:', error);
        toast.error('فشل في حذف المحادثة');
        return;
      }

      toast.success('تم حذف المحادثة بنجاح');
      setMessages([]);
      goBackToList();
    } catch (err) {
      console.error('[Chat] Delete exception:', err);
      toast.error('حدث خطأ أثناء حذف المحادثة');
    } finally {
      setDeletingChat(false);
    }
  }, [activeSubjectId, activeReceiverId, profile.id, goBackToList]);

  // ---- Handle key press ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  // ---- Subscribe to realtime messages ----
  useEffect(() => {
    if (view !== 'conversation') return;
    if (!activeSubjectId && !activeReceiverId) return;

    fetchMessages();
    if (activeSubjectId && activeSubjectId !== '__general__') fetchMemberCount();

    const channelName = activeSubjectId
      ? `chat-group-${activeSubjectId}`
      : `chat-private-${[profile.id, activeReceiverId].sort().join('-')}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          ...(activeSubjectId && activeSubjectId !== '__general__'
            ? { filter: `subject_id=eq.${activeSubjectId}` }
            : {}),
        },
        async (payload) => {
          const newMsg = payload.new as Message;

          if (!activeSubjectId) {
            // Private chat - filter client-side
            const isRelevant =
              (newMsg.sender_id === profile.id && newMsg.receiver_id === activeReceiverId) ||
              (newMsg.sender_id === activeReceiverId && newMsg.receiver_id === profile.id);
            if (!isRelevant) return;
          } else if (activeSubjectId === '__general__') {
            // General chat - only messages with no subject_id and no receiver_id
            if (newMsg.subject_id !== null || newMsg.receiver_id !== null) return;
          }

          let senderName = newMsg.sender_name ?? 'مستخدم';
          if (!newMsg.sender_name) {
            const { data: sender } = await supabase
              .from('users')
              .select('name')
              .eq('id', newMsg.sender_id)
              .single();
            senderName = sender?.name ?? 'مستخدم';
          }

          setMessages((prev) => {
            // Skip if we already have this message by real ID
            if (prev.some((m) => m.id === newMsg.id)) return prev;

            // Check if this is a realtime echo of our own optimistic message
            // (same sender, same content, within 5 seconds, with a temp ID)
            const isOwnOptimisticEcho = newMsg.sender_id === profile.id && prev.some((m) =>
              m.id.startsWith('temp-') &&
              m.sender_id === profile.id &&
              m.content === newMsg.content &&
              Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 5000
            );

            if (isOwnOptimisticEcho) {
              // Replace the optimistic message with the real one
              return prev.map((m) =>
                m.id.startsWith('temp-') && m.sender_id === profile.id && m.content === newMsg.content
                  ? { ...m, id: newMsg.id }
                  : m
              );
            }

            return [...prev, { ...newMsg, sender_name: senderName }];
          });
          scrollToBottom();
        },
      )
      .subscribe((status) => {
        console.log('[Chat] Realtime subscription status:', status, 'channel:', channelName);
      });

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [view, profile.id, activeSubjectId, activeReceiverId, fetchMessages, fetchMemberCount, scrollToBottom]);

  // ---- Track latest message timestamp via ref for smart polling ----
  const latestMessageTimeRef = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length > 0) {
      // Track the most recent message timestamp (skip optimistic temp IDs)
      const realMessages = messages.filter((m) => !m.id.startsWith('temp-'));
      if (realMessages.length > 0) {
        latestMessageTimeRef.current = realMessages[realMessages.length - 1].created_at;
      }
    }
  }, [messages]);

  // ---- Smart polling: fetch ONLY new messages and append them ----
  useEffect(() => {
    if (view !== 'conversation') return;
    if (!activeSubjectId && !activeReceiverId) return;

    const interval = setInterval(async () => {
      try {
        const afterTime = latestMessageTimeRef.current;
        if (!afterTime) return; // No messages yet, skip

        // Fetch only messages newer than our latest
        let query = supabase
          .from('messages')
          .select('*, sender:users!messages_sender_id_fkey(name, email)')
          .gt('created_at', afterTime)
          .order('created_at', { ascending: true });

        if (activeSubjectId === '__general__') {
          query = query.is('subject_id', null).is('receiver_id', null);
        } else if (activeSubjectId) {
          query = query.eq('subject_id', activeSubjectId).is('receiver_id', null);
        } else if (activeReceiverId) {
          query = query
            .is('subject_id', null)
            .or(
              `and(sender_id.eq.${profile.id},receiver_id.eq.${activeReceiverId}),and(sender_id.eq.${activeReceiverId},receiver_id.eq.${profile.id})`,
            );
        }

        const { data, error } = await query;
        if (error || !data || data.length === 0) return;

        const newMessages: Message[] = (data as (Message & { sender?: { name?: string; email?: string } })[]).map((m) => ({
          ...m,
          sender_name: m.sender?.name ?? m.sender_name ?? 'مستخدم',
          sender_email: m.sender?.email ?? m.sender_email,
        }));

        // Only add messages we don't already have (by ID)
        const existingIds = new Set(messages.map((m) => m.id));
        const trulyNew = newMessages.filter((m) => !existingIds.has(m.id) && !m.id.startsWith('temp-'));

        if (trulyNew.length > 0) {
          setMessages((prev) => {
            const prevIds = new Set(prev.map((m) => m.id));
            const toAdd = trulyNew.filter((m) => !prevIds.has(m.id));
            if (toAdd.length === 0) return prev;
            return [...prev, ...toAdd];
          });
          scrollToBottom();
        }
      } catch {
        // silently ignore polling errors
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [view, activeSubjectId, activeReceiverId, profile.id, messages, scrollToBottom]);

  // ---- Presence ----
  useEffect(() => {
    if (view !== 'conversation') return;
    if (!activeSubjectId && !activeReceiverId) return;

    const presenceChannelName = activeSubjectId
      ? `presence-group-${activeSubjectId}`
      : `presence-private-${[profile.id, activeReceiverId].sort().join('-')}`;

    const channel = supabase.channel(presenceChannelName, {
      config: { presence: { key: profile.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>();
        for (const key of Object.keys(state)) {
          ids.add(key);
        }
        setOnlineUserIds(ids);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: profile.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    presenceChannelRef.current = channel;

    return () => {
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
    };
  }, [view, profile.id, activeSubjectId, activeReceiverId]);

  // ---- Auto-scroll on initial load ----
  useEffect(() => {
    if (!loading && messages.length > 0) {
      scrollToBottom(false);
    }
  }, [loading, messages.length, scrollToBottom]);

  const isReceiverOnline = !isGroupChat && activeReceiverId ? onlineUserIds.has(activeReceiverId) : false;
  const onlineCount = onlineUserIds.size;

  // ---- Chat title ----
  const chatTitle = activeSubjectId === '__general__'
    ? 'المحادثات العامة'
    : isGroupChat
      ? `مجموعة ${activeSubjectName ?? 'المادة'}`
      : activeReceiverName ?? 'محادثة';

  // ---- Filter helpers ----
  const filteredSubjects = subjects.filter((s) =>
    s.name.includes(searchQuery)
  );
  const filteredContacts = contacts.filter((c) =>
    c.name.includes(searchQuery) || c.email.includes(searchQuery)
  );

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="flex flex-col h-full" dir="rtl">
      <AnimatePresence mode="wait">
        {view === 'list' ? (
          // ============================
          // CHAT LIST VIEW
          // ============================
          <motion.div
            key="list"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col h-full"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-background/80 backdrop-blur-sm">
              {externalBack && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={externalBack}
                  className="hover:bg-emerald-50 hover:text-emerald-600 transition-colors shrink-0"
                >
                  <ArrowRight className="h-5 w-5" />
                </Button>
              )}
              <div className="flex items-center gap-2 flex-1">
                <MessageCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                <h2 className="text-lg font-bold text-foreground">المحادثات</h2>
              </div>
            </div>

            {/* Search */}
            <div className="px-4 py-2 border-b">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث في المحادثات..."
                  className="pr-9 h-9 text-sm rounded-lg"
                />
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="course" className="flex flex-col flex-1 min-h-0">
              <TabsList className="mx-4 mt-2 mb-1 grid w-auto grid-cols-3 bg-muted/50">
                <TabsTrigger value="course" className="text-xs gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                  <BookOpen className="h-3.5 w-3.5" />
                  المقررات
                </TabsTrigger>
                <TabsTrigger value="general" className="text-xs gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                  <Globe className="h-3.5 w-3.5" />
                  عامة
                </TabsTrigger>
                <TabsTrigger value="personal" className="text-xs gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                  <UserCircle className="h-3.5 w-3.5" />
                  شخصية
                </TabsTrigger>
              </TabsList>

              {/* Course Chats Tab */}
              <TabsContent value="course" className="flex-1 min-h-0 mt-0">
                <ScrollArea className="h-full">
                  {loadingList ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                      <span className="text-sm">جاري تحميل المقررات...</span>
                    </div>
                  ) : filteredSubjects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                      <BookOpen className="h-10 w-10 text-emerald-300" />
                      <p className="text-sm">لا توجد مقررات بعد</p>
                      <p className="text-xs text-muted-foreground/60">سجل في مقرر للوصول لمحادثته</p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {filteredSubjects.map((subject) => (
                        <ChatListItem
                          key={subject.id}
                          icon={
                            <div
                              className="flex h-10 w-10 items-center justify-center rounded-full shrink-0"
                              style={{ backgroundColor: subject.color + '20' }}
                            >
                              <BookOpen className="h-5 w-5" style={{ color: subject.color }} />
                            </div>
                          }
                          title={subject.name}
                          subtitle={
                            subject.lastMessage
                              ? `${subject.lastSenderName ? subject.lastSenderName + ': ' : ''}${subject.lastMessage}`
                              : 'لا توجد رسائل بعد'
                          }
                          time={subject.lastMessageTime}
                          badge={subject.unreadCount}
                          extra={`${subject.memberCount} عضو`}
                          onClick={() => openChat('course', subject.id, subject.name)}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              {/* General Chat Tab */}
              <TabsContent value="general" className="flex-1 min-h-0 mt-0">
                <ScrollArea className="h-full">
                  <div className="py-1">
                    <ChatListItem
                      icon={
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 shrink-0">
                          <Globe className="h-5 w-5 text-amber-600" />
                        </div>
                      }
                      title="المحادثات العامة"
                      subtitle="محادثة عامة لجميع المستخدمين"
                      onClick={() => openChat('general', '__general__', 'المحادثات العامة')}
                    />
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Personal Chats Tab */}
              <TabsContent value="personal" className="flex-1 min-h-0 mt-0">
                <div className="flex items-center justify-between px-4 py-1">
                  <span className="text-xs text-muted-foreground">
                    {filteredContacts.length} محادثة
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNewChat(true);
                      fetchAvailableUsers();
                    }}
                    className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 gap-1 h-7 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    محادثة جديدة
                  </Button>
                </div>
                <ScrollArea className="flex-1 min-h-0">
                  {loadingList ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                      <span className="text-sm">جاري تحميل المحادثات...</span>
                    </div>
                  ) : filteredContacts.length === 0 && !showNewChat ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                      <UserCircle className="h-10 w-10 text-emerald-300" />
                      <p className="text-sm">لا توجد محادثات شخصية</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowNewChat(true);
                          fetchAvailableUsers();
                        }}
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 gap-1.5 mt-1"
                      >
                        <Plus className="h-4 w-4" />
                        ابدأ محادثة جديدة
                      </Button>
                    </div>
                  ) : (
                    <div className="py-1">
                      {filteredContacts.map((contact) => (
                        <ChatListItem
                          key={contact.id}
                          icon={
                            <div className="relative shrink-0">
                              <Avatar className="h-10 w-10 border border-emerald-200">
                                <AvatarFallback className="bg-teal-100 text-teal-700 font-semibold text-sm">
                                  {getInitials(contact.name)}
                                </AvatarFallback>
                              </Avatar>
                              {contact.isOnline && (
                                <Circle className="absolute -bottom-0.5 -left-0.5 h-3 w-3 fill-emerald-500 text-white stroke-2" />
                              )}
                            </div>
                          }
                          title={contact.name}
                          subtitle={contact.lastMessage ?? 'لا توجد رسائل بعد'}
                          time={contact.lastMessageTime}
                          badge={contact.unreadCount}
                          onClick={() => openChat('personal', contact.id, contact.name)}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>

                {/* New Chat Dialog */}
                <AnimatePresence>
                  {showNewChat && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 20 }}
                      className="absolute inset-0 bg-background z-20 flex flex-col"
                    >
                      <div className="flex items-center gap-3 px-4 py-3 border-b">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowNewChat(false)}
                          className="hover:bg-emerald-50 hover:text-emerald-600 shrink-0"
                        >
                          <ArrowRight className="h-5 w-5" />
                        </Button>
                        <h3 className="text-base font-bold">محادثة جديدة</h3>
                      </div>
                      <ScrollArea className="flex-1">
                        {loadingUsers ? (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                          </div>
                        ) : availableUsers.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                            <Users className="h-10 w-10 text-emerald-300" />
                            <p className="text-sm">لا يوجد مستخدمون متاحون</p>
                          </div>
                        ) : (
                          <div className="py-1">
                            {availableUsers
                              .filter((u) => !contacts.some((c) => c.id === u.id))
                              .map((user) => (
                                <ChatListItem
                                  key={user.id}
                                  icon={
                                    <Avatar className="h-10 w-10 border border-emerald-200 shrink-0">
                                      <AvatarFallback className="bg-teal-100 text-teal-700 font-semibold text-sm">
                                        {getInitials(user.name)}
                                      </AvatarFallback>
                                    </Avatar>
                                  }
                                  title={user.name}
                                  subtitle={user.email}
                                  onClick={() => {
                                    setShowNewChat(false);
                                    openChat('personal', user.id, user.name);
                                  }}
                                />
                              ))}
                          </div>
                        )}
                      </ScrollArea>
                    </motion.div>
                  )}
                </AnimatePresence>
              </TabsContent>
            </Tabs>
          </motion.div>
        ) : (
          // ============================
          // CONVERSATION VIEW
          // ============================
          <motion.div
            key="conversation"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col h-full"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
              <Button
                variant="ghost"
                size="icon"
                onClick={goBackToList}
                className="hover:bg-emerald-50 hover:text-emerald-600 transition-colors shrink-0"
              >
                <ArrowRight className="h-5 w-5" />
              </Button>

              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Avatar */}
                {isGroupChat ? (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    {activeSubjectId === '__general__' ? (
                      <Globe className="h-5 w-5 text-amber-600" />
                    ) : (
                      <Users className="h-5 w-5 text-emerald-600" />
                    )}
                  </div>
                ) : (
                  <Avatar className="h-10 w-10 shrink-0 border-2 border-emerald-200">
                    <AvatarFallback className="bg-teal-100 text-teal-700 font-semibold text-sm">
                      {getInitials(activeReceiverName ?? '؟')}
                    </AvatarFallback>
                  </Avatar>
                )}

                {/* Title and subtitle */}
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-foreground truncate">
                    {chatTitle}
                  </h2>
                  <div className="flex items-center gap-1.5">
                    {isGroupChat ? (
                      <span className="text-xs text-muted-foreground">
                        {activeSubjectId === '__general__'
                          ? 'جميع المستخدمين'
                          : memberCount > 0
                            ? `${memberCount} عضو`
                            : 'مجموعة دراسية'}
                        {onlineCount > 0 && (
                          <span className="text-emerald-600 mr-1">· {onlineCount} متصل</span>
                        )}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs">
                        <Circle
                          className={`h-2.5 w-2.5 ${
                            isReceiverOnline
                              ? 'fill-emerald-500 text-emerald-500'
                              : 'fill-muted-foreground/30 text-muted-foreground/30'
                          }`}
                        />
                        <span className={isReceiverOnline ? 'text-emerald-600' : 'text-muted-foreground'}>
                          {isReceiverOnline ? 'متصل الآن' : 'غير متصل'}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Online badge for group */}
              {isGroupChat && onlineCount > 0 && (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs shrink-0">
                  <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500 ml-1" />
                  {onlineCount}
                </Badge>
              )}

              {/* Delete conversation button */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deletingChat}
                    className="hover:bg-rose-50 hover:text-rose-600 transition-colors shrink-0"
                  >
                    {deletingChat ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>حذف المحادثة</AlertDialogTitle>
                    <AlertDialogDescription>
                      هل أنت متأكد من حذف جميع رسائل هذه المحادثة؟ لا يمكن التراجع عن هذا الإجراء.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-row gap-2">
                    <AlertDialogCancel className="flex-1">إلغاء</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteConversation}
                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      حذف المحادثة
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Messages Area */}
            <div className="flex-1 min-h-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                  <span className="text-sm">جاري تحميل الرسائل...</span>
                </div>
              ) : messages.length === 0 ? (
                <EmptyChatState />
              ) : (
                <ScrollArea className="h-full">
                  <div className="px-4 py-4 space-y-1">
                    {hasMore && (
                      <div className="flex justify-center pb-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={loadMore}
                          disabled={loadingMore}
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 gap-1.5 text-xs"
                        >
                          {loadingMore ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ChevronUp className="h-3.5 w-3.5" />
                          )}
                          تحميل المزيد
                        </Button>
                      </div>
                    )}

                    <AnimatePresence mode="popLayout">
                      {messages.map((message, index) => (
                        <ChatBubble
                          key={message.id}
                          message={message}
                          isOwn={message.sender_id === profile.id}
                          index={index}
                          showSender={isGroupChat && message.sender_id !== profile.id}
                          isOnline={onlineUserIds.has(message.sender_id)}
                        />
                      ))}
                    </AnimatePresence>

                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Message Input */}
            <div className="border-t bg-background/80 backdrop-blur-sm px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="اكتب رسالة..."
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-400 transition-all max-h-32 min-h-[42px]"
                  style={{
                    height: 'auto',
                    overflow: 'auto',
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                  }}
                  disabled={sending}
                />
                <Button
                  onClick={sendMessage}
                  disabled={!messageText.trim() || sending}
                  size="icon"
                  className="h-[42px] w-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 transition-all disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-5" />
                  )}
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground/60 text-center">
                Enter للإرسال · Shift+Enter لسطر جديد
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// -------------------------------------------------------
// Chat List Item
// -------------------------------------------------------
interface ChatListItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  time?: string;
  badge?: number;
  extra?: string;
  onClick: () => void;
}

function ChatListItem({ icon, title, subtitle, time, badge, extra, onClick }: ChatListItemProps) {
  return (
    <motion.button
      whileHover={{ backgroundColor: 'rgba(0,0,0,0.02)' }}
      whileTap={{ scale: 0.995 }}
      onClick={onClick}
      className="flex items-center gap-3 w-full px-4 py-3 text-right transition-colors hover:bg-muted/40"
    >
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground truncate">{title}</span>
          {time && (
            <span className="text-[10px] text-muted-foreground shrink-0">{timeAgoAr(time)}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">{subtitle}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {extra && (
              <span className="text-[10px] text-muted-foreground/60">{extra}</span>
            )}
            {badge && badge > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-bold text-white">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// -------------------------------------------------------
// Chat Bubble
// -------------------------------------------------------
interface ChatBubbleProps {
  message: Message;
  isOwn: boolean;
  index: number;
  showSender: boolean;
  isOnline: boolean;
}

function ChatBubble({ message, isOwn, index, showSender, isOnline }: ChatBubbleProps) {
  const senderName = message.sender_name ?? 'مستخدم';
  const initials = getInitials(senderName);
  const isOptimistic = message.id.startsWith('temp-');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        duration: 0.25,
        delay: Math.min(index * 0.03, 0.3),
        layout: { duration: 0.2 },
      }}
      className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-end`}
    >
      {!isOwn && (
        <div className="shrink-0 mb-6">
          <Avatar className="h-8 w-8 border border-emerald-200">
            <AvatarFallback className="bg-teal-100 text-teal-700 font-semibold text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      )}

      <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[75%] min-w-0`}>
        {showSender && (
          <div className="flex items-center gap-1.5 mb-1 mr-1">
            <span className="text-xs font-medium text-emerald-700">{senderName}</span>
            {isOnline && (
              <Circle className="h-1.5 w-1.5 fill-emerald-500 text-emerald-500" />
            )}
          </div>
        )}

        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap ${
            isOwn
              ? 'bg-emerald-600 text-white rounded-bl-md'
              : 'bg-muted text-foreground rounded-br-md'
          }`}
        >
          {message.content}
        </div>

        <span
          className={`text-[10px] mt-1 px-1 ${
            isOwn ? 'text-muted-foreground/60' : 'text-muted-foreground/50'
          }`}
        >
          {isOptimistic ? (
            <span className="text-emerald-500 flex items-center gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              جارٍ الإرسال
            </span>
          ) : (
            <>
              {formatTime(message.created_at)}
              <span className="mx-1">·</span>
              {timeAgoAr(message.created_at)}
            </>
          )}
        </span>
      </div>
    </motion.div>
  );
}

// -------------------------------------------------------
// Empty Chat State
// -------------------------------------------------------
function EmptyChatState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center h-full gap-4 py-16 text-center"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
        <MessageCircle className="h-10 w-10 text-emerald-300" />
      </div>
      <div>
        <p className="text-lg font-semibold text-foreground">ابدأ المحادثة</p>
        <p className="mt-1 text-sm text-muted-foreground">
          كن أول من يرسل رسالة في هذه المحادثة
        </p>
      </div>
    </motion.div>
  );
}
