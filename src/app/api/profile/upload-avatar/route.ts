import { NextResponse } from 'next/server';
import { supabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

const AVATAR_BUCKET = 'avatars';
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Ensure the avatars storage bucket exists, creating it if necessary.
 * Uses the service role key for admin operations.
 */
async function ensureAvatarBucketExists(): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: buckets, error: listError } = await supabaseServer.storage.listBuckets();
    if (listError) {
      console.error('[AVATAR] List buckets error:', listError);
      return { success: false, error: 'فشل في التحقق من التخزين' };
    }

    const bucketExists = buckets?.some((b) => b.name === AVATAR_BUCKET);

    if (!bucketExists) {
      console.log(`[AVATAR] Creating storage bucket: ${AVATAR_BUCKET}`);
      const { error: createError } = await supabaseServer.storage.createBucket(AVATAR_BUCKET, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
      });

      if (createError) {
        console.error('[AVATAR] Bucket creation error:', createError);
        // Bucket might have been created by another request in the meantime
        const { data: recheckBuckets } = await supabaseServer.storage.listBuckets();
        if (!recheckBuckets?.some((b) => b.name === AVATAR_BUCKET)) {
          return { success: false, error: 'فشل في إنشاء حاوية التخزين' };
        }
      }
      console.log(`[AVATAR] Storage bucket "${AVATAR_BUCKET}" created successfully`);
    }

    // Ensure bucket is public
    try {
      const { data: bucketData } = await supabaseServer.storage.getBucket(AVATAR_BUCKET);
      if (bucketData && !bucketData.public) {
        await supabaseServer.storage.updateBucket(AVATAR_BUCKET, { public: true });
        console.log(`[AVATAR] Updated bucket "${AVATAR_BUCKET}" to public`);
      }
    } catch (policyErr) {
      console.warn('[AVATAR] Could not verify/update bucket visibility:', policyErr);
    }

    return { success: true };
  } catch (err) {
    console.error('[AVATAR] ensureAvatarBucketExists error:', err);
    return { success: false, error: 'خطأ في إعداد التخزين' };
  }
}

export async function POST(request: Request) {
  try {
    if (!isSupabaseServerConfigured) {
      console.error('[AVATAR] Server not configured - missing SUPABASE_SERVICE_ROLE_KEY. Env vars available:', {
        hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      });
      return NextResponse.json({ success: false, error: 'خدمة التخزين غير مُعدة. يرجى إضافة SUPABASE_SERVICE_ROLE_KEY في ملف .env' }, { status: 500 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (formErr) {
      console.error('[AVATAR] Failed to parse form data:', formErr);
      return NextResponse.json({ success: false, error: 'فشل في قراءة بيانات الطلب' }, { status: 400 });
    }

    const file = formData.get('avatar') as File | null;
    const userId = formData.get('userId') as string | null;

    if (!file || !userId) {
      console.error('[AVATAR] Missing required fields - file:', !!file, 'userId:', !!userId, 'formKeys:', Array.from(formData.keys()));
      return NextResponse.json({ success: false, error: 'الحقول المطلوبة غير موجودة' }, { status: 400 });
    }

    console.log('[AVATAR] Upload request - userId:', userId, 'file:', file.name, 'size:', file.size, 'type:', file.type);

    // Validate file size (2MB max)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'حجم الصورة يجب أن يكون أقل من 2 ميجابايت' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ success: false, error: 'نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WebP' }, { status: 400 });
    }

    // Ensure bucket exists before upload
    const bucketResult = await ensureAvatarBucketExists();
    if (!bucketResult.success) {
      console.error('[AVATAR] Bucket check failed:', bucketResult.error);
      return NextResponse.json({ success: false, error: bucketResult.error || 'فشل في إعداد حاوية التخزين' }, { status: 500 });
    }

    const fileExt = file.name.split('.').pop() || 'jpg';
    const storagePath = `${userId}/${Date.now()}.${fileExt}`;

    // Convert file to Buffer for server-side upload
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(await file.arrayBuffer());
    } catch (bufErr) {
      console.error('[AVATAR] Failed to read file buffer:', bufErr);
      return NextResponse.json({ success: false, error: 'فشل في قراءة بيانات الصورة' }, { status: 400 });
    }

    // Upload to Supabase Storage using service role (bypasses RLS)
    console.log('[AVATAR] Uploading to storage path:', storagePath);
    const { data: uploadData, error: uploadError } = await supabaseServer.storage
      .from(AVATAR_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error('[AVATAR] Storage upload error:', JSON.stringify({
        message: uploadError.message,
        name: uploadError.name,
        statusCode: (uploadError as unknown as { statusCode?: number }).statusCode,
      }));
      return NextResponse.json({ success: false, error: `فشل في رفع الصورة: ${uploadError.message}` }, { status: 500 });
    }

    console.log('[AVATAR] Storage upload successful, path:', uploadData?.path);

    // Get public URL
    const { data: urlData } = supabaseServer.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : '';

    if (!publicUrl) {
      console.error('[AVATAR] Failed to get public URL for path:', storagePath);
      return NextResponse.json({ success: false, error: 'فشل في الحصول على رابط الصورة' }, { status: 500 });
    }

    // Update user profile
    console.log('[AVATAR] Updating user profile with avatar URL:', publicUrl);
    const { data: updateData, error: updateError } = await supabaseServer
      .from('users')
      .update({ avatar_url: publicUrl })
      .eq('id', userId)
      .select('id, avatar_url');

    if (updateError) {
      console.error('[AVATAR] Profile update error:', JSON.stringify({
        message: updateError.message,
        code: updateError.code,
        details: updateError.details,
        hint: updateError.hint,
      }));
      return NextResponse.json({ success: false, error: `فشل في تحديث الملف الشخصي: ${updateError.message}` }, { status: 500 });
    }

    if (!updateData || updateData.length === 0) {
      console.error('[AVATAR] Profile update returned no rows - user may not exist in users table. UserId:', userId);
      // Upload succeeded but profile update didn't match any row
      // Still return the URL so the client can use it
      return NextResponse.json({
        success: true,
        avatarUrl: publicUrl,
        warning: 'تم رفع الصورة لكن لم يتم تحديث الملف الشخصي - المستخدم غير موجود في جدول المستخدمين',
      });
    }

    console.log('[AVATAR] Avatar uploaded and profile updated successfully for user:', userId);
    return NextResponse.json({ success: true, avatarUrl: publicUrl });
  } catch (err) {
    console.error('[AVATAR] Unexpected error:', err instanceof Error ? {
      message: err.message,
      stack: err.stack,
      name: err.name,
    } : err);
    return NextResponse.json({
      success: false,
      error: `خطأ في الخادم: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`,
    }, { status: 500 });
  }
}
