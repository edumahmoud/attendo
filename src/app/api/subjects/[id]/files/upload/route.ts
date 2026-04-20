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

async function ensureBucketExists(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseServerConfigured) {
    return { success: false, error: 'خدمة التخزين غير مُعدة. يرجى إضافة SUPABASE_SERVICE_ROLE_KEY' };
  }

  try {
    const { data: buckets, error: listError } = await supabaseServer.storage.listBuckets();
    if (listError) {
      return { success: false, error: 'فشل في التحقق من التخزين' };
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
          return { success: false, error: 'فشل في إنشاء حاوية التخزين' };
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
    const profile = await getUserProfile(authResult.supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Check if user has access: teacher of this subject OR enrolled student
    const { data: subject } = await supabaseServer
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

    const isTeacher = profile.role === 'teacher' && subject.teacher_id === user.id;
    let isStudent = false;

    if (!isTeacher) {
      const { data: enrollment } = await supabaseServer
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
      isStudent = true;
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const displayName = formData.get('name') as string | null;
    const visibility = formData.get('visibility') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'الملف مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'حجم الملف يتجاوز الحد المسموح (10 ميجابايت)' },
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
    const fileExt = fileName.split('.').pop() || 'bin';
    const storagePath = `${subjectId}/${user.id}/${Date.now()}.${fileExt}`;

    // Ensure bucket exists
    const bucketResult = await ensureBucketExists();
    if (!bucketResult.success) {
      return NextResponse.json(
        { success: false, error: bucketResult.error || 'فشل في إعداد حاوية التخزين' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Upload to Supabase Storage
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseServer.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('[STUDENT UPLOAD] Storage upload error:', uploadError);
      return NextResponse.json(
        { success: false, error: `فشل في رفع الملف: ${uploadError.message}` },
        { status: 500, headers: rateLimitHeaders }
      );
    }

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

    // Save metadata to database
    const insertData: Record<string, unknown> = {
      subject_id: subjectId,
      uploaded_by: user.id,
      file_name: fileName,
      file_url: fileUrl,
      file_type: fileType,
      file_size: file.size,
    };

    // Try to include visibility column (may not exist yet)
    let { data, error: dbError } = await supabaseServer
      .from('subject_files')
      .insert({ ...insertData, visibility: fileVisibility })
      .select()
      .single();

    // If visibility column doesn't exist, retry without it
    if (dbError && dbError.message?.includes('visibility')) {
      const retryResult = await supabaseServer
        .from('subject_files')
        .insert(insertData)
        .select()
        .single();
      data = retryResult.data;
      dbError = retryResult.error;
    }

    if (dbError) {
      console.error('[STUDENT UPLOAD] DB insert error:', dbError);
      await supabaseServer.storage.from(STORAGE_BUCKET).remove([storagePath]);
      return NextResponse.json(
        { success: false, error: `فشل في حفظ بيانات الملف: ${dbError.message}` },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data },
      { status: 201, headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[STUDENT UPLOAD] Unexpected error:', error);
    return safeErrorResponse('حدث خطأ أثناء رفع الملف');
  }
}
