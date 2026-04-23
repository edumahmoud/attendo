import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

// ─── Notification helpers using service role (bypasses RLS) ───

async function notifyUser(userId: string, type: string, title: string, message: string, link?: string) {
  try {
    const { error } = await supabaseServer.from('notifications').insert({
      user_id: userId,
      type,
      title,
      message,
      link: link || null,
    });
    if (error) {
      console.error('[notify] Failed to send notification:', error.message, error.details);
    }
  } catch (err) {
    console.error('[notify] Failed to send notification (exception):', err);
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
    const { error } = await supabaseServer.from('notifications').insert(rows);
    if (error) {
      console.error('[notify] Failed to send bulk notifications:', error.message, error.details);
      // Fallback: try inserting one by one (in case one bad row blocks the whole batch)
      for (const row of rows) {
        const { error: singleError } = await supabaseServer.from('notifications').insert(row);
        if (singleError) {
          console.error('[notify] Also failed for user', row.user_id, ':', singleError.message);
        }
      }
    }
  } catch (err) {
    console.error('[notify] Failed to send bulk notifications (exception):', err);
  }
}

async function getStudentIds(subjectId: string): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from('subject_students')
    .select('student_id')
    .eq('subject_id', subjectId)
    .eq('status', 'approved');

  if (error) {
    console.error('[notify] Failed to fetch student IDs:', error.message);
    // Fallback: try without status filter (in case status column doesn't exist)
    const { data: fallbackData } = await supabaseServer
      .from('subject_students')
      .select('student_id')
      .eq('subject_id', subjectId);
    return (fallbackData || []).map((e: { student_id: string }) => e.student_id);
  }

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

      // ─── 6) Teacher creates a new lecture → notify all students ───
      case 'lecture_created': {
        const { subjectId, lectureTitle, teacherName, lectureDate, lectureTime } = body;
        if (!subjectId) {
          return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const studentIds = await getStudentIds(subjectId);
        const titleText = lectureTitle ? ` "${lectureTitle}"` : '';

        // Format date and time together
        let dateTimeText = '';
        if (lectureDate && lectureTime) {
          // Format the date nicely in Arabic and append the time
          try {
            const formattedDate = new Date(lectureDate).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
            const [h, m] = lectureTime.split(':').map(Number);
            const period = h >= 12 ? 'م' : 'ص';
            const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
            const timeStr = `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
            dateTimeText = ` (${formattedDate} - ${timeStr})`;
          } catch {
            dateTimeText = ` (${lectureDate} - ${lectureTime})`;
          }
        } else if (lectureDate) {
          try {
            const formattedDate = new Date(lectureDate).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
            dateTimeText = ` (${formattedDate})`;
          } catch {
            dateTimeText = ` (${lectureDate})`;
          }
        } else if (lectureTime) {
          try {
            const [h, m] = lectureTime.split(':').map(Number);
            const period = h >= 12 ? 'م' : 'ص';
            const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
            dateTimeText = ` (${hour12}:${m.toString().padStart(2, '0')} ${period})`;
          } catch {
            dateTimeText = ` (${lectureTime})`;
          }
        }

        // Try 'lecture' type first (better categorization), fall back to 'system' if DB constraint doesn't support it
        let usedType = 'lecture';
        const notifTitle = 'محاضرة جديدة';
        const notifMessage = `أنشأ المعلم ${teacherName || 'المعلم'} محاضرة${titleText}${dateTimeText}`;
        const notifLink = `subject:${subjectId}`;

        // Try inserting with 'lecture' type for the first student
        let lectureTypeSupported = true;
        if (studentIds.length > 0) {
          const { error: testError } = await supabaseServer.from('notifications').insert({
            user_id: studentIds[0],
            type: 'lecture',
            title: notifTitle,
            message: notifMessage,
            link: notifLink,
          });
          if (testError) {
            lectureTypeSupported = false;
            usedType = 'system';
          }
        }

        if (lectureTypeSupported) {
          // 'lecture' type is supported - send to remaining students
          const remainingIds = studentIds.slice(1);
          if (remainingIds.length > 0) {
            await notifyUsers(remainingIds, 'lecture', notifTitle, notifMessage, notifLink);
          }
        } else {
          // 'lecture' type NOT supported - send to ALL students with 'system' type
          await notifyUsers(studentIds, 'system', notifTitle, notifMessage, notifLink);
        }

        console.log(`[notify] lecture_created: notified ${studentIds.length} students for subject ${subjectId} (type: ${usedType})`);
        return NextResponse.json({ success: true, notified: studentIds.length, type: usedType });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    console.error('[notify] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
