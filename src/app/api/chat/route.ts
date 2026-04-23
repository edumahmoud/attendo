import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getAdminHeaders() {
  return {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

/**
 * Chat API Route
 * 
 * GET: Fetch conversations or messages
 * POST: Send message, create conversation, mark as read, delete/edit message
 * 
 * Query params for GET:
 *   - action=conversations → list user's conversations (requires userId)
 *   - action=messages → list messages in a conversation (requires conversationId)
 *   - action=group-conversation → get group conversation for a subject (requires subjectId)
 *   - action=participants → get participants in a conversation (requires conversationId)
 *   - action=search-users → search users in same subject (requires subjectId, query)
 * 
 * Body params for POST:
 *   - action=send-message → send a message
 *   - action=create-individual → create individual conversation
 *   - action=mark-read → mark conversation as read
 *   - action=ensure-group → ensure group conversation exists for subject
 *   - action=delete-message → soft-delete a message (sets is_deleted=true, changes content)
 *   - action=edit-message → edit a message (sets is_edited=true, updates content)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'conversations': {
        const userId = searchParams.get('userId');
        if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

        // Get all conversations the user is part of, with last message and unread count
        const { data: participations, error: pError } = await fetch(
          `${SUPABASE_URL}/rest/v1/conversation_participants?select=conversation_id,last_read_at,conversations(id,type,subject_id,title,created_at,updated_at)&user_id=eq.${userId}`,
          { headers: getAdminHeaders() }
        ).then(r => r.json());

        if (pError) return NextResponse.json({ error: pError }, { status: 500 });

        // For each conversation, get last message and unread count
        const conversations = await Promise.all(
          (participations || []).map(async (p: Record<string, unknown>) => {
            const conv = p.conversations as Record<string, unknown>;
            if (!conv) return null;

            // Get last message
            const lastMsgRes = await fetch(
              `${SUPABASE_URL}/rest/v1/messages?select=id,sender_id,content,created_at&conversation_id=eq.${conv.id}&order=created_at.desc&limit=1`,
              { headers: getAdminHeaders() }
            ).then(r => r.json());

            // Get unread count (messages after last_read_at)
            let unreadCount = 0;
            if (p.last_read_at) {
              const unreadRes = await fetch(
                `${SUPABASE_URL}/rest/v1/messages?select=id&conversation_id=eq.${conv.id}&created_at=gt.${p.last_read_at}&sender_id=neq.${userId}`,
                { headers: getAdminHeaders() }
              ).then(r => r.json());
              unreadCount = (unreadRes || []).length;
            } else {
              // No last_read means all messages are unread
              const unreadRes = await fetch(
                `${SUPABASE_URL}/rest/v1/messages?select=id&conversation_id=eq.${conv.id}&sender_id=neq.${userId}`,
                { headers: getAdminHeaders() }
              ).then(r => r.json());
              unreadCount = (unreadRes || []).length;
            }

            // Get other participant for individual chats
            let otherParticipant = null;
            if (conv.type === 'individual') {
              const otherPartRes = await fetch(
                `${SUPABASE_URL}/rest/v1/conversation_participants?select=user_id,users(id,name,email,avatar_url,title_id,gender,role)&conversation_id=eq.${conv.id}&user_id=neq.${userId}`,
                { headers: getAdminHeaders() }
              ).then(r => r.json());
              otherParticipant = otherPartRes?.[0]?.users || null;
            }

            return {
              id: conv.id,
              type: conv.type,
              subjectId: conv.subject_id,
              title: conv.title,
              createdAt: conv.created_at,
              updatedAt: conv.updated_at,
              lastReadAt: p.last_read_at,
              lastMessage: lastMsgRes?.[0] || null,
              unreadCount,
              otherParticipant,
            };
          })
        );

        // Sort by updated_at (most recent first)
        const sorted = conversations
          .filter(Boolean)
          .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

        return NextResponse.json({ conversations: sorted });
      }

      case 'messages': {
        const conversationId = searchParams.get('conversationId');
        const limit = parseInt(searchParams.get('limit') || '50');
        const before = searchParams.get('before'); // for pagination

        if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

        let url = `${SUPABASE_URL}/rest/v1/messages?select=id,sender_id,content,created_at,is_deleted,is_edited,sender:users(id,name,email,avatar_url,title_id,gender,role)&conversation_id=eq.${conversationId}&order=created_at.desc&limit=${limit}`;
        if (before) {
          url += `&created_at=lt.${before}`;
        }

        const messages = await fetch(url, { headers: getAdminHeaders() }).then(r => r.json());
        return NextResponse.json({ messages: (messages || []).reverse() });
      }

      case 'group-conversation': {
        const subjectId = searchParams.get('subjectId');
        if (!subjectId) return NextResponse.json({ error: 'subjectId required' }, { status: 400 });

        const { data } = await fetch(
          `${SUPABASE_URL}/rest/v1/conversations?select=*&subject_id=eq.${subjectId}&type=eq.group`,
          { headers: getAdminHeaders() }
        ).then(r => r.json());

        return NextResponse.json({ conversation: data?.[0] || null });
      }

      case 'participants': {
        const conversationId = searchParams.get('conversationId');
        if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

        const participants = await fetch(
          `${SUPABASE_URL}/rest/v1/conversation_participants?select=user_id,joined_at,last_read_at,users(id,name,email,avatar_url,title_id,gender,role)&conversation_id=eq.${conversationId}`,
          { headers: getAdminHeaders() }
        ).then(r => r.json());

        return NextResponse.json({ participants: participants || [] });
      }

      case 'search-users': {
        const subjectId = searchParams.get('subjectId');
        const query = searchParams.get('query');
        const userId = searchParams.get('userId');

        if (!subjectId || !query) return NextResponse.json({ error: 'subjectId and query required' }, { status: 400 });

        // Search users enrolled in the same subject
        const users = await fetch(
          `${SUPABASE_URL}/rest/v1/subject_students?select=student_id,users(id,name,email,avatar_url,title_id,gender,role)&subject_id=eq.${subjectId}&or=(status.eq.approved,status.is.null)`,
          { headers: getAdminHeaders() }
        ).then(r => r.json());

        // Also include the teacher
        const subject = await fetch(
          `${SUPABASE_URL}/rest/v1/subjects?select=teacher_id,users(id,name,email,avatar_url,title_id,gender,role)&id=eq.${subjectId}`,
          { headers: getAdminHeaders() }
        ).then(r => r.json());

        const allUsers = [
          ...(users || []).map((u: Record<string, unknown>) => u.users),
          ...(subject || []).map((s: Record<string, unknown>) => s.users),
        ]
          .filter(Boolean)
          .filter((u: Record<string, unknown>) => u.id !== userId)
          .filter((u: Record<string, unknown>) =>
            (u.name as string || '').toLowerCase().includes(query.toLowerCase()) ||
            (u.email as string || '').toLowerCase().includes(query.toLowerCase())
          );

        // Remove duplicates
        const unique = Array.from(new Map(allUsers.map((u: Record<string, unknown>) => [u.id, u])).values());

        return NextResponse.json({ users: unique });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Chat API] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'send-message': {
        const { conversationId, senderId, content } = body;
        if (!conversationId || !senderId || !content) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Insert message
        const message = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({
            conversation_id: conversationId,
            sender_id: senderId,
            content: content.trim(),
          }),
        }).then(r => r.json());

        // Update conversation's updated_at (triggers the trigger)
        await fetch(`${SUPABASE_URL}/rest/v1/conversations?id=eq.${conversationId}`, {
          method: 'PATCH',
          headers: { ...getAdminHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify({ updated_at: new Date().toISOString() }),
        });

        // Get sender info for the response
        const sender = await fetch(
          `${SUPABASE_URL}/rest/v1/users?select=id,name,email,avatar_url,title_id,gender,role&id=eq.${senderId}`,
          { headers: getAdminHeaders() }
        ).then(r => r.json());

        return NextResponse.json({
          message: Array.isArray(message) ? message[0] : message,
          sender: sender?.[0] || null,
        });
      }

      case 'create-individual': {
        const { userId1, userId2, subjectId } = body;
        if (!userId1 || !userId2) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check if conversation already exists between these two users
        // Get all individual conversations for userId1
        const existing = await fetch(
          `${SUPABASE_URL}/rest/v1/conversation_participants?select=conversation_id,conversations(id,type,subject_id)&user_id=eq.${userId1}`,
          { headers: getAdminHeaders() }
        ).then(r => r.json());

        // Find individual conversations (with or without matching subjectId)
        const individualConvs = (existing || []).filter((p: Record<string, unknown>) => {
          const conv = p.conversations as Record<string, unknown>;
          return conv?.type === 'individual';
        });

        // Check each individual conversation to see if userId2 is also a participant
        for (const p of individualConvs) {
          const convId = p.conversation_id as string;
          const conv = p.conversations as Record<string, unknown>;

          const otherPart = await fetch(
            `${SUPABASE_URL}/rest/v1/conversation_participants?conversation_id=eq.${convId}&user_id=eq.${userId2}`,
            { headers: getAdminHeaders() }
          ).then(r => r.json());

          if (otherPart?.length > 0) {
            // Found an existing conversation between these two users
            // If subjectId matches or either is null, return it
            if (conv?.subject_id === subjectId || (!conv?.subject_id && !subjectId) || !subjectId) {
              return NextResponse.json({ conversation: conv, existed: true });
            }
          }
        }

        // Create new individual conversation
        const newConv = await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({
            type: 'individual',
            subject_id: subjectId || null,
          }),
        }).then(r => r.json());

        // Check for errors
        if (newConv?.code || newConv?.error) {
          console.error('[Chat API] Create conversation error:', newConv);
          return NextResponse.json({ error: 'فشل إنشاء المحادثة' }, { status: 500 });
        }

        const convId = Array.isArray(newConv) ? newConv[0].id : newConv.id;

        if (!convId) {
          console.error('[Chat API] No conversation ID returned:', newConv);
          return NextResponse.json({ error: 'فشل إنشاء المحادثة - لم يتم إرجاع معرف' }, { status: 500 });
        }

        // Add both users as participants
        await fetch(`${SUPABASE_URL}/rest/v1/conversation_participants`, {
          method: 'POST',
          headers: { ...getAdminHeaders(), 'Prefer': 'return=minimal' },
          body: JSON.stringify([
            { conversation_id: convId, user_id: userId1 },
            { conversation_id: convId, user_id: userId2 },
          ]),
        });

        return NextResponse.json({ conversation: Array.isArray(newConv) ? newConv[0] : newConv, existed: false });
      }

      case 'mark-read': {
        const { conversationId, userId } = body;
        if (!conversationId || !userId) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        await fetch(
          `${SUPABASE_URL}/rest/v1/conversation_participants?conversation_id=eq.${conversationId}&user_id=eq.${userId}`,
          {
            method: 'PATCH',
            headers: { ...getAdminHeaders(), 'Prefer': 'return=minimal' },
            body: JSON.stringify({ last_read_at: new Date().toISOString() }),
          }
        );

        return NextResponse.json({ success: true });
      }

      case 'ensure-group': {
        const { subjectId, teacherId } = body;
        if (!subjectId) {
          return NextResponse.json({ error: 'subjectId required' }, { status: 400 });
        }

        // Check if group conversation exists
        const existing = await fetch(
          `${SUPABASE_URL}/rest/v1/conversations?subject_id=eq.${subjectId}&type=eq.group`,
          { headers: getAdminHeaders() }
        ).then(r => r.json());

        if (existing?.length > 0) {
          return NextResponse.json({ conversation: existing[0], existed: true });
        }

        // Get subject name for title
        const subject = await fetch(
          `${SUPABASE_URL}/rest/v1/subjects?select=name&id=eq.${subjectId}`,
          { headers: getAdminHeaders() }
        ).then(r => r.json());

        const title = subject?.[0]?.name ? `${subject[0].name} - محادثة المقرر` : 'محادثة المقرر';

        // Create group conversation
        const newConv = await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({
            type: 'group',
            subject_id: subjectId,
            title,
          }),
        }).then(r => r.json());

        const convId = Array.isArray(newConv) ? newConv[0].id : newConv.id;

        // Add teacher as participant
        if (teacherId) {
          await fetch(`${SUPABASE_URL}/rest/v1/conversation_participants`, {
            method: 'POST',
            headers: { ...getAdminHeaders(), 'Prefer': 'return=minimal' },
            body: JSON.stringify({ conversation_id: convId, user_id: teacherId }),
          });
        }

        // Add all enrolled students as participants
        const students = await fetch(
          `${SUPABASE_URL}/rest/v1/subject_students?select=student_id&subject_id=eq.${subjectId}&or=(status.eq.approved,status.is.null)`,
          { headers: getAdminHeaders() }
        ).then(r => r.json());

        if (students?.length > 0) {
          const participants = students.map((s: { student_id: string }) => ({
            conversation_id: convId,
            user_id: s.student_id,
          }));
          await fetch(`${SUPABASE_URL}/rest/v1/conversation_participants`, {
            method: 'POST',
            headers: { ...getAdminHeaders(), 'Prefer': 'return=minimal' },
            body: JSON.stringify(participants),
          });
        }

        return NextResponse.json({ conversation: Array.isArray(newConv) ? newConv[0] : newConv, existed: false });
      }

      case 'delete-message': {
        const { messageId, userId } = body;
        if (!messageId || !userId) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Verify the user is the sender of the message
        const msgRes = await fetch(
          `${SUPABASE_URL}/rest/v1/messages?select=id,sender_id,conversation_id&id=eq.${messageId}`,
          { headers: getAdminHeaders() }
        ).then(r => r.json());

        if (!msgRes?.length) {
          return NextResponse.json({ error: 'الرسالة غير موجودة' }, { status: 404 });
        }

        if (msgRes[0].sender_id !== userId) {
          return NextResponse.json({ error: 'لا يمكنك حذف رسالة لا تخصك' }, { status: 403 });
        }

        // Try to update with is_deleted column (if it exists)
        // Fallback: just update content
        try {
          const updateRes = await fetch(
            `${SUPABASE_URL}/rest/v1/messages?id=eq.${messageId}`,
            {
              method: 'PATCH',
              headers: { ...getAdminHeaders(), 'Prefer': 'return=minimal' },
              body: JSON.stringify({
                content: 'تم حذف هذه الرسالة',
                is_deleted: true,
              }),
            }
          );

          // If is_deleted column doesn't exist, just update content
          if (!updateRes.ok) {
            await fetch(
              `${SUPABASE_URL}/rest/v1/messages?id=eq.${messageId}`,
              {
                method: 'PATCH',
                headers: { ...getAdminHeaders(), 'Prefer': 'return=minimal' },
                body: JSON.stringify({
                  content: 'تم حذف هذه الرسالة',
                }),
              }
            );
          }
        } catch {
          // Fallback: just update content without is_deleted
          await fetch(
            `${SUPABASE_URL}/rest/v1/messages?id=eq.${messageId}`,
            {
              method: 'PATCH',
              headers: { ...getAdminHeaders(), 'Prefer': 'return=minimal' },
              body: JSON.stringify({
                content: 'تم حذف هذه الرسالة',
              }),
            }
          );
        }

        return NextResponse.json({ success: true, messageId });
      }

      case 'edit-message': {
        const { messageId, userId, content } = body;
        if (!messageId || !userId || !content?.trim()) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Verify the user is the sender of the message
        const msgRes = await fetch(
          `${SUPABASE_URL}/rest/v1/messages?select=id,sender_id,conversation_id,is_deleted&id=eq.${messageId}`,
          { headers: getAdminHeaders() }
        ).then(r => r.json());

        if (!msgRes?.length) {
          return NextResponse.json({ error: 'الرسالة غير موجودة' }, { status: 404 });
        }

        if (msgRes[0].sender_id !== userId) {
          return NextResponse.json({ error: 'لا يمكنك تعديل رسالة لا تخصك' }, { status: 403 });
        }

        if (msgRes[0].is_deleted) {
          return NextResponse.json({ error: 'لا يمكنك تعديل رسالة محذوفة' }, { status: 400 });
        }

        // Try to update with is_edited column (if it exists)
        try {
          const updateRes = await fetch(
            `${SUPABASE_URL}/rest/v1/messages?id=eq.${messageId}`,
            {
              method: 'PATCH',
              headers: { ...getAdminHeaders(), 'Prefer': 'return=minimal' },
              body: JSON.stringify({
                content: content.trim(),
                is_edited: true,
              }),
            }
          );

          // If is_edited column doesn't exist, just update content
          if (!updateRes.ok) {
            await fetch(
              `${SUPABASE_URL}/rest/v1/messages?id=eq.${messageId}`,
              {
                method: 'PATCH',
                headers: { ...getAdminHeaders(), 'Prefer': 'return=minimal' },
                body: JSON.stringify({
                  content: content.trim(),
                }),
              }
            );
          }
        } catch {
          // Fallback: just update content without is_edited
          await fetch(
            `${SUPABASE_URL}/rest/v1/messages?id=eq.${messageId}`,
            {
              method: 'PATCH',
              headers: { ...getAdminHeaders(), 'Prefer': 'return=minimal' },
              body: JSON.stringify({
                content: content.trim(),
              }),
            }
          );
        }

        return NextResponse.json({ success: true, messageId, content: content.trim() });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Chat API] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
