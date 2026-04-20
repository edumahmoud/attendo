// =====================================================
// /api/subjects/[id]/files — List & Upload Files
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, sanitizeString, safeErrorResponse } from '@/lib/api-security';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const STORAGE_BUCKET = 'subject-files';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Verify the user has access to the subject.
 * Returns { hasAccess, isTeacher } or an error response.
 */
async function verifySubjectAccess(
  userId: string,
  subjectId: string,
  profile: { role: string }
): Promise<{ hasAccess: boolean; isTeacher: boolean } | NextResponse> {
  // Check if user is the teacher of this subject
  const { data: subject } = await supabaseServer
    .from('subjects')
    .select('teacher_id, is_active')
    .eq('id', subjectId)
    .single();

  if (!subject) {
    return NextResponse.json(
      { success: false, error: 'المادة غير موجودة' },
      { status: 404 }
    );
  }

  if (profile.role === 'teacher' && subject.teacher_id === userId) {
    return { hasAccess: true, isTeacher: true };
  }

  // Check if student is enrolled
  const { data: enrollment } = await supabaseServer
    .from('subject_students')
    .select('id')
    .eq('subject_id', subjectId)
    .eq('student_id', userId)
    .single();

  if (enrollment) {
    return { hasAccess: true, isTeacher: false };
  }

  return NextResponse.json(
    { success: false, error: 'غير مصرح بالوصول لهذه المادة' },
    { status: 403 }
  );
}

/**
 * Ensure the storage bucket exists, creating it if necessary.
 * Uses the service role key for admin operations.
 */
async function ensureBucketExists(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseServerConfigured) {
    return { success: false, error: 'خدمة التخزين غير مُعدة. يرجى إضافة SUPABASE_SERVICE_ROLE_KEY' };
  }

  try {
    const { data: buckets, error: listError } = await supabaseServer.storage.listBuckets();
    if (listError) {
      console.error('List buckets error:', listError);
      return { success: false, error: 'فشل في التحقق من التخزين' };
    }

    const bucketExists = buckets?.some((b) => b.name === STORAGE_BUCKET);

    if (!bucketExists) {
      console.log(`Creating storage bucket: ${STORAGE_BUCKET}`);
      const { error: createError } = await supabaseServer.storage.createBucket(STORAGE_BUCKET, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
      });

      if (createError) {
        console.error('Bucket creation error:', createError);
        // Bucket might have been created by another request in the meantime
        const { data: recheckBuckets } = await supabaseServer.storage.listBuckets();
        if (!recheckBuckets?.some((b) => b.name === STORAGE_BUCKET)) {
          return { success: false, error: 'فشل في إنشاء حاوية التخزين' };
        }
      }
      console.log(`Storage bucket "${STORAGE_BUCKET}" created successfully`);
    }

    // Ensure storage policies exist for public read and authenticated upload
    // These policies allow anyone to read files and authenticated users to upload
    try {
      // We use the service role key to set storage policies via the Supabase Management API
      // Since we can't use the REST API for policy management, we ensure the bucket is public
      // which inherently allows public read access. Upload is handled via the service role key.
      const { data: bucketData } = await supabaseServer.storage.getBucket(STORAGE_BUCKET);
      if (bucketData && !bucketData.public) {
        // Update bucket to be public if it was somehow set to private
        await supabaseServer.storage.updateBucket(STORAGE_BUCKET, { public: true });
        console.log(`Updated bucket "${STORAGE_BUCKET}" to public`);
      }
    } catch (policyErr) {
      console.warn('Could not verify/update storage policies:', policyErr);
    }

    return { success: true };
  } catch (err) {
    console.error('ensureBucketExists error:', err);
    return { success: false, error: 'خطأ في إعداد التخزين' };
  }
}

