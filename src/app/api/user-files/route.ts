// =====================================================
// /api/user-files — Personal Files (List, Upload, Delete)
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getUserProfile } from '@/lib/supabase-auth';
import { checkRateLimit, getRateLimitHeaders, sanitizeString, safeErrorResponse } from '@/lib/api-security';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

const STORAGE_BUCKET = 'user-files';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Ensure the user-files storage bucket exists.
 */
async function ensureBucketExists(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseServerConfigured) {
    return {
      success: false,
      error: 'خدمة التخزين غير مُعدة. يرجى إضافة SUPABASE_SERVICE_ROLE_KEY',
    };
  }

  try {
    const { data: buckets, error: listError } = await supabaseServer.storage.listBuckets();
    if (listError) {
      console.error('[USER-FILES] List buckets error:', listError);
      return { success: false, error: 'فشل في التحقق من التخزين' };
    }

    const bucketExists = buckets?.some((b) => b.name === STORAGE_BUCKET);

    if (!bucketExists) {
      console.log(`[USER-FILES] Creating storage bucket: ${STORAGE_BUCKET}`);
      const { error: createError } = await supabaseServer.storage.createBucket(STORAGE_BUCKET, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
      });

      if (createError) {
        // Bucket might have been created by another request
        const { data: recheckBuckets } = await supabaseServer.storage.listBuckets();
        if (!recheckBuckets?.some((b) => b.name === STORAGE_BUCKET)) {
          return { success: false, error: 'فشل في إنشاء حاوية التخزين' };
        }
      }
      console.log(`[USER-FILES] Storage bucket "${STORAGE_BUCKET}" created successfully`);
    }

    // Ensure bucket is public
    try {
      const { data: bucketData } = await supabaseServer.storage.getBucket(STORAGE_BUCKET);
      if (bucketData && !bucketData.public) {
        await supabaseServer.storage.updateBucket(STORAGE_BUCKET, { public: true });
      }
    } catch {
      // Non-critical
    }

    return { success: true };
  } catch (err) {
    console.error('[USER-FILES] ensureBucketExists error:', err);
    return { success: false, error: 'خطأ في إعداد التخزين' };
  }
}

/** GET /api/user-files?type=private|public|shared — List personal files */
export async function GET(request: NextRequest) {
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
    const type = request.nextUrl.searchParams.get('type') || 'private';

    if (type === 'shared') {
      // Files shared WITH the current user by others
      if (!isSupabaseServerConfigured) {
        return NextResponse.json(
          { success: true, data: [] },
          { headers: rateLimitHeaders }
        );
      }

      const { data, error } = await supabaseServer
        .from('file_shares')
        .select('id, file_id, file_type, shared_by, shared_with, created_at')
        .eq('shared_with', user.id)
        .eq('file_type', 'user_file')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[USER-FILES] Fetch shared error:', error);
        // If file_shares table doesn't exist yet, return empty
        return NextResponse.json(
          { success: true, data: [] },
          { headers: rateLimitHeaders }
        );
      }

      // Enrich shares with user names and file info
      const shares = (data || []) as Record<string, unknown>[];

      // Get sharer profiles
      const sharerIds = [...new Set(shares.map((s) => s.shared_by as string).filter(Boolean))];
      const sharedWithIds = [...new Set(shares.map((s) => s.shared_with as string).filter(Boolean))];
      const allUserIds = [...new Set([...sharerIds, ...sharedWithIds])];

      let userMap = new Map<string, { name: string; email: string; role: string; gender?: string; title_id?: string; avatar_url?: string }>();
      if (allUserIds.length > 0) {
        const { data: userProfiles } = await supabaseServer
          .from('users')
          .select('id, name, email, role, gender, title_id, avatar_url')
          .in('id', allUserIds);
        if (userProfiles) {
          userMap = new Map((userProfiles as { id: string; name: string; email: string; role: string; gender?: string; title_id?: string; avatar_url?: string }[]).map((p) => [p.id, p]));
        }
      }

      // Get file info
      const fileIds = shares.map((s) => s.file_id as string).filter(Boolean);
      let fileMap = new Map<string, { file_name: string; file_url: string; file_type: string }>();
      if (fileIds.length > 0) {
        const { data: fileRecords } = await supabaseServer
          .from('user_files')
          .select('id, file_name, file_url, file_type')
          .in('id', fileIds);
        if (fileRecords) {
          fileMap = new Map((fileRecords as { id: string; file_name: string; file_url: string; file_type: string }[]).map((f) => [f.id, f]));
        }
      }

      const enriched = shares.map((share) => {
        const sharer = userMap.get(share.shared_by as string);
        const sharedWith = userMap.get(share.shared_with as string);
        const file = fileMap.get(share.file_id as string);
        return {
          ...share,
          shared_by_name: sharer?.name || 'مستخدم',
          shared_by_role: sharer?.role || '',
          shared_by_gender: sharer?.gender || '',
          shared_by_title_id: sharer?.title_id || '',
          shared_by_avatar_url: sharer?.avatar_url || '',
          shared_with_name: sharedWith?.name || '',
          shared_with_email: sharedWith?.email || '',
          shared_with_role: sharedWith?.role || '',
          file_name: file?.file_name || 'ملف مشترك',
          file_url: file?.file_url || '',
        };
      });

      return NextResponse.json(
        { success: true, data: enriched },
        { headers: rateLimitHeaders }
      );
    }

    // List own files (private or public)
    let query = authResult.supabase
      .from('user_files')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (type === 'private') {
      query = query.eq('visibility', 'private');
    } else if (type === 'public') {
      query = query.eq('visibility', 'public');
    }

    const { data, error } = await query;

    if (error) {
      console.error('[USER-FILES] Fetch error:', error);
      // Table might not exist yet, return empty
      return NextResponse.json(
        { success: true, data: [] },
        { headers: rateLimitHeaders }
      );
    }

    return NextResponse.json(
      { success: true, data: data || [] },
      { headers: rateLimitHeaders }
    );
  } catch (error) {
    console.error('[USER-FILES] List error:', error);
    return safeErrorResponse('حدث خطأ أثناء تحميل الملفات');
  }
}

