// =====================================================
// /api/subjects/[id]/assignments/submit — Assignment Submissions
// =====================================================
// List submissions for an assignment and submit new ones.
// Students submit files; teachers can view all submissions.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, sanitizeString, safeErrorResponse } from '@/lib/api-security';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const STORAGE_BUCKET = 'subject-files';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ─── Helpers ────────────────────────────────────────────

/** Ensure the `subject-files` storage bucket exists and is public. */
async function ensureBucketExists(): Promise<{ success: boolean; error?: string; detail?: string }> {
  if (!isSupabaseServerConfigured) {
    return {
      success: false,
      error: 'خدمة التخزين غير مُعدة. يرجى إضافة SUPABASE_SERVICE_ROLE_KEY',
      detail: 'SUPABASE_SERVICE_ROLE_KEY is not configured.',
    };
  }

  try {
    const { data: buckets, error: listError } = await supabaseServer.storage.listBuckets();
    if (listError) {
      return {
        success: false,
        error: 'فشل في التحقق من التخزين',
        detail: `Supabase listBuckets() failed: ${listError.message}`,
      };
    }

    const bucketExists = buckets?.some((b) => b.name === STORAGE_BUCKET);

    if (!bucketExists) {
      const { error: createError } = await supabaseServer.storage.createBucket(STORAGE_BUCKET, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
      });

      if (createError) {
        const { data: recheckBuckets } = await supabaseServer.storage.listBuckets();
        if (!recheckBuckets?.some((b) => b.name === STORAGE_BUCKET)) {
          return {
            success: false,
            error: 'فشل في إنشاء حاوية التخزين',
            detail: `Could not create "${STORAGE_BUCKET}" bucket: ${createError.message}.`,
          };
        }
      }
    }

    try {
      const { data: bucketData } = await supabaseServer.storage.getBucket(STORAGE_BUCKET);
      if (bucketData && !bucketData.public) {
        await supabaseServer.storage.updateBucket(STORAGE_BUCKET, { public: true });
      }
    } catch {
      // non-critical
    }

    return { success: true };
  } catch (err) {
    console.error('[SUBMIT] ensureBucketExists error:', err);
    return { success: false, error: 'خطأ في إعداد التخزين' };
  }
}

/** Determine a file-type category from the MIME type. */
function categorizeFileType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'spreadsheet';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation';
  return 'other';
}

/** Extract the storage path from a public URL so we can delete the object. */
function extractStoragePath(fileUrl: string): string | null {
  const parts = fileUrl.split('/storage/v1/object/public/');
  if (parts.length < 2) return null;
  const bucketAndPath = parts[1];
  const slashIdx = bucketAndPath.indexOf('/');
  if (slashIdx < 0) return null;
  return bucketAndPath.substring(slashIdx + 1);
}

