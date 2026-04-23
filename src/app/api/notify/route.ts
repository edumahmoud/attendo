import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// ─── Notification helpers using service role (bypasses RLS) ───

async function notifyUser(userId: string, type: string, title: string, message: string, link?: string) {
  try {
    await supabaseServer.from('notifications').insert({
      user_id: userId,
      type,
      title,
      message,
      link: link || null,
    });
  } catch (err) {
    console.error('[notify] Failed to send notification:', err);
  }
}

async function notifyUsers(userIds: string[], type: string, title: string, message: string, link?: string) {
  if (userIds.length === 0) return;
  try {
    const rows = userIds.map((userId) => ({
      user_id: userId,
      type,
      title,
      message,
      link: link || null,
    }));
    await supabaseServer.from('notifications').insert(rows);
  } catch (err) {
    console.error('[notify] Failed to send bulk notifications:', err);
  }
}

async function getStudentIds(subjectId: string): Promise<string[]> {
  const { data } = await supabaseServer
    .from('subject_students')
    .select('student_id')
    .eq('subject_id', subjectId);
  return (data || []).map((e: { student_id: string }) => e.student_id);
}

// ─── POST handler ───

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ─── 1) Teacher creates a new assignment → notify all students ───
      case 'assignment_created': {
        const { subjectId, assignmentTitle, teacherName } = body;
        if (!subjectId || !assignmentTitle) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const studentIds = await getStudentIds(subjectId);
        await notifyUsers(
          studentIds,
          'assignment',
          'مهمة جديدة',
          `أنشأ المعلم ${teacherName || 'المعلم'} مهمة "${assignmentTitle}"`,
          `subject:${subjectId}`
        );
        return NextResponse.json({ success: true, notified: studentIds.length });
      }

      // ─── 2) Student submits an assignment → notify teacher ───
      case 'assignment_submitted': {
        const { assignmentId, teacherId, studentName, assignmentTitle } = body;
        if (!teacherId || !assignmentTitle) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        await notifyUser(
          teacherId,
          'assignment',
          'تسليم مهمة جديد',
          `سلم الطالب ${studentName || 'طالب'} مهمة "${assignmentTitle}"`,
          `assignment:${assignmentId}`
        );
        return NextResponse.json({ success: true });
      }

      // ─── 3) Teacher grades a submission → notify the student ───
      case 'assignment_graded': {
        const { studentId, assignmentTitle, score, maxScore, teacherName } = body;
        if (!studentId || !assignmentTitle) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const scoreText = score !== undefined && maxScore !== undefined
          ? ` (${score}/${maxScore})`
          : '';

        await notifyUser(
          studentId,
          'grade',
          'تم تقييم مهمة',
          `قيّم المعلم ${teacherName || 'المعلم'} مهمتك "${assignmentTitle}"${scoreText}`,
          `assignments`
        );
        return NextResponse.json({ success: true });
      }

      // ─── 4) Teacher starts attendance session → notify all students ───
      case 'attendance_started': {
        const { subjectId, subjectName, lectureTitle, teacherName } = body;
        if (!subjectId) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const studentIds = await getStudentIds(subjectId);
        const lectureText = lectureTitle ? ` "${lectureTitle}"` : '';
        await notifyUsers(
          studentIds,
          'attendance',
          'بدأت جلسة حضور',
          `بدأ المعلم ${teacherName || 'المعلم'} جلسة حضور${lectureText} في مقرر "${subjectName || 'المقرر'}"`,
          `subject:${subjectId}`
        );
        return NextResponse.json({ success: true, notified: studentIds.length });
      }

      // ─── 5) Teacher creates a public note → notify all students ───
      case 'public_note_created': {
        const { subjectId, notePreview, teacherName } = body;
        if (!subjectId) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const studentIds = await getStudentIds(subjectId);
        const previewText = notePreview ? `: ${notePreview}` : '';
        await notifyUsers(
          studentIds,
          'system',
          'ملاحظة جديدة',
          `نشر المعلم ${teacherName || 'المعلم'} ملاحظة جديدة${previewText}`,
          `subject:${subjectId}`
        );
        return NextResponse.json({ success: true, notified: studentIds.length });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    console.error('[notify] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