/** GET /api/subjects/[id]/files — List files for a subject */
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
    const profile = await getUserProfile(authResult.supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    const accessResult = await verifySubjectAccess(user.id, subjectId, profile);
    if (accessResult instanceof NextResponse) return accessResult;

    // For students, only show: public files + their own private files
    let query = supabaseServer
      .from('subject_files')
      .select('id, subject_id, uploaded_by, file_name, file_url, file_type, file_size, created_at, visibility')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false });

    // If student, filter to show public files + own private files
    if (!accessResult.isTeacher) {
      query = query.or(`visibility.eq.public,visibility.is.null,uploaded_by.eq.${user.id}`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Files fetch error:', error);
      return NextResponse.json(
        { success: false, error: 'فشل في تحميل الملفات' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: data || [] },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('Files list error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحميل الملفات');
  }
}

/** POST /api/subjects/[id]/files — Upload a file to a subject */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // Check if server is configured
    if (!isSupabaseServerConfigured) {
      console.error('[FILES UPLOAD] Server not configured. Env vars:', {
        hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      });
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
      console.error('[FILES UPLOAD] Authentication failed - no valid token');
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول' },
        { status: 401, headers: rateLimitHeaders }
      );
    }

    const { user } = authResult;
    const { id: subjectId } = await context.params;
    const profile = await getUserProfile(authResult.supabase, user.id);
    if (!profile) {
      console.error('[FILES UPLOAD] Profile not found for user:', user.id);
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Only teachers (and admins acting as teachers) can upload via this endpoint
    if (profile.role !== 'teacher' && profile.role !== 'admin') {
      console.error('[FILES UPLOAD] User is not a teacher/admin:', user.id, 'role:', profile.role);
      return NextResponse.json(
        { success: false, error: 'فقط المعلمون يمكنهم رفع الملفات عبر هذا المسار' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Verify ownership using server client
    const { data: subject, error: subjectError } = await supabaseServer
      .from('subjects')
      .select('teacher_id')
      .eq('id', subjectId)
      .single();

    if (subjectError || !subject) {
      console.error('[FILES UPLOAD] Subject query error:', subjectError?.message || 'not found');
      return NextResponse.json(
        { success: false, error: 'المادة غير موجودة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    if (subject.teacher_id !== user.id) {
      console.error('[FILES UPLOAD] User is not the teacher of this subject. User:', user.id, 'Subject teacher:', subject.teacher_id);
      return NextResponse.json(
        { success: false, error: 'غير مصرح برفع ملفات في هذه المادة' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formErr) {
      console.error('[FILES UPLOAD] Failed to parse form data:', formErr);
      return NextResponse.json(
        { success: false, error: 'فشل في قراءة بيانات الطلب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const file = formData.get('file') as File | null;
    const displayName = formData.get('name') as string | null;

    if (!file) {
      console.error('[FILES UPLOAD] No file in form data. Keys:', Array.from(formData.keys()));
      return NextResponse.json(
        { success: false, error: 'الملف مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    console.log('[FILES UPLOAD] File received:', file.name, 'size:', file.size, 'type:', file.type);

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'حجم الملف يتجاوز الحد المسموح (10 ميجابايت)' },
        { status: 413, headers: rateLimitHeaders }
      );
    }

    const fileName = sanitizeString(displayName || file.name, 255) || file.name;
    const fileExt = fileName.split('.').pop() || 'bin';
    const storagePath = `${subjectId}/${user.id}/${Date.now()}.${fileExt}`;

    // Ensure bucket exists before upload
    const bucketResult = await ensureBucketExists();
    if (!bucketResult.success) {
      console.error('[FILES UPLOAD] Bucket check failed:', bucketResult.error);
      return NextResponse.json(
        { success: false, error: bucketResult.error || 'فشل في إعداد حاوية التخزين' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Upload to Supabase Storage using the SERVER client (service role bypasses RLS)
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(await file.arrayBuffer());
    } catch (bufErr) {
      console.error('[FILES UPLOAD] Failed to read file buffer:', bufErr);
      return NextResponse.json(
        { success: false, error: 'فشل في قراءة بيانات الملف' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    console.log('[FILES UPLOAD] Uploading to storage path:', storagePath);
    const { data: uploadData, error: uploadError } = await supabaseServer.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('[FILES UPLOAD] Storage upload error:', JSON.stringify({
        message: uploadError.message,
        name: uploadError.name,
      }));
      return NextResponse.json(
        { success: false, error: `فشل في رفع الملف: ${uploadError.message}` },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    console.log('[FILES UPLOAD] Storage upload successful, path:', uploadData?.path);

    // Get public URL
    const { data: urlData } = supabaseServer.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const fileUrl = urlData?.publicUrl || '';

    // Determine file type category
    let fileType = 'other';
    if (file.type.startsWith('image/')) fileType = 'image';
    else if (file.type === 'application/pdf') fileType = 'pdf';
    else if (file.type.startsWith('video/')) fileType = 'video';
    else if (file.type.startsWith('audio/')) fileType = 'audio';
    else if (file.type.includes('word') || file.type.includes('document')) fileType = 'document';
    else if (file.type.includes('sheet') || file.type.includes('excel')) fileType = 'spreadsheet';
    else if (file.type.includes('presentation') || file.type.includes('powerpoint')) fileType = 'presentation';

    // Save metadata to database using server client
    const insertPayload: Record<string, unknown> = {
      subject_id: subjectId,
      uploaded_by: user.id,
      file_name: fileName,
      file_url: fileUrl,
      file_type: fileType,
      file_size: file.size,
    };

    // Try inserting with visibility first (column may exist if added via migration)
    let data;
    let dbError;
    const withVisibility = await supabaseServer
      .from('subject_files')
      .insert({ ...insertPayload, visibility: 'public' })
      .select()
      .single();

    if (withVisibility.error && withVisibility.error.message?.includes('visibility')) {
      // visibility column doesn't exist — retry without it
      console.log('[FILES UPLOAD] Retrying without visibility column');
      const withoutVisibility = await supabaseServer
        .from('subject_files')
        .insert(insertPayload)
        .select()
        .single();
      data = withoutVisibility.data;
      dbError = withoutVisibility.error;
    } else {
      data = withVisibility.data;
      dbError = withVisibility.error;
    }

    if (dbError) {
      console.error('[FILES UPLOAD] DB insert error:', JSON.stringify({
        message: dbError.message,
        code: dbError.code,
        details: dbError.details,
        hint: dbError.hint,
      }));
      // Try to clean up uploaded file
      await supabaseServer.storage.from(STORAGE_BUCKET).remove([storagePath]);
      return NextResponse.json(
        { success: false, error: `فشل في حفظ بيانات الملف: ${dbError.message}` },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    console.log('[FILES UPLOAD] File uploaded successfully:', fileName);
    return NextResponse.json(
      { success: true, data },
      { status: 201, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[FILES UPLOAD] Unexpected error:', error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : error);
    return NextResponse.json(
      { success: false, error: `حدث خطأ أثناء رفع الملف: ${error instanceof Error ? error.message : 'خطأ غير معروف'}` },
      { status: 500 }
    );
  }
}

/** DELETE /api/subjects/[id]/files — Delete a file from a subject */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    if (!isSupabaseServerConfigured) {
      return NextResponse.json(
        { success: false, error: 'خدمة التخزين غير مُعدة' },
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
    const fileId = request.nextUrl.searchParams.get('fileId');

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: 'معرف الملف مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Get the file record
    const { data: fileRecord } = await supabaseServer
      .from('subject_files')
      .select('id, file_url, uploaded_by, subject_id')
      .eq('id', fileId)
      .eq('subject_id', subjectId)
      .single();

    if (!fileRecord) {
      return NextResponse.json(
        { success: false, error: 'الملف غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Verify the user has permission to delete this file
    // Teacher of the subject OR the user who uploaded the file
    const { data: subject } = await supabaseServer
      .from('subjects')
      .select('teacher_id')
      .eq('id', subjectId)
      .single();

    const isTeacher = subject && subject.teacher_id === user.id;
    const isUploader = fileRecord.uploaded_by === user.id;

    if (!isTeacher && !isUploader) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح بحذف هذا الملف' },
        { status: 403, headers: rateLimitHeaders }
      );
    }

    // Extract storage path from URL and remove from storage
    try {
      if (fileRecord.file_url) {
        const urlParts = fileRecord.file_url.split('/storage/v1/object/public/');
        if (urlParts.length > 1) {
          const pathParts = urlParts[1].split('/');
          // Remove bucket name from path (first segment after /storage/v1/object/public/)
          const bucketAndPath = urlParts[1];
          const slashIndex = bucketAndPath.indexOf('/');
          if (slashIndex > 0) {
            const storagePath = bucketAndPath.substring(slashIndex + 1);
            await supabaseServer.storage.from(STORAGE_BUCKET).remove([storagePath]);
          }
        }
      }
    } catch (removeErr) {
      console.error('Storage file removal error (non-critical):', removeErr);
      // Continue with DB deletion even if storage removal fails
    }

    // Delete the DB record
    const { error: deleteError } = await supabaseServer
      .from('subject_files')
      .delete()
      .eq('id', fileId);

    if (deleteError) {
      console.error('File delete error:', deleteError);
      return NextResponse.json(
        { success: false, error: 'فشل في حذف الملف' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, message: 'تم حذف الملف بنجاح' },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('File delete error:', error);
    return safeErrorResponse('حدث خطأ أثناء حذف الملف');
  }
}
