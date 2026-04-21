// =====================================================
// /api/subjects/[id]/files/upload — Student File Upload
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

// Use the same cached visibility column check as the parent route
// This module-level variable is scoped to this route handler
let visibilityColumnExists: boolean | null = null;

async function checkVisibilityColumn(): Promise<boolean> {
  if (visibilityColumnExists !== null) return visibilityColumnExists;
  try {
    // Use anon key for column check (service_role may lack schema permissions)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      visibilityColumnExists = false;
      return false;
    }
    const { createClient } = await import('@supabase/supabase-js');
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await anonClient
      .from('subject_files')
      .select('visibility')
      .limit(1);
    visibilityColumnExists = !error || !error.message?.includes('visibility');
    return visibilityColumnExists;
  } catch {
    visibilityColumnExists = false;
    return false;
  }
}

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
            detail: `Could not create "${STORAGE_BUCKET}" bucket: ${createError.message}. Please create it manually or run supabase/fix_storage_complete.sql.`,
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
  } catch {
    return { success: false, error: 'خطأ في إعداد التخزين' };
  }
}

/** POST /api/subjects/[id]/files/upload — Upload a file (students or teachers) */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    if (!isSupabaseServerConfigured) {
      console.error('[STUDENT UPLOAD] Server not configured. Env vars:', {
        hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'خدمة التخزين غير مُعدة. يرجى إضافة SUPABASE_SERVICE_ROLE_KEY في ملف .env',
          detail: 'The SUPABASE_SERVICE_ROLE_KEY environment variable is not set.',
        },
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
      console.error('[STUDENT UPLOAD] Authentication failed - no valid token');
      return NextResponse.json(
        { success: false, error: 'غير مصرح. يرجى تسجيل الدخول' },
        { status: 401, headers: rateLimitHeaders }
      );
    }

    const { user } = authResult;
    const { id: subjectId } = await context.params;
    const profile = await getUserProfile(authResult.supabase, user.id);
    if (!profile) {
      console.error('[STUDENT UPLOAD] Profile not found for user:', user.id);
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Check if user has access: teacher of this subject OR enrolled student
    const { data: subject } = await authResult.supabase
      .from('subjects')
      .select('teacher_id')
      .eq('id', subjectId)
      .single();

    if (!subject) {
      console.error('[STUDENT UPLOAD] Subject not found:', subjectId);
      return NextResponse.json(
        { success: false, error: 'المادة غير موجودة' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    const isTeacher = (profile.role === 'teacher' || profile.role === 'admin') && subject.teacher_id === user.id;
    let isStudent = false;

    if (!isTeacher) {
      const { data: enrollment } = await authResult.supabase
        .from('subject_students')
        .select('id')
        .eq('subject_id', subjectId)
        .eq('student_id', user.id)
        .single();

      if (!enrollment) {
        console.error('[STUDENT UPLOAD] User not enrolled in subject:', user.id, 'subject:', subjectId);
        return NextResponse.json(
          { success: false, error: 'غير مصرح بالوصول لهذه المادة' },
          { status: 403, headers: rateLimitHeaders }
        );
      }
      isStudent = true;
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formErr) {
      console.error('[STUDENT UPLOAD] Failed to parse form data:', formErr);
      return NextResponse.json(
        { success: false, error: 'فشل في قراءة بيانات الطلب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const file = formData.get('file') as File | null;
    const displayName = formData.get('name') as string | null;
    const visibility = formData.get('visibility') as string | null;
    const categoryInput = formData.get('category') as string | null;
    const descriptionInput = formData.get('description') as string | null;

    if (!file) {
      console.error('[STUDENT UPLOAD] No file in form data. Keys:', Array.from(formData.keys()));
      return NextResponse.json(
        { success: false, error: 'الملف مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    console.log('[STUDENT UPLOAD] File received:', file.name, 'size:', file.size, 'type:', file.type, 'isStudent:', isStudent);

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

    // Validate file type for students (PDF, Images, Video)
    if (isStudent) {
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        'video/mp4',
        'video/webm',
        'video/quicktime',
      ];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { success: false, error: 'نوع الملف غير مدعوم. يُسمح بـ PDF، الصور، والفيديو فقط' },
          { status: 400, headers: rateLimitHeaders }
        );
      }
    }

    const fileName = sanitizeString(displayName || file.name, 255) || file.name;
    // Extract extension from ORIGINAL file name (not display name) to avoid Arabic/non-ASCII in storage path
    const originalExt = file.name.split('.').pop() || '';
    const mimeExtMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp',
      'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-msvideo': 'avi',
      'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a',
      'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/plain': 'txt', 'text/csv': 'csv', 'application/rtf': 'rtf',
    };
    const isAsciiExt = /^[a-zA-Z0-9]+$/.test(originalExt);
    const safeExt = isAsciiExt ? originalExt : (mimeExtMap[file.type] || 'bin');
    const storagePath = `${subjectId}/${user.id}/${Date.now()}.${safeExt}`;

    // Ensure bucket exists
    const bucketResult = await ensureBucketExists();
    if (!bucketResult.success) {
      console.error('[STUDENT UPLOAD] Bucket check failed:', bucketResult.error);
      return NextResponse.json(
        { success: false, error: bucketResult.error || 'فشل في إعداد حاوية التخزين', detail: bucketResult.detail },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Upload to Supabase Storage
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(await file.arrayBuffer());
    } catch (bufErr) {
      console.error('[STUDENT UPLOAD] Failed to read file buffer:', bufErr);
      return NextResponse.json(
        { success: false, error: 'فشل في قراءة بيانات الملف' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    console.log('[STUDENT UPLOAD] Uploading to storage path:', storagePath);
    const { data: uploadData, error: uploadError } = await supabaseServer.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('[STUDENT UPLOAD] Storage upload error:', JSON.stringify({
        message: uploadError.message,
        name: uploadError.name,
      }));

      let detail = uploadError.message;
      if (uploadError.message?.includes('not found') || uploadError.message?.includes('does not exist')) {
        detail = `The "${STORAGE_BUCKET}" storage bucket may not exist. Please run supabase/fix_storage_complete.sql or create the bucket manually.`;
      }

      return NextResponse.json(
        { success: false, error: `فشل في رفع الملف: ${uploadError.message}`, detail },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    console.log('[STUDENT UPLOAD] Storage upload successful, path:', uploadData?.path);

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

    // Determine visibility
    const fileVisibility = (visibility === 'public' || visibility === 'private') ? visibility : (isStudent ? 'private' : 'public');

    // Determine category
    const defaultCategoryMap: Record<string, string> = {
      pdf: 'PDF',
      image: 'صور',
      video: 'فيديو',
      audio: 'صوتيات',
      document: 'مستندات',
      spreadsheet: 'جداول',
      presentation: 'عروض',
      other: 'أخرى',
    };
    const category = categoryInput?.trim() || defaultCategoryMap[fileType] || 'عام';
    const description = descriptionInput?.trim() || null;

    // Check visibility column existence
    const hasVisibility = await checkVisibilityColumn();

    // Save metadata to database using the USER'S JWT client (respects RLS)
    // The service_role key may not have schema permissions for public tables
    const insertData: Record<string, unknown> = {
      subject_id: subjectId,
      uploaded_by: user.id,
      file_name: fileName,
      file_url: fileUrl,
      file_type: fileType,
      file_size: file.size,
      category,
      description,
    };

    if (hasVisibility) {
      insertData.visibility = fileVisibility;
    }

    const { data, error: dbError } = await authResult.supabase
      .from('subject_files')
      .insert(insertData)
      .select()
      .single();

    if (dbError) {
      // If visibility column error, retry without it
      if (dbError.message?.includes('visibility')) {
        visibilityColumnExists = false;
        console.log('[STUDENT UPLOAD] Retrying without visibility column');
        const { data: retryData, error: retryError } = await authResult.supabase
          .from('subject_files')
          .insert({
            subject_id: subjectId,
            uploaded_by: user.id,
            file_name: fileName,
            file_url: fileUrl,
            file_type: fileType,
            file_size: file.size,
          })
          .select()
          .single();

        if (retryError) {
          console.error('[STUDENT UPLOAD] DB insert retry error:', JSON.stringify({
            message: retryError.message,
            code: retryError.code,
            details: retryError.details,
            hint: retryError.hint,
          }));
          await supabaseServer.storage.from(STORAGE_BUCKET).remove([storagePath]);
          return NextResponse.json(
            { success: false, error: `فشل في حفظ بيانات الملف: ${retryError.message}` },
            { status: 500, headers: rateLimitHeaders }
          );
        }

        console.log('[STUDENT UPLOAD] File uploaded successfully (without visibility):', fileName);
        return NextResponse.json(
          { success: true, data: retryData },
          { status: 201, headers: rateLimitHeaders }
        );
      }

      console.error('[STUDENT UPLOAD] DB insert error:', JSON.stringify({
        message: dbError.message,
        code: dbError.code,
        details: dbError.details,
        hint: dbError.hint,
      }));
      await supabaseServer.storage.from(STORAGE_BUCKET).remove([storagePath]);
      return NextResponse.json(
        { success: false, error: `فشل في حفظ بيانات الملف: ${dbError.message}` },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    console.log('[STUDENT UPLOAD] File uploaded successfully:', fileName);
    return NextResponse.json(
      { success: true, data },
      { status: 201, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[STUDENT UPLOAD] Unexpected error:', error instanceof Error ? {
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