/** POST /api/user-files — Upload a personal file */
export async function POST(request: NextRequest) {
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
    const profile = await getUserProfile(authResult.supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'الملف الشخصي غير موجود' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: 'فشل في قراءة بيانات الطلب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const file = formData.get('file') as File | null;
    const displayName = formData.get('name') as string | null;
    const visibilityInput = formData.get('visibility') as string | null;
    const descriptionInput = formData.get('description') as string | null;
    const notesInput = formData.get('notes') as string | null;
    const subjectIdInput = formData.get('subjectId') as string | null;

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
      'text/plain': 'txt', 'text/csv': 'csv', 'application/rtf': 'rtf', 'application/zip': 'zip',
      'application/x-rar-compressed': 'rar', 'application/json': 'json',
    };
    const isAsciiExt = /^[a-zA-Z0-9]+$/.test(originalExt);
    const safeExt = isAsciiExt ? originalExt : (mimeExtMap[file.type] || 'bin');
    const storagePath = `${user.id}/${Date.now()}.${safeExt}`;

    // Ensure bucket exists
    const bucketResult = await ensureBucketExists();
    if (!bucketResult.success) {
      return NextResponse.json(
        { success: false, error: bucketResult.error || 'فشل في إعداد حاوية التخزين' },
        { status: 500, headers: rateLimitHeaders }
      );
    }

    // Upload to Supabase Storage
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(await file.arrayBuffer());
    } catch {
      return NextResponse.json(
        { success: false, error: 'فشل في قراءة بيانات الملف' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    const { data: uploadData, error: uploadError } = await supabaseServer.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('[USER-FILES] Storage upload error:', uploadError);
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

    const visibility = (visibilityInput === 'public' || visibilityInput === 'private') ? visibilityInput : 'private';
    const description = descriptionInput?.trim() || null;
    const notes = notesInput?.trim() || null;

    // Validate subject_id if provided (user must be enrolled or teacher)
    let subjectId: string | null = null;
    if (subjectIdInput && subjectIdInput.trim()) {
      const trimmedId = subjectIdInput.trim();
      // Verify the subject exists and user has access
      const { data: subjectCheck } = await authResult.supabase
        .from('subjects')
        .select('teacher_id')
        .eq('id', trimmedId)
        .single();
      if (subjectCheck) {
        const isTeacherOfSubject = subjectCheck.teacher_id === user.id;
        const { data: enrollment } = await authResult.supabase
          .from('subject_students')
          .select('id')
          .eq('subject_id', trimmedId)
          .eq('student_id', user.id)
          .single();
        if (isTeacherOfSubject || enrollment) {
          subjectId = trimmedId;
        }
      }
    }

    // Save metadata to database
    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      file_name: fileName,
      file_url: fileUrl,
      file_type: fileType,
      file_size: file.size,
      visibility,
      description,
      notes,
    };
    if (subjectId) {
      insertPayload.subject_id = subjectId;
    }

    const { data, error: dbError } = await authResult.supabase
      .from('user_files')
      .insert(insertPayload)
      .select()
      .single();

    if (dbError) {
      console.error('[USER-FILES] DB insert error:', dbError);
      // Try to clean up uploaded file
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
    console.error('[USER-FILES] Upload error:', error);
    return safeErrorResponse('حدث خطأ أثناء رفع الملف');
  }
}

/** DELETE /api/user-files?fileId=xxx — Delete a personal file */
export async function DELETE(request: NextRequest) {
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
    const fileId = request.nextUrl.searchParams.get('fileId');

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: 'معرف الملف مطلوب' },
        { status: 400, headers: rateLimitHeaders }
      );
    }

    // Get the file record
    const { data: fileRecord } = await authResult.supabase
      .from('user_files')
      .select('id, file_url, user_id')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single();

    if (!fileRecord) {
      return NextResponse.json(
        { success: false, error: 'الملف غير موجود أو غير مملوك لك' },
        { status: 404, headers: rateLimitHeaders }
      );
    }

    // Extract storage path from URL and remove from storage
    try {
      if (fileRecord.file_url) {
        const urlParts = (fileRecord.file_url as string).split('/storage/v1/object/public/');
        if (urlParts.length > 1) {
          const bucketAndPath = urlParts[1];
          const slashIndex = bucketAndPath.indexOf('/');
          if (slashIndex > 0) {
            const storagePath = bucketAndPath.substring(slashIndex + 1);
            await supabaseServer.storage.from(STORAGE_BUCKET).remove([storagePath]);
          }
        }
      }
    } catch (removeErr) {
      console.error('[USER-FILES] Storage file removal error (non-critical):', removeErr);
    }

    // Delete any shares for this file
    try {
      await supabaseServer
        .from('file_shares')
        .delete()
        .eq('file_id', fileId)
        .eq('file_type', 'user_file');
    } catch {
      // Non-critical
    }

    // Delete the DB record
    const { error: deleteError } = await authResult.supabase
      .from('user_files')
      .delete()
      .eq('id', fileId);

    if (deleteError) {
      console.error('[USER-FILES] DB delete error:', deleteError);
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
    console.error('[USER-FILES] Delete error:', error);
    return safeErrorResponse('حدث خطأ أثناء حذف الملف');
  }
}