// ─── GET — List submissions for an assignment ───────────

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = checkRateLimit(request);
    const rateLimitHeaders = getRateLimitHeaders(rateLimit.remaining, rateLimit.retryAfterMs);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'طلبات كثيرة جداً. يرجى المحاولة لاحقاً' },
        { status: 429, headers: rateLimitHeaders }
      );
    }

    const authResult = await getAuthenticatedUser(request);
    if (!authResult) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول' },
        { status: 401, headers: rateLimitHeaders }
      );
    }

    const { user } = authResult;
    const { id: subjectId } = await context.params;
    const assignmentId = request.nextUrl.searchParams.get('assignmentId');

    if (!assignmentId) {
      return NextResponse.json(
        { success: false, error: 'معرف المهمة مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const profile = await getUserProfile(authResult.supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Verify access to the subject
    const { data: subject } = await authResult.supabase
      .from('subjects')
      .select('teacher_id')
      .eq('id', subjectId)
      .single();

    if (!subject) {
      return NextResponse.json(
        { success: false, error: 'المادة غير موجودة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    const isTeacher = (profile.role === 'teacher' || profile.role === 'admin') && subject.teacher_id === user.id;

    if (!isTeacher) {
      // Check enrollment
      const { data: enrollment } = await authResult.supabase
        .from('subject_students')
        .select('id')
        .eq('subject_id', subjectId)
        .eq('student_id', user.id)
        .single();

      if (!enrollment) {
        return NextResponse.json(
          { success: false, error: 'غير مصرح بالوصول لهذه المادة' },
          { status: 403, headers: rateLimitHeaders }
        );
      }
    }

    // Verify the assignment belongs to this subject
    if (!isSupabaseServerConfigured) {
      return NextResponse.json(
        { success: false, error: 'الخادم غير مهيأ' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    const { data: assignment } = await supabaseServer
      .from('assignments')
      .select('id')
      .eq('id', assignmentId)
      .eq('subject_id', subjectId)
      .single();

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: 'المهمة غير موجودة في هذه المادة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Fetch submissions
    if (isTeacher) {
      // Teachers see all submissions with student info
      const { data: submissions, error: fetchError } = await supabaseServer
        .from('assignment_submissions')
        .select('id, assignment_id, student_id, file_name, file_url, file_type, file_size, notes, submitted_at')
        .eq('assignment_id', assignmentId)
        .order('submitted_at', { ascending: false });

      if (fetchError) {
        console.error('[SUBMIT] Fetch submissions error:', fetchError);
        return NextResponse.json(
          { success: false, error: 'فشل في تحميل التسليمات' },
          { status: 500, headers: rateLimitHeaders }
        );
      }

      // Enrich with student names
      const enrichedSubmissions = await Promise.all(
        (submissions || []).map(async (sub) => {
          const { data: studentProfile } = await supabaseServer
            .from('users')
            .select('name, email')
            .eq('id', sub.student_id)
            .single();

          return {
            ...sub,
            student_name: studentProfile?.name || 'غير معروف',
            student_email: studentProfile?.email || '',
          };
        })
      );

      return NextResponse.json(
        { success: true, data: enrichedSubmissions },
        { headers: rateLimitHeaders }
      );
    } else {
      // Students see only their own submission
      const { data: submissions, error: fetchError } = await supabaseServer
        .from('assignment_submissions')
        .select('id, assignment_id, student_id, file_name, file_url, file_type, file_size, notes, submitted_at')
        .eq('assignment_id', assignmentId)
        .eq('student_id', user.id)
        .order('submitted_at', { ascending: false });

      if (fetchError) {
        console.error('[SUBMIT] Fetch own submission error:', fetchError);
        return NextResponse.json(
          { success: false, error: 'فشل في تحميل التسليم' },
          { status: 500, headers: rateLimitHeaders }
        );
      }

      return NextResponse.json(
        { success: true, data: submissions || [] },
        { headers: rateLimitHeaders }
      );
    }
  } catch (error) {
    console.error('[SUBMIT] GET error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحميل التسليمات');
  }
}

// ─── POST — Submit an assignment (students only) ────────

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    if (!isSupabaseServerConfigured) {
      return NextResponse.json(
        { success: false, error: 'خدمة التخزين غير مُعدة. يرجى إضافة SUPABASE_SERVICE_ROLE_KEY في ملف .env' },
        { status: 500 }
      );
    }

    const rateLimit = checkRateLimit(request);
    const rateLimitHeaders = getRateLimitHeaders(rateLimit.remaining, rateLimit.retryAfterMs);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'طلبات كثيرة جداً. يرجى المحاولة لاحقاً' },
        { status: 429, headers: rateLimitHeaders }
      );
    }

    const authResult = await getAuthenticatedUser(request);
    if (!authResult) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول' },
        { status: 401, headers: rateLimitHeaders }
      );
    }

    const { user } = authResult;
    const { id: subjectId } = await context.params;
    const profile = await getUserProfile(authResult.supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Only students can submit assignments
    if (profile.role !== 'student') {
      return NextResponse.json(
        { success: false, error: 'فقط الطلاب يمكنهم تسليم المهام' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Verify student is enrolled in the subject
    const { data: enrollment } = await authResult.supabase
      .from('subject_students')
      .select('id')
      .eq('subject_id', subjectId)
      .eq('student_id', user.id)
      .single();

    if (!enrollment) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح بالوصول لهذه المادة' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formErr) {
      console.error('[SUBMIT] Failed to parse form data:', formErr);
      return NextResponse.json(
        { success: false, error: 'فشل في قراءة بيانات الطلب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const assignmentId = formData.get('assignmentId') as string | null;
    const file = formData.get('file') as File | null;
    const notes = formData.get('notes') as string | null;

    if (!assignmentId) {
      return NextResponse.json(
        { success: false, error: 'معرف المهمة مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'الملف مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    console.log('[SUBMIT] File received:', file.name, 'size:', file.size, 'type:', file.type);

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: 'حجم الملف يتجاوز الحد المسموح (10 ميجابايت)',
          detail: `File size is ${(file.size / 1024 / 1024).toFixed(2)}MB, maximum is 10MB.`,
        },
        { status: 413, headers: rateLimitHeaders }
      );
    }

    // Verify the assignment exists, belongs to this subject, and deadline hasn't passed
    const { data: assignment, error: assignmentError } = await supabaseServer
      .from('assignments')
      .select('id, title, deadline, is_active')
      .eq('id', assignmentId)
      .eq('subject_id', subjectId)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json(
        { success: false, error: 'المهمة غير موجودة في هذه المادة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    if (!assignment.is_active) {
      return NextResponse.json(
        { success: false, error: 'المهمة غير نشطة' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (assignment.deadline && new Date(assignment.deadline) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'انتهى الموعد النهائي للتسليم' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Check if student already submitted (for upsert behavior)
    const { data: existingSubmission } = await supabaseServer
      .from('assignment_submissions')
      .select('id, file_url')
      .eq('assignment_id', assignmentId)
      .eq('student_id', user.id)
      .single();

    // Upload file to storage
    const fileExt = file.name.split('.').pop() || 'bin';
    const storagePath = `assignments/${assignmentId}/${user.id}/${Date.now()}.${fileExt}`;

    // Ensure bucket exists
    const bucketResult = await ensureBucketExists();
    if (!bucketResult.success) {
      console.error('[SUBMIT] Bucket check failed:', bucketResult.error);
      return NextResponse.json(
        { success: false, error: bucketResult.error || 'فشل في إعداد حاوية التخزين', detail: bucketResult.detail },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Read file buffer
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(await file.arrayBuffer());
    } catch (bufErr) {
      console.error('[SUBMIT] Failed to read file buffer:', bufErr);
      return NextResponse.json(
        { success: false, error: 'فشل في قراءة بيانات الملف' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    console.log('[SUBMIT] Uploading to storage path:', storagePath);
    const { data: uploadData, error: uploadError } = await supabaseServer.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('[SUBMIT] Storage upload error:', uploadError);
      let detail = uploadError.message;
      if (uploadError.message?.includes('not found') || uploadError.message?.includes('does not exist')) {
        detail = `The "${STORAGE_BUCKET}" storage bucket may not exist. Please run supabase/fix_storage_complete.sql.`;
      }
      return NextResponse.json(
        { success: false, error: `فشل في رفع الملف: ${uploadError.message}`, detail },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    console.log('[SUBMIT] Storage upload successful, path:', uploadData?.path);

    // Get public URL
    const { data: urlData } = supabaseServer.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const fileUrl = urlData?.publicUrl || '';
    const fileType = categorizeFileType(file.type || 'application/octet-stream');

    if (existingSubmission) {
      // Upsert: update the existing submission
      console.log('[SUBMIT] Updating existing submission:', existingSubmission.id);

      // Remove old file from storage
      try {
        const oldPath = extractStoragePath(existingSubmission.file_url);
        if (oldPath) {
          await supabaseServer.storage.from(STORAGE_BUCKET).remove([oldPath]);
        }
      } catch (removeErr) {
        console.error('[SUBMIT] Old file removal error (non-critical):', removeErr);
      }

      const { data, error: updateError } = await supabaseServer
        .from('assignment_submissions')
        .update({
          file_name: sanitizeString(file.name, 255),
          file_url: fileUrl,
          file_type: fileType,
          file_size: file.size,
          notes: notes ? sanitizeString(notes, 5000) : null,
          submitted_at: new Date().toISOString(),
        })
        .eq('id', existingSubmission.id)
        .select()
        .single();

      if (updateError) {
        console.error('[SUBMIT] Update submission error:', updateError);
        // Clean up newly uploaded file
        await supabaseServer.storage.from(STORAGE_BUCKET).remove([storagePath]);
        return NextResponse.json(
          { success: false, error: `فشل في تحديث التسليم: ${updateError.message}` },
          { status: 500, headers: rateLimitHeaders }
        );
      }

      console.log('[SUBMIT] Submission updated successfully for assignment:', assignmentId);
      return NextResponse.json(
        { success: true, data, isResubmission: true },
        { status: 200, headers: rateLimitHeaders }
      );
    } else {
      // New submission
      const insertPayload = {
        assignment_id: assignmentId,
        student_id: user.id,
        file_name: sanitizeString(file.name, 255),
        file_url: fileUrl,
        file_type: fileType,
        file_size: file.size,
        notes: notes ? sanitizeString(notes, 5000) : null,
      };

      // Use user's JWT client for insert (RLS allows students to insert their own submissions)
      const { data, error: insertError } = await authResult.supabase
        .from('assignment_submissions')
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) {
        console.error('[SUBMIT] Insert submission error:', insertError);
        // Clean up uploaded file
        await supabaseServer.storage.from(STORAGE_BUCKET).remove([storagePath]);
        return NextResponse.json(
          { success: false, error: `فشل في حفظ التسليم: ${insertError.message}` },
          { status: 500, headers: rateLimitHeaders }
        );
      }

      console.log('[SUBMIT] Submission created successfully for assignment:', assignmentId);
      return NextResponse.json(
        { success: true, data, isResubmission: false },
        { status: 201, headers: rateLimitHeaders }
      );
    }
  } catch (error) {
    console.error('[SUBMIT] POST error:', error);
    return safeErrorResponse('حدث خطأ أثناء تسليم المهمة');
  }
}
